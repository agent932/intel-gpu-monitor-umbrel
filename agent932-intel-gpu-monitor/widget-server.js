const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 80;
const MAIN_SERVER_URL = process.env.MAIN_SERVER_URL || 'http://agent932-intel-gpu-monitor_web_1:8847';

// Log ALL incoming requests
app.use((req, res, next) => {
    console.log('='.repeat(60));
    console.log('[WIDGET-SERVER REQUEST]', new Date().toISOString());
    console.log('[METHOD]', req.method);
    console.log('[URL]', req.url);
    console.log('[PATH]', req.path);
    console.log('='.repeat(60));
    next();
});

// =====================================================
// UMBREL WIDGET API ENDPOINT
// =====================================================
app.get('/widgets/gpu', async function(req, res) {
    console.log('[WIDGET] Fetching GPU data from main server:', MAIN_SERVER_URL);

    try {
        // Fetch data from main server's API endpoint
        const response = await axios.get(MAIN_SERVER_URL + '/api/gpu', {
            timeout: 5000
        });

        const gpuData = response.data;
        console.log('[WIDGET] Received data:', JSON.stringify(gpuData, null, 2));

        if (!gpuData.available || !gpuData.data) {
            console.log('[WIDGET] GPU not available, returning placeholder');
            return res.json({ text: 'GPU: --' });
        }

        const data = gpuData.data;
        const engines = data.engines || {};

        // Calculate overall GPU busy
        let gpuBusy = 0;
        let engineCount = 0;
        const engineKeys = Object.keys(engines);
        for (let i = 0; i < engineKeys.length; i++) {
            const engine = engines[engineKeys[i]];
            if (engine.busy !== undefined) {
                gpuBusy += engine.busy;
                engineCount++;
            }
        }
        gpuBusy = engineCount > 0 ? (gpuBusy / engineCount) : 0;

        const widgetData = {
            text: 'GPU: ' + gpuBusy.toFixed(1) + '%'
        };

        console.log('[WIDGET] Returning:', JSON.stringify(widgetData));
        res.json(widgetData);

    } catch (error) {
        console.error('[WIDGET] Error fetching from main server:', error.message);
        res.json({ text: 'GPU: ERR' });
    }
});

// Health check endpoint
app.get('/health', function(req, res) {
    res.json({
        status: 'ok',
        mainServer: MAIN_SERVER_URL
    });
});

// Start server
app.listen(PORT, '0.0.0.0', function() {
    console.log('[WIDGET-SERVER] Widget server listening on port', PORT);
    console.log('[WIDGET-SERVER] Fetching GPU data from:', MAIN_SERVER_URL);
});
