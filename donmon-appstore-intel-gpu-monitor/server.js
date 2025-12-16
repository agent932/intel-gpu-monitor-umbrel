const express = require('express');
const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8847;

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

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
        console.error('Failed to parse GPU data:', e.message);
        return null;
    }
}

// Start intel_gpu_top process
function startGpuMonitor() {
    console.log('Starting intel_gpu_top monitor...');
    console.log('Checking for /dev/dri...');
    
    // Check if /dev/dri exists
    if (!fs.existsSync('/dev/dri')) {
        console.error('ERROR: /dev/dri not found. Intel GPU not available.');
        console.error('Container may not have access to GPU devices.');
        isGpuAvailable = false;
        return;
    }
    
    console.log('/dev/dri found. Listing DRI devices...');
    try {
        const devices = fs.readdirSync('/dev/dri');
        console.log('DRI devices:', devices);
    } catch (e) {
        console.error('Error reading /dev/dri:', e.message);
    }

    console.log('Spawning intel_gpu_top process...');
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
                        
                        // Broadcast to all connected WebSocket clients
                        broadcastGpuData();
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
        
        setTimeout(function() {
            if (!gpuProcess || gpuProcess.killed) {
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
        data: latestGpuData ? latestGpuData.data : null
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
        data: latestGpuData ? latestGpuData.data : null
    }));
    
    ws.on('close', function() {
        console.log('Client disconnected');
    });
    
    ws.on('error', function(err) {
        console.error('WebSocket error:', err.message);
    });
});

// =====================================================
// UMBREL WIDGET API ENDPOINT
// =====================================================
app.get('/widgets/gpu', function(req, res) {
    if (!isGpuAvailable || !latestGpuData || !latestGpuData.data) {
        // Return placeholder data when GPU is not available
        // Umbrel widgets ONLY return 'items' - type and refresh are defined in umbrel-app.yml
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

    // Umbrel widgets ONLY return 'items' - type and refresh are defined in umbrel-app.yml
    res.json({
        items: [
            { title: 'GPU Usage', text: gpuBusy.toFixed(1), subtext: '%' },
            { title: 'Frequency', text: actualFreq.toFixed(0), subtext: 'MHz' },
            { title: 'Power', text: gpuPower.toFixed(1), subtext: 'W' },
            { title: 'RC6 Idle', text: rc6Percent.toFixed(1), subtext: '%' }
        ]
    });
});

// Health check endpoint
app.get('/health', function(req, res) {
    res.json({ 
        status: 'ok', 
        gpuAvailable: isGpuAvailable,
        timestamp: Date.now()
    });
});

// API endpoint for current GPU data
app.get('/api/gpu', function(req, res) {
    res.json({
        available: isGpuAvailable,
        timestamp: latestGpuData ? latestGpuData.timestamp : null,
        data: latestGpuData ? latestGpuData.data : null
    });
});

// Serve the HTML interface
app.get('/', function(req, res) {
    res.send(getHtmlPage());
});

// Generate the HTML page - Umbrel Style
function getHtmlPage() {
    return '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'    <meta charset="UTF-8">\n' +
'    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'    <title>Intel GPU Monitor</title>\n' +
'    <link rel="preconnect" href="https://fonts.googleapis.com">\n' +
'    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
'    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">\n' +
'    <style>\n' +
'        :root {\n' +
'            --background: #0c0c0e;\n' +
'            --card-bg: #141416;\n' +
'            --card-border: rgba(255, 255, 255, 0.06);\n' +
'            --card-hover: #1a1a1d;\n' +
'            --text-primary: #ffffff;\n' +
'            --text-secondary: rgba(255, 255, 255, 0.5);\n' +
'            --text-tertiary: rgba(255, 255, 255, 0.3);\n' +
'            --accent: #5351FB;\n' +
'            --accent-secondary: #7B79FF;\n' +
'            --success: #00C853;\n' +
'            --warning: #FFB800;\n' +
'            --danger: #FF3B30;\n' +
'            --progress-bg: rgba(255, 255, 255, 0.08);\n' +
'        }\n' +
'        \n' +
'        * { margin: 0; padding: 0; box-sizing: border-box; }\n' +
'        \n' +
'        body {\n' +
'            font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;\n' +
'            background: var(--background);\n' +
'            min-height: 100vh;\n' +
'            color: var(--text-primary);\n' +
'            padding: 24px;\n' +
'            -webkit-font-smoothing: antialiased;\n' +
'            -moz-osx-font-smoothing: grayscale;\n' +
'        }\n' +
'        \n' +
'        .container {\n' +
'            max-width: 1200px;\n' +
'            margin: 0 auto;\n' +
'        }\n' +
'        \n' +
'        header {\n' +
'            margin-bottom: 32px;\n' +
'        }\n' +
'        \n' +
'        .header-content {\n' +
'            display: flex;\n' +
'            align-items: center;\n' +
'            gap: 16px;\n' +
'            margin-bottom: 8px;\n' +
'        }\n' +
'        \n' +
'        .app-icon {\n' +
'            width: 48px;\n' +
'            height: 48px;\n' +
'            background: linear-gradient(135deg, #5351FB 0%, #7B79FF 100%);\n' +
'            border-radius: 12px;\n' +
'            display: flex;\n' +
'            align-items: center;\n' +
'            justify-content: center;\n' +
'            font-size: 24px;\n' +
'        }\n' +
'        \n' +
'        h1 {\n' +
'            font-size: 24px;\n' +
'            font-weight: 600;\n' +
'            letter-spacing: -0.02em;\n' +
'        }\n' +
'        \n' +
'        .status-pill {\n' +
'            display: inline-flex;\n' +
'            align-items: center;\n' +
'            gap: 6px;\n' +
'            padding: 6px 12px;\n' +
'            background: rgba(255, 255, 255, 0.05);\n' +
'            border-radius: 100px;\n' +
'            font-size: 13px;\n' +
'            color: var(--text-secondary);\n' +
'        }\n' +
'        \n' +
'        .status-dot {\n' +
'            width: 8px;\n' +
'            height: 8px;\n' +
'            border-radius: 50%;\n' +
'            background: var(--success);\n' +
'            box-shadow: 0 0 8px var(--success);\n' +
'        }\n' +
'        \n' +
'        .status-dot.disconnected {\n' +
'            background: var(--danger);\n' +
'            box-shadow: 0 0 8px var(--danger);\n' +
'        }\n' +
'        \n' +
'        .status-dot.waiting {\n' +
'            background: var(--warning);\n' +
'            box-shadow: 0 0 8px var(--warning);\n' +
'        }\n' +
'        \n' +
'        .grid {\n' +
'            display: grid;\n' +
'            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));\n' +
'            gap: 16px;\n' +
'        }\n' +
'        \n' +
'        .card {\n' +
'            background: var(--card-bg);\n' +
'            border-radius: 16px;\n' +
'            padding: 20px;\n' +
'            border: 1px solid var(--card-border);\n' +
'            transition: background 0.2s ease;\n' +
'        }\n' +
'        \n' +
'        .card:hover {\n' +
'            background: var(--card-hover);\n' +
'        }\n' +
'        \n' +
'        .card-header {\n' +
'            display: flex;\n' +
'            align-items: center;\n' +
'            gap: 12px;\n' +
'            margin-bottom: 20px;\n' +
'        }\n' +
'        \n' +
'        .card-icon {\n' +
'            width: 36px;\n' +
'            height: 36px;\n' +
'            border-radius: 10px;\n' +
'            display: flex;\n' +
'            align-items: center;\n' +
'            justify-content: center;\n' +
'        }\n' +
'        \n' +
'        .card-icon svg {\n' +
'            width: 20px;\n' +
'            height: 20px;\n' +
'        }\n' +
'        \n' +
'        .card-icon.purple { background: rgba(83, 81, 251, 0.15); color: #7B79FF; }\n' +
'        .card-icon.blue { background: rgba(59, 130, 246, 0.15); color: #60A5FA; }\n' +
'        .card-icon.green { background: rgba(34, 197, 94, 0.15); color: #4ADE80; }\n' +
'        .card-icon.orange { background: rgba(249, 115, 22, 0.15); color: #FB923C; }\n' +
'        .card-icon.pink { background: rgba(236, 72, 153, 0.15); color: #F472B6; }\n' +
'        .card-icon.cyan { background: rgba(6, 182, 212, 0.15); color: #22D3EE; }\n' +
'        \n' +
'        .card-title {\n' +
'            font-size: 14px;\n' +
'            font-weight: 500;\n' +
'            color: var(--text-secondary);\n' +
'        }\n' +
'        \n' +
'        .metric {\n' +
'            margin-bottom: 16px;\n' +
'        }\n' +
'        \n' +
'        .metric:last-child {\n' +
'            margin-bottom: 0;\n' +
'        }\n' +
'        \n' +
'        .metric-row {\n' +
'            display: flex;\n' +
'            justify-content: space-between;\n' +
'            align-items: baseline;\n' +
'            margin-bottom: 8px;\n' +
'        }\n' +
'        \n' +
'        .metric-label {\n' +
'            font-size: 13px;\n' +
'            color: var(--text-tertiary);\n' +
'        }\n' +
'        \n' +
'        .metric-value {\n' +
'            font-size: 20px;\n' +
'            font-weight: 600;\n' +
'            font-variant-numeric: tabular-nums;\n' +
'        }\n' +
'        \n' +
'        .metric-unit {\n' +
'            font-size: 13px;\n' +
'            color: var(--text-tertiary);\n' +
'            margin-left: 4px;\n' +
'            font-weight: 400;\n' +
'        }\n' +
'        \n' +
'        .progress-bar {\n' +
'            height: 6px;\n' +
'            background: var(--progress-bg);\n' +
'            border-radius: 3px;\n' +
'            overflow: hidden;\n' +
'        }\n' +
'        \n' +
'        .progress-fill {\n' +
'            height: 100%;\n' +
'            border-radius: 3px;\n' +
'            transition: width 0.3s ease;\n' +
'        }\n' +
'        \n' +
'        .progress-fill.purple { background: linear-gradient(90deg, #5351FB, #7B79FF); }\n' +
'        .progress-fill.blue { background: linear-gradient(90deg, #3B82F6, #60A5FA); }\n' +
'        .progress-fill.green { background: linear-gradient(90deg, #22C55E, #4ADE80); }\n' +
'        .progress-fill.orange { background: linear-gradient(90deg, #F97316, #FB923C); }\n' +
'        .progress-fill.cyan { background: linear-gradient(90deg, #06B6D4, #22D3EE); }\n' +
'        \n' +
'        .engines-grid {\n' +
'            display: grid;\n' +
'            grid-template-columns: repeat(2, 1fr);\n' +
'            gap: 8px;\n' +
'        }\n' +
'        \n' +
'        .engine-item {\n' +
'            background: rgba(255, 255, 255, 0.03);\n' +
'            padding: 12px;\n' +
'            border-radius: 8px;\n' +
'            border: 1px solid var(--card-border);\n' +
'        }\n' +
'        \n' +
'        .engine-name {\n' +
'            font-size: 11px;\n' +
'            color: var(--text-tertiary);\n' +
'            text-transform: uppercase;\n' +
'            letter-spacing: 0.5px;\n' +
'            margin-bottom: 4px;\n' +
'        }\n' +
'        \n' +
'        .engine-value {\n' +
'            font-size: 16px;\n' +
'            font-weight: 600;\n' +
'            font-variant-numeric: tabular-nums;\n' +
'        }\n' +
'        \n' +
'        .raw-data {\n' +
'            margin-top: 24px;\n' +
'            background: var(--card-bg);\n' +
'            border-radius: 16px;\n' +
'            padding: 20px;\n' +
'            border: 1px solid var(--card-border);\n' +
'        }\n' +
'        \n' +
'        .raw-data-header {\n' +
'            display: flex;\n' +
'            justify-content: space-between;\n' +
'            align-items: center;\n' +
'            margin-bottom: 16px;\n' +
'            cursor: pointer;\n' +
'        }\n' +
'        \n' +
'        .raw-data h3 {\n' +
'            font-size: 14px;\n' +
'            font-weight: 500;\n' +
'            color: var(--text-secondary);\n' +
'        }\n' +
'        \n' +
'        .raw-data pre {\n' +
'            background: rgba(0, 0, 0, 0.3);\n' +
'            padding: 16px;\n' +
'            border-radius: 8px;\n' +
'            overflow-x: auto;\n' +
'            font-family: "SF Mono", Monaco, monospace;\n' +
'            font-size: 12px;\n' +
'            color: var(--text-secondary);\n' +
'            max-height: 300px;\n' +
'            overflow-y: auto;\n' +
'            line-height: 1.5;\n' +
'        }\n' +
'        \n' +
'        .error-card {\n' +
'            background: rgba(255, 59, 48, 0.1);\n' +
'            border: 1px solid rgba(255, 59, 48, 0.2);\n' +
'            color: #FF6B6B;\n' +
'            padding: 24px;\n' +
'            border-radius: 16px;\n' +
'            text-align: center;\n' +
'        }\n' +
'        \n' +
'        .error-card h3 {\n' +
'            margin-bottom: 8px;\n' +
'            font-weight: 600;\n' +
'        }\n' +
'        \n' +
'        .big-number {\n' +
'            font-size: 32px;\n' +
'            font-weight: 700;\n' +
'            letter-spacing: -0.02em;\n' +
'        }\n' +
'        \n' +
'        @media (max-width: 768px) {\n' +
'            body { padding: 16px; }\n' +
'            h1 { font-size: 20px; }\n' +
'            .grid { grid-template-columns: 1fr; }\n' +
'            .engines-grid { grid-template-columns: 1fr; }\n' +
'            .app-icon { width: 40px; height: 40px; }\n' +
'        }\n' +
'    </style>\n' +
'</head>\n' +
'<body>\n' +
'    <div class="container">\n' +
'        <header>\n' +
'            <div class="header-content">\n' +
'                <div class="app-icon">\n' +
'                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n' +
'                        <rect x="4" y="4" width="16" height="16" rx="2"/>\n' +
'                        <path d="M9 9h6v6H9z"/>\n' +
'                    </svg>\n' +
'                </div>\n' +
'                <h1>Intel GPU Monitor</h1>\n' +
'            </div>\n' +
'            <div class="status-pill">\n' +
'                <div id="status-dot" class="status-dot waiting"></div>\n' +
'                <span id="status-text">Connecting...</span>\n' +
'            </div>\n' +
'        </header>\n' +
'        \n' +
'        <div id="content">\n' +
'            <div class="card">\n' +
'                <p style="text-align: center; color: var(--text-secondary); padding: 40px 0;">Waiting for GPU data...</p>\n' +
'            </div>\n' +
'        </div>\n' +
'        \n' +
'        <div class="raw-data">\n' +
'            <div class="raw-data-header" onclick="toggleRaw()">\n' +
'                <h3>Raw JSON Output</h3>\n' +
'                <span id="raw-toggle" style="color: var(--text-tertiary); font-size: 12px;">Show</span>\n' +
'            </div>\n' +
'            <pre id="raw-json" style="display: none;">Waiting for data...</pre>\n' +
'        </div>\n' +
'    </div>\n' +
'    \n' +
'    <script>\n' +
'        var statusDot = document.getElementById("status-dot");\n' +
'        var statusText = document.getElementById("status-text");\n' +
'        var content = document.getElementById("content");\n' +
'        var rawJson = document.getElementById("raw-json");\n' +
'        var rawToggle = document.getElementById("raw-toggle");\n' +
'        var ws;\n' +
'        var reconnectInterval;\n' +
'        var rawVisible = false;\n' +
'        \n' +
'        function toggleRaw() {\n' +
'            rawVisible = !rawVisible;\n' +
'            rawJson.style.display = rawVisible ? "block" : "none";\n' +
'            rawToggle.textContent = rawVisible ? "Hide" : "Show";\n' +
'        }\n' +
'        \n' +
'        function connect() {\n' +
'            var protocol = window.location.protocol === "https:" ? "wss:" : "ws:";\n' +
'            ws = new WebSocket(protocol + "//" + window.location.host + "/ws");\n' +
'            \n' +
'            ws.onopen = function() {\n' +
'                statusDot.className = "status-dot";\n' +
'                statusText.textContent = "Connected";\n' +
'                clearInterval(reconnectInterval);\n' +
'            };\n' +
'            \n' +
'            ws.onmessage = function(event) {\n' +
'                try {\n' +
'                    var message = JSON.parse(event.data);\n' +
'                    handleMessage(message);\n' +
'                } catch (e) {\n' +
'                    console.error("Failed to parse message:", e);\n' +
'                }\n' +
'            };\n' +
'            \n' +
'            ws.onclose = function() {\n' +
'                statusDot.className = "status-dot disconnected";\n' +
'                statusText.textContent = "Reconnecting...";\n' +
'                reconnectInterval = setInterval(function() {\n' +
'                    connect();\n' +
'                }, 3000);\n' +
'            };\n' +
'            \n' +
'            ws.onerror = function(error) {\n' +
'                console.error("WebSocket error:", error);\n' +
'            };\n' +
'        }\n' +
'        \n' +
'        function handleMessage(message) {\n' +
'            if (!message.available || !message.data) {\n' +
'                content.innerHTML = \'<div class="error-card"><h3>GPU Not Available</h3><p>Waiting for GPU data...</p></div>\';\n' +
'                rawJson.textContent = "No GPU data available";\n' +
'                return;\n' +
'            }\n' +
'            \n' +
'            var data = message.data;\n' +
'            rawJson.textContent = JSON.stringify(data, null, 2);\n' +
'            \n' +
'            var engines = data.engines || {};\n' +
'            var frequency = data.frequency || {};\n' +
'            var power = data.power || {};\n' +
'            var rc6 = data.rc6 || {};\n' +
'            \n' +
'            var gpuBusy = 0;\n' +
'            var engineCount = 0;\n' +
'            var engineKeys = Object.keys(engines);\n' +
'            for (var i = 0; i < engineKeys.length; i++) {\n' +
'                var engine = engines[engineKeys[i]];\n' +
'                if (engine.busy !== undefined) {\n' +
'                    gpuBusy += engine.busy;\n' +
'                    engineCount++;\n' +
'                }\n' +
'            }\n' +
'            gpuBusy = engineCount > 0 ? (gpuBusy / engineCount) : 0;\n' +
'            \n' +
'            var render3d = engines["Render/3D/0"] || engines["Render/3D"] || {};\n' +
'            var blitter = engines["Blitter/0"] || {};\n' +
'            var video0 = engines["Video/0"] || {};\n' +
'            var video1 = engines["Video/1"] || {};\n' +
'            var videoEnhance = engines["VideoEnhance/0"] || {};\n' +
'            \n' +
'            var actualFreq = frequency.actual || 0;\n' +
'            var requestedFreq = frequency.requested || 0;\n' +
'            var gpuPower = power.GPU || 0;\n' +
'            var pkgPower = power.Package || 0;\n' +
'            var rc6Percent = rc6.value || 0;\n' +
'            \n' +
'            var engineItemsHtml = "";\n' +
'            for (var j = 0; j < engineKeys.length; j++) {\n' +
'                var ename = engineKeys[j];\n' +
'                var eng = engines[ename];\n' +
'                var busy = (eng.busy || 0).toFixed(1);\n' +
'                engineItemsHtml += \'<div class="engine-item"><div class="engine-name">\' + ename + \'</div><div class="engine-value">\' + busy + \'%</div></div>\';\n' +
'            }\n' +
'            \n' +
'            var iconGpu = \'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9z"/></svg>\';\n' +
'            var iconFreq = \'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>\';\n' +
'            var iconPower = \'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64A9 9 0 1 1 5.64 6.64"/><line x1="12" y1="2" x2="12" y2="12"/></svg>\';\n' +
'            var iconRender = \'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>\';\n' +
'            var iconVideo = \'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>\';\n' +
'            var iconAll = \'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>\';\n' +
'            \n' +
'            content.innerHTML = \'<div class="grid">\' +\n' +
'                \'<div class="card"><div class="card-header"><div class="card-icon purple">\' + iconGpu + \'</div><span class="card-title">GPU Utilization</span></div>\' +\n' +
'                \'<div class="metric"><div class="metric-row"><span class="metric-label">Overall Busy</span><span class="metric-value">\' + gpuBusy.toFixed(1) + \'<span class="metric-unit">%</span></span></div>\' +\n' +
'                \'<div class="progress-bar"><div class="progress-fill purple" style="width: \' + Math.min(gpuBusy, 100) + \'%"></div></div></div>\' +\n' +
'                \'<div class="metric"><div class="metric-row"><span class="metric-label">Power Saving (RC6)</span><span class="metric-value">\' + rc6Percent.toFixed(1) + \'<span class="metric-unit">%</span></span></div>\' +\n' +
'                \'<div class="progress-bar"><div class="progress-fill cyan" style="width: \' + Math.min(rc6Percent, 100) + \'%"></div></div></div></div>\' +\n' +
'                \n' +
'                \'<div class="card"><div class="card-header"><div class="card-icon blue">\' + iconFreq + \'</div><span class="card-title">Frequency</span></div>\' +\n' +
'                \'<div class="metric"><div class="metric-row"><span class="metric-label">Actual</span><span class="metric-value big-number">\' + actualFreq.toFixed(0) + \'<span class="metric-unit">MHz</span></span></div></div>\' +\n' +
'                \'<div class="metric"><div class="metric-row"><span class="metric-label">Requested</span><span class="metric-value">\' + requestedFreq.toFixed(0) + \'<span class="metric-unit">MHz</span></span></div></div></div>\' +\n' +
'                \n' +
'                \'<div class="card"><div class="card-header"><div class="card-icon orange">\' + iconPower + \'</div><span class="card-title">Power</span></div>\' +\n' +
'                \'<div class="metric"><div class="metric-row"><span class="metric-label">GPU</span><span class="metric-value big-number">\' + gpuPower.toFixed(1) + \'<span class="metric-unit">W</span></span></div></div>\' +\n' +
'                \'<div class="metric"><div class="metric-row"><span class="metric-label">Package</span><span class="metric-value">\' + pkgPower.toFixed(1) + \'<span class="metric-unit">W</span></span></div></div></div>\' +\n' +
'                \n' +
'                \'<div class="card"><div class="card-header"><div class="card-icon pink">\' + iconRender + \'</div><span class="card-title">Render Engine</span></div>\' +\n' +
'                \'<div class="metric"><div class="metric-row"><span class="metric-label">3D/Render</span><span class="metric-value">\' + (render3d.busy || 0).toFixed(1) + \'<span class="metric-unit">%</span></span></div>\' +\n' +
'                \'<div class="progress-bar"><div class="progress-fill purple" style="width: \' + Math.min(render3d.busy || 0, 100) + \'%"></div></div></div>\' +\n' +
'                \'<div class="metric"><div class="metric-row"><span class="metric-label">Blitter</span><span class="metric-value">\' + (blitter.busy || 0).toFixed(1) + \'<span class="metric-unit">%</span></span></div>\' +\n' +
'                \'<div class="progress-bar"><div class="progress-fill purple" style="width: \' + Math.min(blitter.busy || 0, 100) + \'%"></div></div></div></div>\' +\n' +
'                \n' +
'                \'<div class="card"><div class="card-header"><div class="card-icon green">\' + iconVideo + \'</div><span class="card-title">Video Engines</span></div>\' +\n' +
'                \'<div class="metric"><div class="metric-row"><span class="metric-label">Video/0</span><span class="metric-value">\' + (video0.busy || 0).toFixed(1) + \'<span class="metric-unit">%</span></span></div>\' +\n' +
'                \'<div class="progress-bar"><div class="progress-fill green" style="width: \' + Math.min(video0.busy || 0, 100) + \'%"></div></div></div>\' +\n' +
'                \'<div class="metric"><div class="metric-row"><span class="metric-label">Video/1</span><span class="metric-value">\' + (video1.busy || 0).toFixed(1) + \'<span class="metric-unit">%</span></span></div>\' +\n' +
'                \'<div class="progress-bar"><div class="progress-fill green" style="width: \' + Math.min(video1.busy || 0, 100) + \'%"></div></div></div>\' +\n' +
'                \'<div class="metric"><div class="metric-row"><span class="metric-label">VideoEnhance</span><span class="metric-value">\' + (videoEnhance.busy || 0).toFixed(1) + \'<span class="metric-unit">%</span></span></div>\' +\n' +
'                \'<div class="progress-bar"><div class="progress-fill green" style="width: \' + Math.min(videoEnhance.busy || 0, 100) + \'%"></div></div></div></div>\' +\n' +
'                \n' +
'                \'<div class="card"><div class="card-header"><div class="card-icon cyan">\' + iconAll + \'</div><span class="card-title">All Engines</span></div>\' +\n' +
'                \'<div class="engines-grid">\' + engineItemsHtml + \'</div></div>\' +\n' +
'                \'</div>\';\n' +
'        }\n' +
'        \n' +
'        connect();\n' +
'    </script>\n' +
'</body>\n' +
'</html>'
;
}

// Graceful shutdown
process.on('SIGTERM', function() {
    console.log('SIGTERM received, shutting down...');
    if (gpuProcess) {
        gpuProcess.kill();
    }
    server.close(function() {
        process.exit(0);
    });
});

process.on('SIGINT', function() {
    console.log('SIGINT received, shutting down...');
    if (gpuProcess) {
        gpuProcess.kill();
    }
    server.close(function() {
        process.exit(0);
    });
});

// Start the server
server.listen(PORT, function() {
    console.log('Intel GPU Monitor running on port ' + PORT);
    startGpuMonitor();
});
