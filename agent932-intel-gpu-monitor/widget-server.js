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
            return res.json({
                type: 'four-stats',
                refresh: '5s',
                link: '',
                stats: [
                    {
                        title: 'GPU Usage',
                        value: '--'
                    },
                    {
                        title: 'Video Engine',
                        value: '--'
                    },
                    {
                        title: 'Render Engine',
                        value: '--'
                    },
                    {
                        title: 'Power',
                        value: '--'
                    }
                ]
            });
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

        // Get specific engine values
        const videoEngine = engines['Video/0'] || engines['Video'] || { busy: 0 };
        const renderEngine = engines['Render/3D/0'] || engines['Render/3D'] || { busy: 0 };
        const power = data.power || { value: 0 };

        const widgetData = {
            type: 'four-stats',
            refresh: '5s',
            link: '',
            stats: [
                {
                    title: 'GPU Usage',
                    value: gpuBusy.toFixed(1) + '%'
                },
                {
                    title: 'Video Engine',
                    value: videoEngine.busy.toFixed(1) + '%'
                },
                {
                    title: 'Render Engine',
                    value: renderEngine.busy.toFixed(1) + '%'
                },
                {
                    title: 'Power',
                    value: power.value.toFixed(1) + 'W'
                }
            ]
        };

        console.log('[WIDGET] Returning:', JSON.stringify(widgetData));
        res.json(widgetData);

    } catch (error) {
        console.error('[WIDGET] Error fetching from main server:', error.message);
        res.json({
            type: 'four-stats',
            refresh: '5s',
            link: '',
            stats: [
                {
                    title: 'GPU Usage',
                    value: '--'
                },
                {
                    title: 'Video Engine',
                    value: '--'
                },
                {
                    title: 'Render Engine',
                    value: '--'
                },
                {
                    title: 'Power',
                    value: '--'
                }
            ]
        });
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
