// Netlify Function - Health Check
// Endpoint: GET /.netlify/functions/health

const https = require('https');

// GA Configuration from env
const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID;
const GA_API_SECRET = process.env.GA_API_SECRET;

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=60'
    };

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    const checks = {};
    let overallStatus = 'ok';

    // 1. Node.js version
    checks.nodejs = {
        status: 'ok',
        version: process.version,
        platform: process.platform
    };

    // 2. Environment variables
    checks.env = {
        status: GA_MEASUREMENT_ID && GA_API_SECRET ? 'ok' : 'warning',
        ga_measurement_id_set: !!GA_MEASUREMENT_ID,
        ga_api_secret_set: !!GA_API_SECRET
    };

    if (!GA_MEASUREMENT_ID || !GA_API_SECRET) {
        overallStatus = 'warning';
    }

    // 3. GA Endpoint connectivity
    try {
        const gaCheck = await checkGAEndpoint();
        checks.ga_endpoint = {
            status: gaCheck.reachable ? 'ok' : 'warning',
            response_time_ms: gaCheck.responseTime,
            reachable: gaCheck.reachable
        };
        if (!gaCheck.reachable) {
            overallStatus = 'warning';
        }
    } catch (error) {
        checks.ga_endpoint = {
            status: 'error',
            error: error.message
        };
        overallStatus = 'error';
    }

    // 4. Rate limiting memory
    checks.rate_limiting = {
        status: 'ok',
        note: 'In-memory rate limiting (resets on deploy)'
    };

    // 5. Function info
    checks.function = {
        status: 'ok',
        name: context.functionName,
        remaining_time_ms: context.getRemainingTimeInMillis()
    };

    const response = {
        status: overallStatus,
        service: 'aio-analytics',
        version: '1.0',
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        checks,
        endpoints: {
            track: '/.netlify/functions/track',
            health: '/.netlify/functions/health'
        }
    };

    return {
        statusCode: overallStatus === 'ok' ? 200 : 503,
        headers,
        body: JSON.stringify(response, null, 2)
    };
};

function checkGAEndpoint() {
    return new Promise((resolve) => {
        if (!GA_MEASUREMENT_ID || !GA_API_SECRET) {
            resolve({
                reachable: false,
                responseTime: 0,
                statusCode: 0,
                error: 'Missing environment variables'
            });
            return;
        }

        const start = Date.now();
        const endpoint = `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`;

        const req = https.request(endpoint, {
            method: 'POST',
            timeout: 5000
        }, (res) => {
            resolve({
                reachable: [200, 400, 401, 403].includes(res.statusCode),
                responseTime: Date.now() - start,
                statusCode: res.statusCode
            });
        });

        req.on('error', () => {
            resolve({
                reachable: false,
                responseTime: Date.now() - start,
                statusCode: 0
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({
                reachable: false,
                responseTime: Date.now() - start,
                statusCode: 0
            });
        });

        req.write('{}');
        req.end();
    });
}
