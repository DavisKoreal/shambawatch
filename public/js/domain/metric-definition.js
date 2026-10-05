/**
 * @fileoverview MetricDefinition Value Object.
 * Encapsulates measurement classification, physical engineering units, and validation boundaries.
 * Adheres to SRP (Principle 1), Pure Functions (Principle 5), and Edge Case Handling (Principle 25).
 */

export class MetricDefinition {
  /**
   * @param {Object} params
   * @param {string} params.metricType - Categorical metric key (e.g. 'moisture', 'water', 'nitrogen').
   * @param {string} [params.unitSymbol='%'] - Display unit symbol ('%', '°C', 'ppm', etc.).
   * @param {number} [params.minValid=0] - Lower physical sensor limit.
   * @param {number} [params.maxValid=100] - Upper physical sensor limit.
   * @param {number} [params.precision=1] - Decimal display precision.
   */
  constructor({
    metricType,
    type,
    unitSymbol = '%',
    unit,
    minValid = 0,
    maxValid = 100,
    precision = 1,
  }) {
    const resolvedType = metricType || type;
    if (!resolvedType || typeof resolvedType !== 'string') {
      throw new TypeError('MetricDefinition requires a non-empty metricType string.');
    }
    if (minValid >= maxValid) {
      throw new RangeError(`minValid (${minValid}) must be strictly less than maxValid (${maxValid}).`);
    }

    this.metricType = resolvedType.toLowerCase().trim();
    this.unitSymbol = (unitSymbol || unit || '%').trim();
    this.minValid = Number(minValid);
    this.maxValid = Number(maxValid);
    this.precision = Math.max(0, Math.floor(precision));
  }

  /**
   * Pure predicate checking if a numeric reading falls within physical validity limits.
   * @param {number} value
   * @returns {boolean}
   */
  isValid(value) {
    if (value === null || value === undefined || typeof value !== 'number' || Number.isNaN(value)) {
      return false;
    }
    return value >= this.minValid && value <= this.maxValid;
  }

  /**
   * Formats a raw number to the specified decimal precision with the unit symbol.
   * @param {number} value
   * @returns {string} e.g. "41.5 %"
   */
  format(value) {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return `— ${this.unitSymbol}`;
    }
    return `${Number(value).toFixed(this.precision)} ${this.unitSymbol}`;
  }

  /**
   * Clamps a value strictly to the valid boundaries.
   * @param {number} value
   * @returns {number}
   */
  clamp(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return this.minValid;
    }
    return Math.max(this.minValid, Math.min(this.maxValid, value));
  }

  /**
   * Serializes to JSON.
   * @returns {Object}
   */
  toJSON() {
    return {
      metricType: this.metricType,
      unitSymbol: this.unitSymbol,
      minValid: this.minValid,
      maxValid: this.maxValid,
      precision: this.precision,
    };
  }

  /**
   * Deserializes from JSON.
   * @param {Object} data
   * @returns {MetricDefinition}
   */
  static fromJSON(data) {
    if (!data || typeof data !== 'object') {
      throw new TypeError('Invalid JSON representation for MetricDefinition.');
    }
    return new MetricDefinition(data);
  }

  /**
   * Standard string representation.
   * @returns {string}
   */
  toString() {
    return `[MetricDefinition: ${this.metricType} (${this.unitSymbol}) range: [${this.minValid}, ${this.maxValid}]]`;
  }
}
