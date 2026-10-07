/**
 * @fileoverview Universal Secure Telemetry & AI Proxy – Cloudflare Worker
 * 
 * Provides:
 * 1. LoRaWAN & IoT Telemetry Ingestion Pipeline (/api/telemetry/ingest, /api/ingest).
 * 2. Mathematical Sliding-Window Token Bucket Rate Limiter protecting Firestore quotas:
 *    - 20,000 writes/day free quota -> sustained safe rate: 2.0 writes per 10 seconds.
 *    - Max burst capacity: 5 writes per 10 seconds.
 *    - Per-device minimum debounce: 1 write per 10 seconds per unique device.
 * 3. Polymorphic LoRaWAN Telemetry Decoder (5FEE hex, Cayenne LPP, WiFi, JSON).
 * 4. Direct Firestore REST Client writing validated immutable readings.
 * 5. Telemetry Rate Limit Diagnostics Endpoint (/api/telemetry/rate-limit, /api/rate-limit).
 * 6. Enterprise Intelligence & Inference Proxy (/api/inference -> DeepSeek).
 * 
 * Includes comprehensive CORS headers and verbose diagnostic logging.
 */

import { FirestoreRateLimiter } from './rate-limiter.js';
import { decodeLoRaMessage } from './lorawan-decoder.js';
import { FirestoreClient } from './firestore-client.js';

// ============================================================================
// SINGLETON GATEWAY SERVICES (Preserved across warm isolate requests)
// ============================================================================
const rateLimiter = new FirestoreRateLimiter({
  dailyQuota: 20000,
  safetyReservePct: 15,
  burstCapacity: 5.0,        // Max 5 writes in any 10-second window
  refillRatePerSec: 0.20,     // 2.0 writes per 10 seconds sustained
  deviceDebounceMs: 10000,    // 10s per unique device (lock contention & duplicate filter)
});

// Cache for delta computation: Map<sensorId, lastValue>
const sensorValueCache = new Map();

// ============================================================================
// SERVICE CONFIGURATION MAP (External Intelligence APIs)
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
};

// ============================================================================
// CORS HEADERS HELPER
// ============================================================================
function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  const reqHeaders = request.headers.get('Access-Control-Request-Headers') || 'Content-Type, Authorization, X-Requested-With, X-Request-Trace-Id';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
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
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // 2. Normalize path
    const pathSegments = url.pathname.split('/').filter(Boolean);

    // ------------------------------------------------------------------------
    // HEALTH ENDPOINTS: / or /health or /api/health or /api/telemetry/health
    // ------------------------------------------------------------------------
    if (
      pathSegments.length === 0 ||
      (pathSegments.length === 1 && (pathSegments[0] === 'health' || pathSegments[0] === 'api')) ||
      (pathSegments.length === 2 && pathSegments[0] === 'api' && pathSegments[1] === 'health') ||
      (pathSegments.length === 3 && pathSegments[0] === 'api' && pathSegments[1] === 'telemetry' && pathSegments[2] === 'health')
    ) {
      return new Response(JSON.stringify({
        status: 'online',
        service: 'Shamba Watch Telemetry & AI Gateway',
        version: '2.1.0',
        timestamp: new Date().toISOString(),
        endpoints: {
          telemetryIngest: 'POST /api/telemetry/ingest (alias: POST /api/ingest)',
          rateLimitStatus: 'GET /api/telemetry/rate-limit (alias: GET /api/rate-limit)',
          aiInference: 'POST /api/inference',
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // ------------------------------------------------------------------------
    // RATE LIMIT DIAGNOSTICS: /api/telemetry/rate-limit or /api/rate-limit
    // ------------------------------------------------------------------------
    if (
      (pathSegments.length === 3 && pathSegments[0] === 'api' && pathSegments[1] === 'telemetry' && pathSegments[2] === 'rate-limit') ||
      (pathSegments.length === 2 && pathSegments[0] === 'api' && pathSegments[1] === 'rate-limit')
    ) {
      const diagnostics = rateLimiter.getDiagnostics();
      return new Response(JSON.stringify(diagnostics, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(diagnostics.mathematicalModel.maxBurstWritesPer10s),
          'X-RateLimit-Remaining': String(diagnostics.liveState.availableTokens),
          'X-RateLimit-Safe-10s': String(diagnostics.mathematicalModel.safeSustainedWritesPer10s),
          ...corsHeaders,
        },
      });
    }

    // ------------------------------------------------------------------------
    // TELEMETRY INGESTION: POST /api/telemetry/ingest or POST /api/ingest
    // ------------------------------------------------------------------------
    if (
      (pathSegments[0] === 'api' && pathSegments[1] === 'telemetry' && pathSegments[2] === 'ingest') ||
      (pathSegments[0] === 'api' && pathSegments[1] === 'ingest')
    ) {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed. Use POST for telemetry ingestion.' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      return handleTelemetryIngest(request, env, corsHeaders, startTime);
    }

    // ------------------------------------------------------------------------
    // AI INFERENCE & SERVICE PROXY: /api/{service} (e.g. /api/inference)
    // ------------------------------------------------------------------------
    if (pathSegments[0] === 'api' && pathSegments[1]) {
      const service = pathSegments[1].toLowerCase();
      const config = API_CONFIG[service];

      if (config) {
        return handleServiceProxy(request, env, service, config, corsHeaders, startTime);
      }
    }

    // Unrecognized route
    return new Response(JSON.stringify({
      error: 'Not Found',
      received: url.pathname,
      validEndpoints: ['/api/telemetry/ingest', '/api/telemetry/rate-limit', '/api/inference', '/health'],
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  },
};

// ============================================================================
// TELEMETRY INGESTION HANDLER
// ============================================================================
async function handleTelemetryIngest(request, env, corsHeaders, startTime) {
  let rawBody = null;
  const contentType = request.headers.get('Content-Type') || '';

  try {
    if (contentType.includes('application/json')) {
      rawBody = await request.json();
    } else {
      rawBody = await request.text();
    }
  } catch (err) {
    return new Response(JSON.stringify({
      error: 'Malformed request payload',
      details: err.message,
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Handle single packet or batch array of packets
  const packets = Array.isArray(rawBody) ? rawBody : [rawBody];
  const results = [];

  const projectId = env.FIREBASE_PROJECT_ID || 'shambawatch';
  const authToken = env.FIREBASE_AUTH_TOKEN || null;
  const firestoreClient = new FirestoreClient({ projectId, authToken });

  for (const packet of packets) {
    // 1. Decode polymorphic payload
    const decoded = decodeLoRaMessage(packet);

    // 2. Calculate delta against cached previous value
    const prevVal = sensorValueCache.get(decoded.sensorId);
    const currVal = decoded.primaryMetric?.value || 0;
    const delta = prevVal !== undefined ? Number((currVal - prevVal).toFixed(2)) : 0.0;
    sensorValueCache.set(decoded.sensorId, currVal);

    // 3. Evaluate Rate Limiting
    const rateCheck = rateLimiter.evaluateWrite(decoded.deviceId);

    const rateHeaders = {
      'X-RateLimit-Limit': String(rateCheck.burstMax),
      'X-RateLimit-Remaining': String(rateCheck.tokensRemaining),
      'X-RateLimit-Safe-10s': String(rateCheck.safePer10s),
    };

    if (!rateCheck.allowed) {
      rateHeaders['Retry-After'] = String(rateCheck.retryAfterSec);

      console.warn(`[RATE_LIMIT_THROTTLE] Sensor ${decoded.sensorId} throttled: ${rateCheck.reason} (${rateCheck.message})`);

      // If client requests silent ack via ?ack=true, return 202 instead of 429
      const url = new URL(request.url);
      const isAckMode = url.searchParams.get('ack') === 'true';

      results.push({
        status: isAckMode ? 'accepted_debounced' : 'throttled',
        statusCode: isAckMode ? 202 : 429,
        sensorId: decoded.sensorId,
        deviceId: decoded.deviceId,
        reason: rateCheck.reason,
        message: rateCheck.message,
        retryAfterSeconds: rateCheck.retryAfterSec,
        rateLimit: {
          safeWritesPer10s: rateCheck.safePer10s,
          tokensRemaining: rateCheck.tokensRemaining,
        },
      });
      continue;
    }

    // 4. Allowed: Write to Firestore
    try {
      // Ensure parent sensor document is registered
      await firestoreClient.ensureSensorProvisioned(decoded);

      // Append immutable reading
      const writeResult = await firestoreClient.writeReading(decoded, delta);

      results.push({
        status: 'written',
        statusCode: 200,
        sensorId: decoded.sensorId,
        deviceId: decoded.deviceId,
        stationId: decoded.stationId,
        stationName: decoded.stationName,
        readingId: writeResult.readingId,
        metric: {
          type: decoded.primaryMetric.type,
          value: decoded.primaryMetric.value,
          unit: decoded.primaryMetric.unit,
          quality: decoded.primaryMetric.quality,
          delta,
        },
        batteryPct: decoded.metrics?.batteryPct ?? 100,
        schemaType: decoded.schemaType,
        rateLimit: {
          safeWritesPer10s: rateCheck.safePer10s,
          tokensRemaining: rateCheck.tokensRemaining,
        },
      });

      console.log(`[TELEMETRY_INGEST_SUCCESS] Wrote reading for ${decoded.sensorId}: ${decoded.primaryMetric.value}${decoded.primaryMetric.unit} (Tokens remaining: ${rateCheck.tokensRemaining})`);
    } catch (writeErr) {
      console.error(`[FIRESTORE_WRITE_ERROR] Failed writing reading for ${decoded.sensorId}:`, writeErr.message);
      results.push({
        status: 'error',
        statusCode: 502,
        sensorId: decoded.sensorId,
        error: writeErr.message,
      });
    }
  }

  const durationMs = Date.now() - startTime;

  // If single packet, return single result directly with appropriate status code
  if (!Array.isArray(rawBody) && results.length === 1) {
    const single = results[0];
    const status = single.statusCode || 200;
    const responseHeaders = {
      'Content-Type': 'application/json',
      'X-Gateway-Latency-Ms': String(durationMs),
      ...corsHeaders,
    };
    if (single.retryAfterSeconds) {
      responseHeaders['Retry-After'] = String(single.retryAfterSeconds);
    }
    return new Response(JSON.stringify(single, null, 2), {
      status,
      headers: responseHeaders,
    });
  }

  // Batch response
  const hasThrottle = results.some(r => r.statusCode === 429);
  const status = hasThrottle ? 207 : 200; // Multi-Status or OK

  return new Response(JSON.stringify({
    success: true,
    totalPackets: packets.length,
    durationMs,
    results,
  }, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Gateway-Latency-Ms': String(durationMs),
      ...corsHeaders,
    },
  });
}

// ============================================================================
// SERVICE PROXY HANDLER (DeepSeek AI Inference)
// ============================================================================
async function handleServiceProxy(request, env, service, config, corsHeaders, startTime) {
  const envKeyName = config.envKeyName || `${service.toUpperCase()}_API_KEY`;
  const apiKey = env[envKeyName];

  if (!apiKey) {
    console.error(`[GATEWAY_AUTH_ERROR] Missing environment secret: ${envKeyName}`);
    return new Response(JSON.stringify({
      error: `Missing API key credential for service: ${service}`,
      resolution: `Run 'wrangler secret put ${envKeyName}' in your Cloudflare Worker project.`,
      envKey: envKeyName,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const upstreamUrl = env[`${service.toUpperCase()}_UPSTREAM_URL`] || config.upstream;
  const upstreamMethod = config.method || 'POST';
  const authResult = config.auth(apiKey);

  const upstreamHeaders = new Headers({
    'Content-Type': 'application/json',
    'User-Agent': 'Shamba-Watch-Gateway/2.1',
  });

  if (authResult.headers) {
    Object.entries(authResult.headers).forEach(([key, val]) => {
      upstreamHeaders.set(key, val);
    });
  }

  let body = null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try {
      body = await request.json();
    } catch {
      // Body might be empty
    }
  }

  if (body && typeof body === 'object') {
    if (!body.model && config.defaultModel) {
      body.model = env[`${service.toUpperCase()}_MODEL`] || config.defaultModel;
    }
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: upstreamMethod,
      headers: upstreamHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    const latencyMs = Date.now() - startTime;
    const responseData = await upstreamResponse.text();

    if (!upstreamResponse.ok) {
      console.error(`[UPSTREAM_ERROR] Status: ${upstreamResponse.status} ${upstreamResponse.statusText}`);
      return new Response(JSON.stringify({
        error: 'Upstream Intelligence Provider Error',
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        details: safeJsonParse(responseData),
        latencyMs,
        timestamp: new Date().toISOString(),
      }), {
        status: upstreamResponse.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

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
    return new Response(JSON.stringify({
      error: 'Gateway network exception connecting to upstream service',
      message: networkError.message,
      latencyMs,
      timestamp: new Date().toISOString(),
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}
