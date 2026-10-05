/**
 * @fileoverview ThresholdRule Value Object.
 * Evaluates sensor readings against multi-tiered boundary thresholds with hysteresis debouncing.
 * Adheres to Pure Functions (Principle 5), Low Cyclomatic Complexity (Principle 6),
 * and Avoidance of Magic Numbers (Principle 11).
 */

export class ThresholdRule {
  /**
   * @param {Object} params
   * @param {number|null} [params.criticalLow=null] - Critical alert boundary when value drops below.
   * @param {number|null} [params.warningLow=null] - Warning watch boundary when value drops below.
   * @param {number|null} [params.warningHigh=null] - Warning watch boundary when value rises above.
   * @param {number|null} [params.criticalHigh=null] - Critical alert boundary when value rises above.
   * @param {number} [params.hysteresis=1.0] - Deadband buffer to prevent alert flapping.
   */
  constructor({
    criticalLow = null,
    warningLow = null,
    warningHigh = null,
    criticalHigh = null,
    hysteresis = 1.0,
  } = {}) {
    this.criticalLow = criticalLow !== null ? Number(criticalLow) : null;
    this.warningLow = warningLow !== null ? Number(warningLow) : null;
    this.warningHigh = warningHigh !== null ? Number(warningHigh) : null;
    this.criticalHigh = criticalHigh !== null ? Number(criticalHigh) : null;
    this.hysteresis = Math.max(0, Number(hysteresis));
  }

  /**
   * Evaluates a value against defined thresholds with hysteresis.
   * Uses guard clauses and early returns for low cyclomatic complexity (Principle 6).
   * 
   * @param {number} value - The current sensor value.
   * @param {string} [previousStatus='nominal'] - The preceding status for hysteresis comparison.
   * @returns {'nominal' | 'watch' | 'alert'} The calculated health status.
   */
  evaluate(value, previousStatus = 'nominal') {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return 'watch';
    }

    // Check Critical Low
    if (this.criticalLow !== null) {
      const boundary = previousStatus === 'alert'
        ? this.criticalLow + this.hysteresis
        : this.criticalLow;
      if (value < boundary) return 'alert';
    }

    // Check Critical High
    if (this.criticalHigh !== null) {
      const boundary = previousStatus === 'alert'
        ? this.criticalHigh - this.hysteresis
        : this.criticalHigh;
      if (value > boundary) return 'alert';
    }

    // Check Warning Low
    if (this.warningLow !== null) {
      const boundary = previousStatus === 'watch'
        ? this.warningLow + this.hysteresis
        : this.warningLow;
      if (value < boundary) return 'watch';
    }

    // Check Warning High
    if (this.warningHigh !== null) {
      const boundary = previousStatus === 'watch'
        ? this.warningHigh - this.hysteresis
        : this.warningHigh;
      if (value > boundary) return 'watch';
    }

    return 'nominal';
  }

  /**
   * Serializes to plain JSON object.
   * @returns {Object}
   */
  toJSON() {
    return {
      criticalLow: this.criticalLow,
      warningLow: this.warningLow,
      warningHigh: this.warningHigh,
      criticalHigh: this.criticalHigh,
      hysteresis: this.hysteresis,
    };
  }

  /**
   * Deserializes from JSON.
   * @param {Object} data
   * @returns {ThresholdRule}
   */
  static fromJSON(data) {
    return new ThresholdRule(data || {});
  }

  /**
   * Standard string representation.
   * @returns {string}
   */
  toString() {
    return `[ThresholdRule: Low(${this.criticalLow}/${this.warningLow}) High(${this.warningHigh}/${this.criticalHigh}) Hyst:${this.hysteresis}]`;
  }
}
