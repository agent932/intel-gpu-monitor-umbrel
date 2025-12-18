const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 80;

// Log ALL incoming requests
app.use((req, res, next) => {
    console.log('='.repeat(60));
    console.log('[WIDGET-SERVER REQUEST]', new Date().toISOString());
    console.log('[METHOD]', req.method);
    console.log('[URL]', req.url);
    console.log('[PATH]', req.path);
    console.log('[HEADERS]', JSON.stringify(req.headers, null, 2));
    console.log('[QUERY]', JSON.stringify(req.query, null, 2));
    console.log('='.repeat(60));
    next();
});

// Store latest GPU data
let latestGpuData = null;
let gpuProcess = null;
let isGpuAvailable = false;

// Parse intel_gpu_top JSON output
function parseGpuData(jsonStr) {
    try {
        const data = JSON.parse(jsonStr);
        return data;
    } catch (e) {
        console.error('[WIDGET-SERVER] Failed to parse GPU data:', e.message);
        return null;
    }
}

// Start intel_gpu_top process
function startGpuMonitor() {
    console.log('[WIDGET-SERVER] Starting intel_gpu_top monitor...');
    console.log('[WIDGET-SERVER] Checking for /dev/dri...');
    
    // Check if /dev/dri exists
    if (!fs.existsSync('/dev/dri')) {
        console.error('[WIDGET-SERVER] ERROR: /dev/dri not found. Intel GPU not available.');
        console.error('[WIDGET-SERVER] Container may not have access to GPU devices.');
        isGpuAvailable = false;
        return;
    }
    
    console.log('[WIDGET-SERVER] /dev/dri found. Listing DRI devices...');
    try {
        const devices = fs.readdirSync('/dev/dri');
        console.log('[WIDGET-SERVER] DRI devices:', devices);
    } catch (e) {
        console.error('[WIDGET-SERVER] Error reading /dev/dri:', e.message);
    }

    console.log('[WIDGET-SERVER] Spawning intel_gpu_top process...');
    // Run intel_gpu_top with JSON output, updating every second
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
                    // We have a complete JSON object
                    const jsonStr = buffer.substring(jsonStart);
                    const parsed = parseGpuData(jsonStr);
                    
                    if (parsed) {
                        isGpuAvailable = true;
                        latestGpuData = {
                            timestamp: Date.now(),
                            data: parsed
                        };
                    }
                    
                    // Reset for next object
                    buffer = '';
                    inObject = false;
                    jsonStart = 0;
                }
            }
        }
        
        // Prevent buffer from growing too large
        if (buffer.length > 100000 && !inObject) {
            buffer = '';
        }
    });

    gpuProcess.stderr.on('data', function(data) {
        const errorMsg = data.toString();
        console.error('[WIDGET-SERVER] intel_gpu_top stderr:', errorMsg);
        
        if (errorMsg.includes('No device found') || errorMsg.includes('Permission denied')) {
            isGpuAvailable = false;
        }
    });

    gpuProcess.on('error', function(err) {
        console.error('[WIDGET-SERVER] Failed to start intel_gpu_top:', err.message);
        isGpuAvailable = false;
    });

    gpuProcess.on('close', function(code) {
        console.log('[WIDGET-SERVER] intel_gpu_top exited with code ' + code);
        isGpuAvailable = false;
        
        setTimeout(function() {
            if (!gpuProcess || gpuProcess.killed) {
                startGpuMonitor();
            }
        }, 5000);
    });
}

// =====================================================
// UMBREL WIDGET API ENDPOINT
// =====================================================
app.get('/widgets/gpu', function(req, res) {
    console.log('[WIDGET] ========== GPU WIDGET REQUEST ==========');
    console.log('[WIDGET] Request received at', new Date().toISOString());
    console.log('[WIDGET] Request URL:', req.url);
    console.log('[WIDGET] Request headers:', JSON.stringify(req.headers, null, 2));
    console.log('[WIDGET] GPU Available:', isGpuAvailable);
    console.log('[WIDGET] Has latest data:', !!latestGpuData);
    console.log('[WIDGET] Latest data keys:', latestGpuData ? Object.keys(latestGpuData) : 'null');
    
    if (!isGpuAvailable || !latestGpuData || !latestGpuData.data) {
        // Return placeholder data when GPU is not available
        console.log('[WIDGET] Returning placeholder data');
        const placeholderData = {
            items: [
                { title: 'GPU Usage', text: '--', subtext: '%' },
                { title: 'Frequency', text: '--', subtext: 'MHz' },
                { title: 'Power', text: '--', subtext: 'W' },
                { title: 'RC6 Idle', text: '--', subtext: '%' }
            ]
        };
        // Ensure all fields are non-empty strings
        placeholderData.items = placeholderData.items.map(item => ({
            title: String(item.title || '--'),
            text: String(item.text || '--'),
            subtext: String(item.subtext || '--')
        }));
        console.log('[WIDGET] Placeholder response:', JSON.stringify(placeholderData, null, 2));
        return res.json(placeholderData);
    }

    var data = latestGpuData.data;
    var engines = data.engines || {};
    var frequency = data.frequency || {};
    var power = data.power || {};
    var rc6 = data.rc6 || {};

    // Calculate overall GPU busy
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

    var actualFreq = frequency.actual || 0;
    var gpuPower = power.GPU || 0;
    var rc6Percent = rc6.value || 0;

    var widgetData = {
        items: [
            { title: 'GPU Usage', text: gpuBusy != null ? gpuBusy.toFixed(1) : '--', subtext: '%' },
            { title: 'Frequency', text: actualFreq != null ? actualFreq.toFixed(0) : '--', subtext: 'MHz' },
            { title: 'Power', text: gpuPower != null ? gpuPower.toFixed(1) : '--', subtext: 'W' },
            { title: 'RC6 Idle', text: rc6Percent != null ? rc6Percent.toFixed(1) : '--', subtext: '%' }
        ]
    };
    // Ensure all fields are non-empty strings
    widgetData.items = widgetData.items.map(item => ({
        title: String(item.title || '--'),
        text: String(item.text || '--'),
        subtext: String(item.subtext || '--')
    }));
    console.log('[WIDGET] Calculated values:');
    console.log('[WIDGET]   GPU Busy:', gpuBusy != null ? gpuBusy.toFixed(1) : '--', '% (from', engineCount, 'engines)');
    console.log('[WIDGET]   Frequency:', actualFreq != null ? actualFreq.toFixed(0) : '--', 'MHz');
    console.log('[WIDGET]   Power:', gpuPower != null ? gpuPower.toFixed(1) : '--', 'W');
    console.log('[WIDGET]   RC6:', rc6Percent != null ? rc6Percent.toFixed(1) : '--', '%');
    console.log('[WIDGET] Final response:', JSON.stringify(widgetData, null, 2));
    console.log('[WIDGET] ================================================');
    res.json(widgetData);
});

// Health check endpoint
app.get('/health', function(req, res) {
    res.json({ 
        status: 'ok',
        gpuAvailable: isGpuAvailable,
        hasData: !!latestGpuData
    });
});

// Start GPU monitoring
startGpuMonitor();

// Start server
app.listen(PORT, '0.0.0.0', function() {
    console.log('[WIDGET-SERVER] Widget server listening on port ' + PORT);
    console.log('[WIDGET-SERVER] GPU available:', isGpuAvailable);
});

// Cleanup on exit
process.on('SIGTERM', function() {
    console.log('[WIDGET-SERVER] Received SIGTERM, shutting down...');
    if (gpuProcess) {
        gpuProcess.kill();
    }
    process.exit(0);
});

process.on('SIGINT', function() {
    console.log('[WIDGET-SERVER] Received SIGINT, shutting down...');
    if (gpuProcess) {
        gpuProcess.kill();
    }
    process.exit(0);
});
