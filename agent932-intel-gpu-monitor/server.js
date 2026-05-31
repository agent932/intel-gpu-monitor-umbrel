const express = require('express');
const { WebSocketServer } = require('ws');
const { spawn, exec } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const axios = require('axios');

const execAsync = promisify(exec);

const app = express();
const PORT = process.env.PORT || 8847;

// Plex configuration
const PLEX_URL = process.env.PLEX_URL;
const PLEX_TOKEN = process.env.PLEX_TOKEN;
const PLEX_ENABLED = PLEX_URL && PLEX_TOKEN;

app.use((req, res, next) => {
    console.log('[REQUEST]', req.method, req.url);
    next();
});

app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

// Store latest GPU data and processes
let latestGpuData = null;
let latestGpuProcesses = [];
let gpuProcess = null;
let isGpuAvailable = false;

// Parse intel_gpu_top JSON output
function parseGpuData(jsonStr) {
    try {
        const data = JSON.parse(jsonStr);
        return data;
    } catch (e) {
        console.error('Failed to parse GPU data:', e.message);
        return null;
    }
}

// Get processes using the GPU
async function getGpuProcesses() {
    try {
        const processes = [];

        // Method 1: Check /sys/kernel/debug/dri/0/clients
        const clientsPath = '/sys/kernel/debug/dri/0/clients';
        if (fs.existsSync(clientsPath)) {
            const clientsData = await fs.promises.readFile(clientsPath, 'utf8');
            const lines = clientsData.split('\n').slice(1); // Skip header

            for (const line of lines) {
                if (!line.trim()) continue;
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 2) {
                    const command = parts[0];
                    const pid = parts[1];

                    try {
                        const cmdline = await fs.promises.readFile(`/proc/${pid}/cmdline`, 'utf8');
                        const processName = cmdline.replace(/\0/g, ' ').trim() || command;
                        processes.push({ name: processName, pid: parseInt(pid), command: command });
                    } catch (e) {
                        processes.push({ name: command, pid: parseInt(pid), command: command });
                    }
                }
            }
            return processes;
        }

        // Method 2: Use lsof
        try {
            const { stdout } = await execAsync('lsof /dev/dri/render* /dev/dri/card* 2>/dev/null || true');
            const lines = stdout.split('\n').slice(1);
            const seen = new Set();

            for (const line of lines) {
                if (!line.trim()) continue;
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 2) {
                    const command = parts[0];
                    const pid = parts[1];
                    const key = `${command}-${pid}`;

                    if (!seen.has(key)) {
                        seen.add(key);
                        processes.push({ name: command, pid: parseInt(pid), command: command });
                    }
                }
            }
            return processes;
        } catch (e) {
            // lsof not available
        }

        // Method 3: Use fuser
        try {
            const { stdout } = await execAsync('fuser /dev/dri/render* /dev/dri/card* 2>/dev/null || true');
            const pids = stdout.trim().split(/\s+/).filter(p => p && /^\d+$/.test(p));

            for (const pid of pids) {
                try {
                    const cmdline = await fs.promises.readFile(`/proc/${pid}/cmdline`, 'utf8');
                    const command = cmdline.split('\0')[0] || 'unknown';
                    const processName = cmdline.replace(/\0/g, ' ').trim();
                    processes.push({ name: processName || command, pid: parseInt(pid), command: command.split('/').pop() });
                } catch (e) {
                    // Process exited
                }
            }
            return processes;
        } catch (e) {
            // fuser not available
        }

        return [];
    } catch (error) {
        console.error('Error getting GPU processes:', error.message);
        return [];
    }
}

// Get Plex sessions (media sessions + transcode session details)
async function getPlexSessions() {
    if (!PLEX_ENABLED) {
        return [];
    }

    const headers = { 'X-Plex-Token': PLEX_TOKEN, 'Accept': 'application/json' };
    const opts = { headers, timeout: 5000 };

    try {
        const [sessionsResp, transcodeResp] = await Promise.all([
            axios.get(`${PLEX_URL}/status/sessions`, opts),
            axios.get(`${PLEX_URL}/transcode/sessions`, opts).catch(() => ({ data: {} }))
        ]);

        // Build a map of transcode sessions keyed by their session key
        const transcodeList = transcodeResp.data.MediaContainer?.TranscodeSession || [];
        const transcodeMap = {};
        for (const t of transcodeList) {
            transcodeMap[t.key] = t;
        }

        const sessions = sessionsResp.data.MediaContainer?.Metadata || [];
        return sessions.map(session => {
            const tsKey = session.TranscodeSession?.key;
            const t = tsKey ? transcodeMap[tsKey] : null;

            return {
                title:             session.title || 'Unknown',
                type:              session.type  || 'unknown',
                grandparentTitle:  session.grandparentTitle || null,  // show name for episodes
                user:              session.User?.title   || 'Unknown User',
                player:            session.Player?.title || 'Unknown Device',
                playerPlatform:    session.Player?.platform || null,
                state:             session.Player?.state || 'unknown',
                // Source media
                sourceVideoCodec:  session.Media?.[0]?.videoCodec || session.videoCodec || 'unknown',
                sourceAudioCodec:  session.Media?.[0]?.audioCodec || session.audioCodec || 'unknown',
                width:             session.Media?.[0]?.width  || session.width  || 0,
                height:            session.Media?.[0]?.height || session.height || 0,
                bitrate:           session.Media?.[0]?.bitrate || session.bitrate || 0,
                // Transcode decision
                transcodeDecision: session.transcodeDecision || 'unknown',
                // From /transcode/sessions (hardware acceleration + speed)
                hwEncoding:        t?.transcodeHwEncoding    || false,
                hwDecoding:        t?.transcodeHwDecoding    || false,
                hwFullPipeline:    t?.transcodeHwFullPipeline || false,
                transcodeSpeed:    t?.speed    ?? null,
                transcodeProgress: t?.progress ?? null,
                targetVideoCodec:  t?.videoCodec || null,
                targetAudioCodec:  t?.audioCodec || null,
                targetWidth:       t?.width  || null,
                targetHeight:      t?.height || null,
                throttled:         t?.throttled || false,
            };
        });
    } catch (error) {
        console.error('Error fetching Plex sessions:', error.message);
        return [];
    }
}

// Get GPU processes with Plex session correlation
async function getGpuProcessesWithPlex() {
    const processes = await getGpuProcesses();
    const plexSessions = await getPlexSessions();

    const enhancedProcesses = processes.map(process => {
        let plexInfo = null;

        if (process.name.toLowerCase().includes('plex') ||
            process.command.toLowerCase().includes('plex') ||
            process.name.toLowerCase().includes('transcode') ||
            process.name.toLowerCase().includes('ffmpeg')) {

            if (plexSessions.length > 0) {
                const activeSession = plexSessions.find(s => s.state === 'playing' || s.transcodeDecision === 'transcode');
                if (activeSession) {
                    plexInfo = {
                        isTranscoding: true,
                        session: activeSession
                    };
                }
            }
        }

        return { ...process, plexInfo };
    });

    return {
        processes: enhancedProcesses,
        plexSessions: plexSessions,
        plexEnabled: PLEX_ENABLED
    };
}

// Update GPU processes periodically
async function updateGpuProcesses() {
    if (isGpuAvailable) {
        latestGpuProcesses = await getGpuProcessesWithPlex();
    }
}

setInterval(updateGpuProcesses, 2000);

// Start intel_gpu_top process
function startGpuMonitor() {
    console.log('Starting intel_gpu_top monitor...');

    if (!fs.existsSync('/dev/dri')) {
        console.error('ERROR: /dev/dri not found. Intel GPU not available.');
        isGpuAvailable = false;
        return;
    }

    try {
        const devices = fs.readdirSync('/dev/dri');
        console.log('DRI devices:', devices);
    } catch (e) {
        console.error('Error reading /dev/dri:', e.message);
    }

    gpuProcess = spawn('intel_gpu_top', ['-J', '-s', '1000'], {
        stdio: ['pipe', 'pipe', 'pipe']
    });

    let buffer = '';
    let braceCount = 0;
    let inObject = false;
    let jsonStart = 0;

    gpuProcess.stdout.on('data', function(data) {
        const chunk = data.toString();

        for (let i = 0; i < chunk.length; i++) {
            const char = chunk[i];
            buffer += char;

            if (char === '{') {
                if (!inObject) {
                    inObject = true;
                    jsonStart = buffer.length - 1;
                }
                braceCount++;
            } else if (char === '}') {
                braceCount--;

                if (braceCount === 0 && inObject) {
                    const jsonStr = buffer.substring(jsonStart);
                    const parsed = parseGpuData(jsonStr);

                    if (parsed) {
                        isGpuAvailable = true;
                        latestGpuData = {
                            timestamp: Date.now(),
                            data: parsed
                        };
                        broadcastGpuData();
                    }

                    buffer = '';
                    inObject = false;
                    jsonStart = 0;
                }
            }
        }

        // Reset parser if buffer grows too large (malformed/incomplete JSON)
        if (buffer.length > 500000) {
            console.error('JSON buffer overflow, resetting parser state');
            buffer = '';
            inObject = false;
            braceCount = 0;
            jsonStart = 0;
        }
    });

    gpuProcess.stderr.on('data', function(data) {
        const errorMsg = data.toString();
        console.error('intel_gpu_top stderr:', errorMsg);

        if (errorMsg.includes('No device found') || errorMsg.includes('Permission denied')) {
            isGpuAvailable = false;
        }
    });

    gpuProcess.on('error', function(err) {
        console.error('Failed to start intel_gpu_top:', err.message);
        isGpuAvailable = false;
    });

    gpuProcess.on('close', function(code) {
        console.log('intel_gpu_top exited with code ' + code);
        isGpuAvailable = false;
        gpuProcess = null;

        setTimeout(function() {
            if (!gpuProcess) {
                startGpuMonitor();
            }
        }, 5000);
    });
}

// Broadcast GPU data to all connected clients
function broadcastGpuData() {
    const message = JSON.stringify({
        type: 'gpu_data',
        available: isGpuAvailable,
        timestamp: latestGpuData ? latestGpuData.timestamp : null,
        data: latestGpuData ? latestGpuData.data : null,
        processes: latestGpuProcesses
    });

    wss.clients.forEach(function(client) {
        if (client.readyState === 1) {
            client.send(message);
        }
    });
}

// WebSocket connection handler
wss.on('connection', function(ws) {
    console.log('Client connected');

    ws.send(JSON.stringify({
        type: 'status',
        available: isGpuAvailable,
        timestamp: latestGpuData ? latestGpuData.timestamp : null,
        data: latestGpuData ? latestGpuData.data : null,
        processes: latestGpuProcesses
    }));

    ws.on('close', function() {
        console.log('Client disconnected');
    });

    ws.on('error', function(err) {
        console.error('WebSocket error:', err.message);
    });
});

// API endpoint to get GPU processes
app.get('/api/processes', async function(req, res) {
    if (!isGpuAvailable) {
        return res.json({ available: false, processes: [] });
    }

    await updateGpuProcesses();

    res.json({
        available: true,
        processes: latestGpuProcesses.processes || [],
        plexSessions: latestGpuProcesses.plexSessions || [],
        plexEnabled: latestGpuProcesses.plexEnabled || false,
        count: (latestGpuProcesses.processes || []).length
    });
});

// Umbrel widget endpoint
app.get('/widgets/gpu', function(req, res) {
    if (!isGpuAvailable || !latestGpuData || !latestGpuData.data) {
        return res.json({
            items: [
                { title: 'GPU Usage', text: '--', subtext: '%' },
                { title: 'Frequency', text: '--', subtext: 'MHz' },
                { title: 'Power', text: '--', subtext: 'W' },
                { title: 'RC6 Idle', text: '--', subtext: '%' }
            ]
        });
    }

    var data = latestGpuData.data;
    var engines = data.engines || {};
    var frequency = data.frequency || {};
    var power = data.power || {};
    var rc6 = data.rc6 || {};

    var gpuBusy = 0;
    var engineCount = 0;
    var engineKeys = Object.keys(engines);
    for (var i = 0; i < engineKeys.length; i++) {
        var engine = engines[engineKeys[i]];
        if (engine.busy !== undefined) {
            gpuBusy += engine.busy;
            engineCount++;
        }
    }
    gpuBusy = engineCount > 0 ? (gpuBusy / engineCount) : 0;

    res.json({
        items: [
            { title: 'GPU Usage',  text: gpuBusy.toFixed(1),              subtext: '%'   },
            { title: 'Frequency',  text: (frequency.actual || 0).toFixed(0), subtext: 'MHz' },
            { title: 'Power',      text: (power.GPU || 0).toFixed(1),     subtext: 'W'   },
            { title: 'RC6 Idle',   text: (rc6.value || 0).toFixed(1),     subtext: '%'   }
        ]
    });
});

// Health check endpoint
app.get('/health', function(req, res) {
    res.json({ status: 'ok', gpuAvailable: isGpuAvailable, timestamp: Date.now() });
});

// API endpoint for current GPU data
app.get('/api/gpu', function(req, res) {
    res.json({
        available: isGpuAvailable,
        timestamp: latestGpuData ? latestGpuData.timestamp : null,
        data: latestGpuData ? latestGpuData.data : null,
        processes: latestGpuProcesses
    });
});

// Serve the dashboard
app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Graceful shutdown
process.on('SIGTERM', function() {
    console.log('SIGTERM received, shutting down...');
    if (gpuProcess) gpuProcess.kill();
    server.close(function() { process.exit(0); });
});

process.on('SIGINT', function() {
    console.log('SIGINT received, shutting down...');
    if (gpuProcess) gpuProcess.kill();
    server.close(function() { process.exit(0); });
});

// Start the server
server.listen(PORT, function() {
    console.log('Intel GPU Monitor running on port ' + PORT);
    startGpuMonitor();
});
