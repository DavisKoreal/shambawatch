/**
 * @fileoverview Resilient Firestore REST Client for Cloudflare Workers.
 * 
 * Writes validated readings to /sensors/{sensorId}/readings/{readingId}
 * and provisions or updates sensor documents at /sensors/{sensorId}.
 */

export class FirestoreClient {
  constructor(options = {}) {
    this.projectId = options.projectId || 'shambawatch';
    this.authToken = options.authToken || null;
    this.baseUrl = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents`;
    this.provisionedSensors = new Set();
  }

  _getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  /**
   * Ensures the parent sensor document is registered in /sensors/{sensorId}.
   * Matches strict isValidSensor schema in firestore.rules.
   */
  async ensureSensorProvisioned(decoded) {
    const sensorId = decoded.sensorId;
    if (this.provisionedSensors.has(sensorId)) return true;

    const sensorUrl = `${this.baseUrl}/sensors/${sensorId}`;
    const headers = this._getHeaders();

    // Check if document exists
    try {
      const checkRes = await fetch(sensorUrl, { headers });
      if (checkRes.ok) {
        this.provisionedSensors.add(sensorId);
        return true;
      }
    } catch {
      // Continue to provision
    }

    const customAttrsFields = {};
    if (decoded.customAttributes) {
      let count = 0;
      for (const [k, v] of Object.entries(decoded.customAttributes)) {
        if (count >= 17) break; // Leave room for standard 3 tags
        customAttrsFields[k] = { stringValue: String(v).slice(0, 100) };
        count++;
      }
    }
    customAttrsFields['label'] = { stringValue: 'live field sensor' };
    customAttrsFields['devaddr'] = { stringValue: decoded.deviceId };
    customAttrsFields['provisionedBy'] = { stringValue: 'cloudflare-worker-gateway' };

    const sensorPayload = {
      fields: {
        id: { stringValue: sensorId },
        stationId: { stringValue: decoded.stationId },
        metadata: {
          mapValue: {
            fields: {
              name: { stringValue: `${decoded.stationName} LoRa Moisture Probe` },
              description: { stringValue: `LoRaWAN field telemetry node (DevAddr: ${decoded.deviceId})` },
              sensorType: { stringValue: 'lorawan field sensor' },
              crop: { stringValue: decoded.crop || 'Field Crop' },
              stationId: { stringValue: decoded.stationId },
              stationName: { stringValue: decoded.stationName },
              altitudeMeters: { integerValue: String(decoded.location?.altitudeMeters || 1850) },
              minDepthCm: { integerValue: '0' },
              maxDepthCm: { integerValue: '25' },
              location: {
                mapValue: {
                  fields: {
                    stationId: { stringValue: decoded.stationId },
                    stationName: { stringValue: decoded.stationName },
                    lat: { doubleValue: Number(decoded.location?.lat || -0.2833) },
                    lng: { doubleValue: Number(decoded.location?.lng || 36.0667) },
                    altitudeMeters: { integerValue: String(decoded.location?.altitudeMeters || 1850) },
                    depthCm: { integerValue: '15' },
                  }
                }
              },
              hardware: {
                mapValue: {
                  fields: {
                    manufacturer: { stringValue: 'Teleops / LoRaWAN' },
                    model: { stringValue: 'ESP Gateway Node' },
                    serialNumber: { stringValue: decoded.signal?.mac || decoded.deviceId },
                    hardwareId: { stringValue: `HW-LORA-${decoded.deviceId}` },
                  }
                }
              },
              customAttributes: {
                mapValue: {
                  fields: customAttrsFields,
                }
              }
            }
          }
        },
        metricDefinition: {
          mapValue: {
            fields: {
              metricType: { stringValue: decoded.primaryMetric?.type || 'moisture' },
              unitSymbol: { stringValue: decoded.primaryMetric?.unit || '%' },
              minValid: { integerValue: '0' },
              maxValid: { integerValue: '100' },
              precision: { integerValue: '1' },
            }
          }
        },
        thresholds: {
          mapValue: {
            fields: {
              criticalLow: { integerValue: '20' },
              warningLow: { integerValue: '35' },
              warningHigh: { integerValue: '85' },
              criticalHigh: { integerValue: '95' },
              hysteresis: { integerValue: '2' },
            }
          }
        },
        currentState: {
          mapValue: {
            fields: {
              latestValue: { doubleValue: Number(decoded.primaryMetric?.value || 0) },
              lastSampledMs: { integerValue: String(decoded.timestampMs) },
              status: { stringValue: 'nominal' },
              quality: { stringValue: decoded.primaryMetric?.quality || 'GOOD' },
              delta: { doubleValue: 0.0 },
              batteryPct: { integerValue: String(decoded.metrics?.batteryPct ?? 100) },
            }
          }
        }
      }
    };

    try {
      const provRes = await fetch(sensorUrl, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(sensorPayload),
      });

      if (provRes.ok) {
        this.provisionedSensors.add(sensorId);
        return true;
      } else {
        const errTxt = await provRes.text();
        console.warn(`[PROVISION_WARN] /sensors/${sensorId} failed (HTTP ${provRes.status}):`, errTxt);
      }
    } catch (err) {
      console.warn(`[PROVISION_EXCEPTION] /sensors/${sensorId}:`, err.message);
    }

    return false;
  }

  /**
   * Appends an immutable reading document to /sensors/{sensorId}/readings/{readingId}.
   * Strictly adheres to isValidReading schema in firestore.rules.
   */
  async writeReading(decoded, delta = 0.0) {
    const sensorId = decoded.sensorId;
    const timestampMs = decoded.timestampMs;
    const readingId = `reading_${timestampMs}`;
    const readingUrl = `${this.baseUrl}/sensors/${sensorId}/readings?documentId=${readingId}`;
    const headers = this._getHeaders();

    const readingPayload = {
      fields: {
        id: { stringValue: readingId },
        sensorId: { stringValue: sensorId },
        timestampMs: { integerValue: String(timestampMs) },
        timestampISO: { stringValue: decoded.timestampISO },
        value: { doubleValue: Number(decoded.primaryMetric?.value || 0) },
        quality: { stringValue: decoded.primaryMetric?.quality || 'GOOD' },
        delta: { doubleValue: Number(delta) },
        batteryPct: { integerValue: String(decoded.metrics?.batteryPct ?? 100) },
      }
    };

    const res = await fetch(readingUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(readingPayload),
    });

    const responseText = await res.text();
    let responseData = null;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    if (!res.ok) {
      throw new Error(`Firestore REST error (HTTP ${res.status}): ${typeof responseData === 'object' ? JSON.stringify(responseData) : responseData}`);
    }

    // Also update parent currentState in background if possible
    try {
      const updateMaskUrl = `${this.baseUrl}/sensors/${sensorId}?updateMask.fieldPaths=currentState.latestValue&updateMask.fieldPaths=currentState.lastSampledMs&updateMask.fieldPaths=currentState.delta&updateMask.fieldPaths=currentState.quality&updateMask.fieldPaths=currentState.batteryPct`;
      const currentStatePayload = {
        fields: {
          currentState: {
            mapValue: {
              fields: {
                latestValue: { doubleValue: Number(decoded.primaryMetric?.value || 0) },
                lastSampledMs: { integerValue: String(timestampMs) },
                delta: { doubleValue: Number(delta) },
                quality: { stringValue: decoded.primaryMetric?.quality || 'GOOD' },
                batteryPct: { integerValue: String(decoded.metrics?.batteryPct ?? 100) },
              }
            }
          }
        }
      };

      await fetch(updateMaskUrl, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(currentStatePayload),
      });
    } catch {
      // Best-effort currentState patch
    }

    return {
      success: true,
      readingId,
      sensorId,
      timestampMs,
      value: decoded.primaryMetric?.value,
      quality: decoded.primaryMetric?.quality,
      delta,
      batteryPct: decoded.metrics?.batteryPct ?? 100,
    };
  }
}
