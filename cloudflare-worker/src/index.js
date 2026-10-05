/**
 * @fileoverview Universal Secure API Proxy – Cloudflare Worker
 * 
 * Provides a secure, serverless backend endpoint proxying requests from the
 * Shamba Watch platform to external intelligence and API backends.
 * All API keys are securely stored as Cloudflare secrets and never exposed to the client.
 * 
 * Includes comprehensive verbose logging for rapid diagnosis and error tracing.
 */

// ============================================================================
// SERVICE CONFIGURATION MAP
// ============================================================================
const API_CONFIG = {
  // Enterprise Intelligence & Inference Service
  'inference': {
    upstream: 'https://api.deepseek.com/chat/completions',
    defaultModel: 'deepseek-chat',
    auth: (key) => ({ 'headers': { 'Authorization': `Bearer ${key}` } }),
    method: 'POST',
    envKeyName: 'INFERENCE_API_KEY',
  },

  // Future extensible services can be added here
};

// ============================================================================
// CORS HEADERS HELPER
// ============================================================================
function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  const reqHeaders = request.headers.get('Access-Control-Request-Headers') || 'Content-Type, Authorization, X-Requested-With, X-Request-Trace-Id';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': reqHeaders,
    'Access-Control-Max-Age': '86400',
  };
}

// ============================================================================
// MAIN WORKER FETCH HANDLER
// ============================================================================
export default {
  async fetch(request, env, ctx) {
    const startTime = Date.now();
    const url = new URL(request.url);
    const corsHeaders = getCorsHeaders(request);

    // 1. Handle CORS Preflight OPTIONS
    if (request.method === 'OPTIONS') {
      console.log(`[CORS_PREFLIGHT] ${request.method} ${url.pathname} from ${request.headers.get('Origin')}`);
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // 2. Parse URL path: /api/{service}
    const pathSegments = url.pathname.split('/').filter(Boolean);

    // Diagnostic health check at root
    if (pathSegments.length === 0 || (pathSegments.length === 1 && pathSegments[0] === 'health')) {
      return new Response(JSON.stringify({
        status: 'online',
        service: 'Shamba Watch Secure Proxy',
        timestamp: new Date().toISOString(),
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    if (pathSegments[0] !== 'api' || !pathSegments[1]) {
      console.warn(`[GATEWAY_400] Invalid endpoint requested: ${url.pathname}`);
      return new Response(JSON.stringify({
        error: 'Invalid endpoint format',
        expected: '/api/{service}',
        received: url.pathname,
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const service = pathSegments[1].toLowerCase();
    const config = API_CONFIG[service];

    // Verbose Ingress Logging
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    const userAgent = request.headers.get('User-Agent') || 'unknown';
    console.log(`[GATEWAY_INGRESS] --------------------------------------------------`);
    console.log(`[GATEWAY_INGRESS] Timestamp:   ${new Date().toISOString()}`);
    console.log(`[GATEWAY_INGRESS] Request:     ${request.method} ${url.pathname}`);
    console.log(`[GATEWAY_INGRESS] Service:     ${service}`);
    console.log(`[GATEWAY_INGRESS] Client IP:   ${clientIp}`);
    console.log(`[GATEWAY_INGRESS] User-Agent:  ${userAgent}`);

    if (!config) {
      console.error(`[GATEWAY_404] Service "${service}" not found in API_CONFIG`);
      return new Response(JSON.stringify({
        error: `Service "${service}" not configured on gateway`,
        availableServices: Object.keys(API_CONFIG),
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 3. Resolve Secret API Key
    const envKeyName = config.envKeyName || `${service.toUpperCase()}_API_KEY`;
    const apiKey = env[envKeyName];

    if (!apiKey) {
      console.error(`[GATEWAY_AUTH_ERROR] Missing environment secret: ${envKeyName}`);
      console.error(`[GATEWAY_AUTH_ERROR] Please set this secret via: wrangler secret put ${envKeyName}`);
      return new Response(JSON.stringify({
        error: `Missing API key credential for service: ${service}`,
        resolution: `Run 'wrangler secret put ${envKeyName}' in your Cloudflare Worker project.`,
        envKey: envKeyName,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 4. Prepare Upstream Call
    const upstreamUrl = env[`${service.toUpperCase()}_UPSTREAM_URL`] || config.upstream;
    const upstreamMethod = config.method || 'POST';
    const authResult = config.auth(apiKey);

    const upstreamHeaders = new Headers({
      'Content-Type': 'application/json',
      'User-Agent': 'Shamba-Watch-Gateway/2.0',
    });

    if (authResult.headers) {
      Object.entries(authResult.headers).forEach(([key, val]) => {
        upstreamHeaders.set(key, val);
      });
    }

    let queryParams = '';
    if (authResult.params) {
      const params = new URLSearchParams(authResult.params);
      queryParams = `?${params.toString()}`;
    }

    // 5. Parse and Sanitize Request Body
    let body = null;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        body = await request.json();
      } catch (err) {
        console.warn(`[GATEWAY_BODY_WARN] Failed to parse JSON body: ${err.message}`);
      }
    }

    // If client didn't specify a model, inject the default model
    if (body && typeof body === 'object') {
      if (!body.model && config.defaultModel) {
        body.model = env[`${service.toUpperCase()}_MODEL`] || config.defaultModel;
        console.log(`[GATEWAY_INJECT] Default model injected: ${body.model}`);
      }
    }

    const fullUpstreamUrl = `${upstreamUrl}${queryParams}`;
    console.log(`[UPSTREAM_DISPATCH] Forwarding to: ${fullUpstreamUrl}`);
    console.log(`[UPSTREAM_DISPATCH] Method: ${upstreamMethod}`);
    if (body) {
      console.log(`[UPSTREAM_DISPATCH] Model: ${body.model || 'N/A'}, Messages: ${body.messages ? body.messages.length : 0}`);
    }

    // 6. Forward Request to Upstream
    try {
      const upstreamResponse = await fetch(fullUpstreamUrl, {
        method: upstreamMethod,
        headers: upstreamHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });

      const latencyMs = Date.now() - startTime;
      console.log(`[UPSTREAM_METRICS] Status: ${upstreamResponse.status} ${upstreamResponse.statusText}`);
      console.log(`[UPSTREAM_METRICS] Latency: ${latencyMs}ms`);

      // Read response body
      const responseData = await upstreamResponse.text();

      // If upstream failed, log verbose error details
      if (!upstreamResponse.ok) {
        console.error(`[UPSTREAM_ERROR] --------------------------------------------------`);
        console.error(`[UPSTREAM_ERROR] Upstream Status: ${upstreamResponse.status} ${upstreamResponse.statusText}`);
        console.error(`[UPSTREAM_ERROR] Target URL:       ${fullUpstreamUrl}`);
        console.error(`[UPSTREAM_ERROR] Error Payload:    ${responseData.slice(0, 1000)}`);
        console.error(`[UPSTREAM_ERROR] --------------------------------------------------`);

        return new Response(JSON.stringify({
          error: 'Upstream Intelligence Provider Error',
          status: upstreamResponse.status,
          statusText: upstreamResponse.statusText,
          details: safeJsonParse(responseData),
          latencyMs,
          timestamp: new Date().toISOString(),
        }), {
          status: upstreamResponse.status,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        });
      }

      // Success Response
      console.log(`[GATEWAY_SUCCESS] Successfully delivered response (${responseData.length} bytes in ${latencyMs}ms)`);
      return new Response(responseData, {
        status: upstreamResponse.status,
        headers: {
          'Content-Type': upstreamResponse.headers.get('Content-Type') || 'application/json',
          'X-Gateway-Latency-Ms': String(latencyMs),
          ...corsHeaders,
        },
      });

    } catch (networkError) {
      const latencyMs = Date.now() - startTime;
      console.error(`[GATEWAY_EXCEPTION] Network fetch failed after ${latencyMs}ms:`, networkError);
      return new Response(JSON.stringify({
        error: 'Gateway network exception connecting to upstream service',
        message: networkError.message,
        stack: networkError.stack,
        latencyMs,
        timestamp: new Date().toISOString(),
      }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }
  },
};

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}
