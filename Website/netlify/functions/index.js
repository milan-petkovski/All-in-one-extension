// Netlify Function - API Info
// Endpoint: GET /.netlify/functions/index (or /api/ with redirect)

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
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

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            service: 'All In One Extension Analytics API',
            version: '1.0',
            status: 'active',
            description: 'Netlify Functions proxy for Google Analytics Measurement Protocol v4',
            platform: 'Netlify Functions (Node.js)',
            endpoints: {
                track: {
                    url: '/.netlify/functions/track',
                    method: 'POST',
                    description: 'Send analytics events to Google Analytics',
                    request_body: {
                        client_id: 'string (required) - Unique user identifier',
                        events: 'array (required) - List of events',
                        'events[].name': 'string (required) - Event name',
                        'events[].params': 'object (optional) - Event parameters'
                    }
                },
                health: {
                    url: '/.netlify/functions/health',
                    method: 'GET',
                    description: 'Health check'
                }
            },
            security: {
                ga_secrets_location: 'Netlify Environment Variables (server-side)',
                cors_enabled: true,
                rate_limiting: 'In-memory (200 req/hour/IP, resets on deploy)',
                input_sanitization: true
            },
            github: 'https://github.com/milan-petkovski/All-in-one-extension',
            contact: 'contact@milanwebportal.com'
        }, null, 2)
    };
};
