/**
 * @fileoverview SensorMetadata Value Object.
 * Manages sensor identification, physical stratification depth, and appendable custom attributes.
 * Adheres to Clean Architecture Entity Independence (Principle 32), SRP (Principle 1),
 * and Standard Method Overrides (Principle 20).
 */

/**
 * Encapsulates core metadata and runtime-appendable properties of a sensor.
 */
export class SensorMetadata {
  /**
   * @param {Object} params
   * @param {string} params.name - Human-readable sensor name.
   * @param {string} [params.description] - Functional or agro-ecological description.
   * @param {string} [params.manufacturer] - Hardware manufacturer.
   * @param {string} [params.model] - Hardware model designation.
   * @param {string} [params.serialNumber] - Hardware serial number.
   * @param {string} [params.hardwareId] - ID of the physical probe hosting this channel.
   * @param {number|null} [params.minDepthCm] - Upper depth limit in cm (for soil/water profile).
   * @param {number|null} [params.maxDepthCm] - Lower depth limit in cm (for soil/water profile).
   * @param {number|null} [params.altitudeMeters] - Elevation/altitude in meters above sea level.
   * @param {Object} [params.location] - Structured geographic location { stationId, stationName, lat, lng, altitudeMeters, depthCm }.
   * @param {Object} [params.hardware] - Structured physical hardware specs.
   * @param {string} [params.sensorType] - Sensor functional category.
   * @param {Record<string, any>} [params.customAttributes] - Key-value store of dynamic extra fields.
   */
  constructor({
    name,
    description = '',
    manufacturer = 'Generic',
    model = 'Standard-v1',
    serialNumber = '',
    hardwareId = '',
    minDepthCm = null,
    maxDepthCm = null,
    altitudeMeters = null,
    location = null,
    hardware = null,
    sensorType = '',
    customAttributes = {},
  }) {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new TypeError('SensorMetadata requires a non-empty name string.');
    }

    this.name = name.trim();
    this.description = description ? description.trim() : '';
    this.sensorType = sensorType || '';

    // Hardware metadata
    this.manufacturer = hardware?.manufacturer || manufacturer;
    this.model = hardware?.model || model;
    this.serialNumber = hardware?.serialNumber || serialNumber;
    this.hardwareId = hardware?.hardwareId || hardwareId || this.serialNumber || 'HW-GENERIC';
    this.hardware = hardware || {
      manufacturer: this.manufacturer,
      model: this.model,
      serialNumber: this.serialNumber,
      hardwareId: this.hardwareId,
    };

    // Stratigraphy & Elevation
    this.minDepthCm = minDepthCm !== null ? Number(minDepthCm) : null;
    this.maxDepthCm = maxDepthCm !== null ? Number(maxDepthCm) : null;
    this.altitudeMeters = altitudeMeters !== null
      ? Number(altitudeMeters)
      : (location?.altitudeMeters !== undefined ? Number(location.altitudeMeters) : null);

    // Geographic & Station Location
    this.location = location || {
      stationId: '',
      stationName: '',
      lat: null,
      lng: null,
      altitudeMeters: this.altitudeMeters,
      depthCm: this.maxDepthCm || this.minDepthCm || null,
    };

    /** @type {Map<string, any>} Dynamic appendable attributes store */
    this._customAttributes = new Map(Object.entries(customAttributes || {}));
  }

  /**
   * Appends or updates an extra metadata attribute dynamically at runtime.
   * Fulfills user requirement: "this metadata can append an extra field to it".
   * @param {string} key - Attribute key name.
   * @param {any} value - Attribute value.
   * @returns {SensorMetadata} this instance for method chaining.
   */
  appendAttribute(key, value) {
    if (!key || typeof key !== 'string' || key.trim().length === 0) {
      throw new TypeError('Attribute key must be a non-empty string.');
    }
    this._customAttributes.set(key.trim(), value);
    return this;
  }

  /**
   * Retrieves an appended metadata attribute.
   * @param {string} key - Attribute key.
   * @param {any} [defaultValue=null] - Default fallback if key does not exist.
   * @returns {any}
   */
  getAttribute(key, defaultValue = null) {
    return this._customAttributes.has(key) ? this._customAttributes.get(key) : defaultValue;
  }

  /**
   * Checks if an attribute key exists.
   * @param {string} key
   * @returns {boolean}
   */
  hasAttribute(key) {
    return this._customAttributes.has(key);
  }

  /**
   * Removes an appended attribute.
   * @param {string} key
   * @returns {boolean} True if removed, false if not found.
   */
  removeAttribute(key) {
    return this._customAttributes.delete(key);
  }

  /**
   * Returns a plain object copy of all appended custom attributes.
   * @returns {Record<string, any>}
   */
  getCustomAttributes() {
    return Object.fromEntries(this._customAttributes);
  }

  /**
   * Serializes metadata to a plain JSON-compatible object.
   * @returns {Object}
   */
  toJSON() {
    return {
      name: this.name,
      description: this.description,
      sensorType: this.sensorType,
      manufacturer: this.manufacturer,
      model: this.model,
      serialNumber: this.serialNumber,
      hardwareId: this.hardwareId,
      hardware: this.hardware,
      minDepthCm: this.minDepthCm,
      maxDepthCm: this.maxDepthCm,
      altitudeMeters: this.altitudeMeters,
      location: this.location,
      customAttributes: this.getCustomAttributes(),
    };
  }

  /**
   * Deserializes a plain object into a SensorMetadata instance.
   * @param {Object} data
   * @returns {SensorMetadata}
   */
  static fromJSON(data) {
    if (!data || typeof data !== 'object') {
      throw new TypeError('Invalid JSON representation for SensorMetadata.');
    }
    return new SensorMetadata(data);
  }

  /**
   * Returns human-readable string representation (Principle 20).
   * @returns {string}
   */
  toString() {
    const depthInfo = this.minDepthCm !== null && this.maxDepthCm !== null
      ? ` (${this.minDepthCm}-${this.maxDepthCm}cm)`
      : '';
    return `[SensorMetadata: ${this.name}${depthInfo}, HW: ${this.hardwareId}]`;
  }
}
