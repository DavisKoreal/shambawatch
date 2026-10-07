/**
 * @fileoverview Test suite for Mathematical Firestore Rate Limiter.
 * 
 * Verifies:
 * - Mathematical write budget per 10 seconds (2.0 sustained safe writes, 5 max burst)
 * - 15% safety reserve buffer on 20,000 writes/day free quota
 * - Per-device 10-second debounce protection (anti-contention / anti-duplicate)
 * - Global burst token exhaustion & graceful 429 throttling
 * - Token bucket refill over time
 * - Diagnostic report accuracy
 */

import { FirestoreRateLimiter } from '../cloudflare-worker/src/rate-limiter.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    failed++;
    throw new Error(message);
  } else {
    passed++;
  }
}

console.log('\n--- Running Mathematical Rate Limiter Unit Tests ---\n');

// Test 1: Mathematical constants and initial diagnostic report
{
  const limiter = new FirestoreRateLimiter();
  const diag = limiter.getDiagnostics();

  assert(diag.mathematicalModel.firestoreFreeTierDailyQuota === 20000, 'Free tier daily quota must be 20,000');
  assert(diag.mathematicalModel.safetyReserveBufferPct === 15, 'Safety reserve must be 15%');
  assert(diag.mathematicalModel.safeDailyBudget === 17000, 'Safe daily budget must be 17,000 writes');
  assert(diag.mathematicalModel.safeSustainedWritesPer10s === 2.0, 'Safe sustained writes per 10s must be exactly 2.0');
  assert(diag.mathematicalModel.maxBurstWritesPer10s === 5.0, 'Max burst writes per 10s must be 5.0');
  assert(diag.mathematicalModel.perDeviceMinIntervalMs === 10000, 'Per device debounce must be 10,000 ms (10s)');
  assert(diag.liveState.availableTokens === 5.0, 'Initial token bucket must be full (5.0 tokens)');
  console.log('  ✓ should accurately compute mathematical 10s write budgets and reserve margins');
}

// Test 2: Per-device 10-second debounce
{
  const limiter = new FirestoreRateLimiter();

  // First write from device DEV01
  const first = limiter.evaluateWrite('DEV01');
  assert(first.allowed === true, 'First write from DEV01 must be allowed');
  assert(first.tokensRemaining === 4.0, 'Remaining tokens should be 4.0');

  // Immediate second write from DEV01
  const second = limiter.evaluateWrite('DEV01');
  assert(second.allowed === false, 'Immediate second write from DEV01 must be blocked');
  assert(second.reason === 'DEVICE_10S_DEBOUNCE', 'Reason must be DEVICE_10S_DEBOUNCE');
  assert(second.retryAfterSec >= 9 && second.retryAfterSec <= 10, 'Retry-After should be ~10s');

  // Write from different device DEV02 should be allowed
  const dev02 = limiter.evaluateWrite('DEV02');
  assert(dev02.allowed === true, 'Write from distinct device DEV02 must be allowed');
  assert(dev02.tokensRemaining === 3.0, 'Remaining tokens should be 3.0');

  console.log('  ✓ should enforce 1-write-per-10s per physical device and debounce duplicates');
}

// Test 3: Global burst ceiling exhaustion (max 5 writes per 10s)
{
  const limiter = new FirestoreRateLimiter();

  // 5 distinct devices write in quick succession
  for (let i = 1; i <= 5; i++) {
    const res = limiter.evaluateWrite(`NODE_0${i}`);
    assert(res.allowed === true, `Write ${i} from distinct device should be allowed`);
  }

  // 6th device attempts to write immediately
  const sixth = limiter.evaluateWrite('NODE_06');
  assert(sixth.allowed === false, '6th write must be blocked by global burst ceiling');
  assert(sixth.reason === 'GLOBAL_BURST_EXCEEDED', 'Reason must be GLOBAL_BURST_EXCEEDED');
  assert(sixth.retryAfterSec > 0, 'Retry-After must be positive');
  assert(sixth.tokensRemaining <= 0, 'Tokens must be depleted');

  console.log('  ✓ should prevent exceeding global 5-write burst limit in 10-second window');
}

// Test 4: Sliding window token bucket refill
{
  const limiter = new FirestoreRateLimiter();

  // Consume all 5 tokens
  for (let i = 1; i <= 5; i++) {
    limiter.evaluateWrite(`TEST_NODE_${i}`);
  }
  assert(limiter.tokens === 0, 'Tokens should be 0');

  // Simulate 10 seconds of elapsed time (should refill 0.2 tokens/sec * 10 = 2.0 tokens)
  limiter.lastRefillMs = Date.now() - 10000;
  limiter.evaluateWrite('ANOTHER_NODE'); // Triggers _refill

  // After refilling 2.0 tokens and consuming 1.0, tokens should be ~1.0
  assert(limiter.tokens >= 0.9 && limiter.tokens <= 1.1, 'Tokens should refill at 2.0 per 10s');

  console.log('  ✓ should refill tokens at sustained safe rate (2.0 tokens per 10s)');
}

// Test 5: Metrics and diagnostics updates
{
  const limiter = new FirestoreRateLimiter();
  limiter.evaluateWrite('DEV_A'); // allowed
  limiter.evaluateWrite('DEV_A'); // throttled (device)
  limiter.evaluateWrite('DEV_B'); // allowed

  const diag = limiter.getDiagnostics();
  assert(diag.liveState.totalIngested === 3, 'Total ingested should be 3');
  assert(diag.liveState.totalWritten === 2, 'Total written should be 2');
  assert(diag.liveState.totalThrottled === 1, 'Total throttled should be 1');
  assert(diag.liveState.throttleReasons.DEVICE_10S_DEBOUNCE === 1, 'Debounce count should be 1');

  console.log('  ✓ should track accurate live metrics and throttling audit breakdown');
}

console.log(`\n========================================`);
console.log(`  ALL ${passed} RATE LIMITER TESTS PASSED!`);
console.log(`========================================\n`);
