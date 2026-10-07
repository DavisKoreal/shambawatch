/**
 * @fileoverview Mathematical Rate Limiter for Firestore Telemetry Writes.
 * 
 * Mathematical Formulation:
 * -------------------------
 * 1. Firestore Free Tier Write Quota:
 *    - 20,000 document writes per 24 hours (86,400 seconds).
 *    - Theoretical sustained ceiling: 20,000 / 86,400 ≈ 0.2315 writes/sec ≈ 2.315 writes per 10 seconds.
 * 
 * 2. Operational Safety Margin:
 *    - A 15% reserve buffer is reserved for administrative tasks, UI actions, and rule indexing.
 *    - Budget target: 17,280 writes per day.
 *    - Safe sustained rate: 17,280 / 86,400 = 0.20 writes/sec = EXACTLY 2.0 writes per 10 seconds.
 * 
 * 3. Firestore Single-Document Lock Contention Constraint:
 *    - Maximum write rate to any single document is 1 write per second (500/50/5 rule).
 *    - In IoT agriculture, soil moisture changes over minutes/hours; sub-10-second writes are redundant.
 *    - Per-device minimum debounce: 10,000 ms (1 write per 10 seconds per unique device).
 * 
 * 4. Global Burst Ceiling:
 *    - Token Bucket capacity: 5 tokens (max burst of 5 writes per 10 seconds across all devices).
 *    - Refill rate: 0.2 tokens per second (replenishes 2.0 tokens every 10 seconds).
 *    - Token cost per written telemetry packet: 1.0 token.
 */

export class FirestoreRateLimiter {
  constructor(options = {}) {
    // Mathematical constants
    this.dailyQuota = options.dailyQuota || 20000;
    this.safetyReservePct = options.safetyReservePct || 15;
    this.burstCapacity = options.burstCapacity || 5.0; // Max writes in a 10s burst
    this.refillRatePerSec = options.refillRatePerSec || 0.20; // 2.0 writes per 10s (sustained safe rate)
    this.deviceDebounceMs = options.deviceDebounceMs || 10000; // 10s per unique device

    // Live Token Bucket State
    this.tokens = this.burstCapacity;
    this.lastRefillMs = Date.now();

    // Per-device debounce tracking: Map<deviceId, lastWriteTimestampMs>
    this.deviceLastWrite = new Map();

    // Telemetry Diagnostics & Metrics
    this.metrics = {
      totalIngested: 0,
      totalWritten: 0,
      totalThrottled: 0,
      reasons: {
        DEVICE_10S_DEBOUNCE: 0,
        GLOBAL_BURST_EXCEEDED: 0,
      },
      startedAt: new Date().toISOString(),
    };
  }

  /**
   * Refills the token bucket based on elapsed time since last refill.
   * @private
   */
  _refill(now) {
    const elapsedSec = Math.max(0, (now - this.lastRefillMs) / 1000);
    const addedTokens = elapsedSec * this.refillRatePerSec;
    this.tokens = Math.min(this.burstCapacity, this.tokens + addedTokens);
    this.lastRefillMs = now;
  }

  /**
   * Cleans up device timestamps older than 60 seconds to prevent unbounded memory growth.
   * @private
   */
  _pruneDeviceCache(now) {
    if (this.deviceLastWrite.size > 500) {
      for (const [devId, lastTime] of this.deviceLastWrite.entries()) {
        if (now - lastTime > 60000) {
          this.deviceLastWrite.delete(devId);
        }
      }
    }
  }

  /**
   * Evaluates if a write request for a given device is allowed within safe limits.
   * 
   * @param {string} deviceId - Physical device identifier (DevAddr or hardware MAC).
   * @returns {{
   *   allowed: boolean,
   *   reason?: string,
   *   tokensRemaining: number,
   *   retryAfterSec: number,
   *   safePer10s: number,
   *   burstMax: number,
   *   elapsedSinceDeviceMs?: number
   * }}
   */
  evaluateWrite(deviceId = 'GLOBAL') {
    const now = Date.now();
    this.metrics.totalIngested++;
    this._refill(now);
    this._pruneDeviceCache(now);

    const normDevId = String(deviceId).trim().toUpperCase();

    // 1. Check Per-Device 10-Second Debounce Limit
    const lastDeviceWrite = this.deviceLastWrite.get(normDevId);
    if (lastDeviceWrite !== undefined) {
      const elapsedDeviceMs = now - lastDeviceWrite;
      if (elapsedDeviceMs < this.deviceDebounceMs) {
        this.metrics.totalThrottled++;
        this.metrics.reasons.DEVICE_10S_DEBOUNCE++;
        const remainingMs = this.deviceDebounceMs - elapsedDeviceMs;
        const retryAfterSec = Math.max(1, Math.ceil(remainingMs / 1000));

        return {
          allowed: false,
          reason: 'DEVICE_10S_DEBOUNCE',
          message: `Device ${normDevId} already transmitted ${Math.round(elapsedDeviceMs / 1000)}s ago. Maximum 1 write per 10s per device permitted.`,
          tokensRemaining: Number(this.tokens.toFixed(2)),
          retryAfterSec,
          safePer10s: 2.0,
          burstMax: this.burstCapacity,
          elapsedSinceDeviceMs: elapsedDeviceMs,
        };
      }
    }

    // 2. Check Global Token Bucket (Max 5 Burst, 2 Sustained per 10s)
    if (this.tokens < 1.0) {
      this.metrics.totalThrottled++;
      this.metrics.reasons.GLOBAL_BURST_EXCEEDED++;
      const neededTokens = 1.0 - this.tokens;
      const retryAfterSec = Math.max(1, Math.ceil(neededTokens / this.refillRatePerSec));

      return {
        allowed: false,
        reason: 'GLOBAL_BURST_EXCEEDED',
        message: `Global Firestore write limit reached. Safe sustained rate is 2.0 writes per 10s (20,000/day quota protection).`,
        tokensRemaining: Number(this.tokens.toFixed(2)),
        retryAfterSec,
        safePer10s: 2.0,
        burstMax: this.burstCapacity,
      };
    }

    // 3. Allowed: Consume 1 Token and Record Device Timestamp
    this.tokens -= 1.0;
    this.deviceLastWrite.set(normDevId, now);
    this.metrics.totalWritten++;

    return {
      allowed: true,
      tokensRemaining: Number(this.tokens.toFixed(2)),
      retryAfterSec: 0,
      safePer10s: 2.0,
      burstMax: this.burstCapacity,
    };
  }

  /**
   * Returns live mathematical quota status and telemetry diagnostics.
   * @returns {object}
   */
  getDiagnostics() {
    this._refill(Date.now());
    return {
      status: 'nominal',
      mathematicalModel: {
        firestoreFreeTierDailyQuota: this.dailyQuota,
        safetyReserveBufferPct: this.safetyReservePct,
        safeDailyBudget: Math.round(this.dailyQuota * (1 - this.safetyReservePct / 100)),
        safeSustainedWritesPer10s: Number((this.refillRatePerSec * 10).toFixed(1)),
        maxBurstWritesPer10s: this.burstCapacity,
        perDeviceMinIntervalMs: this.deviceDebounceMs,
        ruleBasis: 'Sliding-Window Token Bucket + Per-Device 10s Debounce',
      },
      liveState: {
        availableTokens: Number(this.tokens.toFixed(2)),
        burstCapacity: this.burstCapacity,
        activeTrackedDevices: this.deviceLastWrite.size,
        totalIngested: this.metrics.totalIngested,
        totalWritten: this.metrics.totalWritten,
        totalThrottled: this.metrics.totalThrottled,
        throttleReasons: { ...this.metrics.reasons },
        startedAt: this.metrics.startedAt,
      },
    };
  }
}
