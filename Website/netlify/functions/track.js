// Netlify Function - Analytics Tracking API
// Endpoint: POST /.netlify/functions/track
// Converts PHP track.php to Node.js for Netlify

const https = require('https');

// GA Configuration (server-side only in Netlify environment variables)
const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID;
const GA_API_SECRET = process.env.GA_API_SECRET;

if (!GA_MEASUREMENT_ID || !GA_API_SECRET) {
    throw new Error('Missing GA_MEASUREMENT_ID or GA_API_SECRET environment variables');
}

const GA_ENDPOINT = `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`;

// Rate limiting (simple in-memory, resets on deploy)
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 200;
const RATE_LIMIT_WINDOW = 3600000; // 1 hour in ms

exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    // Handle OPTIONS (preflight)
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    // Only POST allowed
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed', method: event.httpMethod })
        };
    }

    try {
        // Parse body
        const data = JSON.parse(event.body);

        // Validation
        if (!data || !data.client_id || !data.events) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid payload: client_id and events required' })
            };
        }

        const clientId = data.client_id;

        // Validate client_id format
        const clientIdRegex = /^[a-f0-9-]{36}$|^[a-z0-9]{20,40}$/i;
        if (!clientIdRegex.test(clientId)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid client_id format' })
            };
        }

        // Rate limiting by IP
        const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';
        const ipHash = Buffer.from(ip).toString('base64').slice(0, 16);

        const now = Date.now();
        const rateData = rateLimitMap.get(ipHash) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW };

        if (now > rateData.resetAt) {
            rateData.count = 0;
            rateData.resetAt = now + RATE_LIMIT_WINDOW;
        }

        rateData.count++;
        rateLimitMap.set(ipHash, rateData);

        if (rateData.count > RATE_LIMIT_MAX) {
            return {
                statusCode: 429,
                headers,
                body: JSON.stringify({
                    error: 'Rate limit exceeded',
                    retry_after: Math.ceil((rateData.resetAt - now) / 1000)
                })
            };
        }

        // Build GA payload
        const payload = {
            client_id: clientId,
            timestamp_micros: Date.now() * 1000,
            events: []
        };

        for (const evt of data.events) {
            if (!evt.name) continue;

            const eventName = evt.name.replace(/[^a-zA-Z0-9_]/g, '');
            if (!eventName) continue;

            const eventParams = {
                engagement_time_msec: 1000
            };

            // Add custom params
            if (evt.params && typeof evt.params === 'object') {
                for (const [key, value] of Object.entries(evt.params)) {
                    const safeKey = key.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40);
                    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                        eventParams[safeKey] = typeof value === 'string' ? value.slice(0, 100) : value;
                    }
                }
            }

            payload.events.push({
                name: eventName,
                params: eventParams
            });
        }

        if (payload.events.length === 0) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'No valid events' })
            };
        }

        // Send to Google Analytics
        const gaResponse = await sendToGA(payload);

        // Logging (Netlify has built-in function logs)
        console.log(JSON.stringify({
            time: new Date().toISOString(),
            ip_hash: ipHash,
            client_id_prefix: clientId.slice(0, 8),
            events: payload.events.length,
            ga_status: gaResponse.statusCode,
            ga_error: gaResponse.error
        }));

        // Response
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                ok: true,
                events_received: payload.events.length,
                client_id: clientId.slice(0, 8) + '...',
                ga_accepted: gaResponse.success
            })
        };

    } catch (error) {
        console.error('Track error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error', message: error.message })
        };
    }
};

// Helper function to send data to GA
function sendToGA(payload) {
    return new Promise((resolve) => {
        const postData = JSON.stringify(payload);

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 10000
        };

        const req = https.request(GA_ENDPOINT, options, (res) => {
            resolve({
                success: res.statusCode >= 200 && res.statusCode < 300,
                statusCode: res.statusCode
            });
        });

        req.on('error', (error) => {
            console.error('GA request error:', error);
            resolve({
                success: false,
                statusCode: 0,
                error: error.message
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({
                success: false,
                statusCode: 0,
                error: 'timeout'
            });
        });

        req.write(postData);
        req.end();
    });
}
