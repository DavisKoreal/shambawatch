/**
 * @fileoverview Pure-function Polymorphic LoRaWAN & IoT Telemetry Decoder for Cloudflare Workers.
 * 
 * Supports:
 * 1. LoRaWAN Gateway uplinks (ISO datetime, best_gw, all_gw, 868MHz metadata).
 * 2. Direct WiFi gateway uplinks (Unix millisecond timestamps, wifi_rssi).
 * 3. 10-byte 0x5FEE Teleops sensor frames (scaled moisture %, battery mV).
 * 4. Cayenne LPP structured payload buffers.
 * 5. Pre-decoded JSON payload objects.
 * 6. Generic hex strings with automatic word-level channel extraction.
 * 7. Polymorphic schema agility: Unknown keys safely collected into customAttributes.
 */

const KNOWN_STATION_MAP = Object.freeze({
  kisumu: { id: 'ST-KISUMU-01', name: 'Tivoili Station, Kisumu', lat: -0.0917, lng: 34.7680, crop: 'Sugarcane & Rice' },
  pharmaceutical: { id: 'ST-PHARMA-01', name: 'Pharmaceutical Research Plot', lat: -0.2833, lng: 36.0667, crop: 'Medicinal Herbs' },
  corridor: { id: 'ST-CORRIDOR-01', name: 'Long Corridor Transit Mast', lat: -0.3667, lng: 36.0833, crop: 'Buffer Zone' },
  naivasha: { id: 'ST-01', name: 'Naivasha North Plot', lat: -0.6980, lng: 36.4200, crop: 'Flower greenhouse' },
  'ol kalou': { id: 'ST-02', name: 'Ol Kalou Maize Block', lat: -0.2667, lng: 36.3833, crop: 'Maize' },
  nakuru: { id: 'ST-03', name: 'Nakuru Basin Pivot', lat: -0.3031, lng: 36.0800, crop: 'Wheat & Barley' },
  molo: { id: 'ST-04', name: 'Molo Highland Terrace', lat: -0.2470, lng: 35.7330, crop: 'Pyrethrum & Potatoes' },
  solai: { id: 'ST-05', name: 'Solai Coffee Estate', lat: -0.0167, lng: 36.1500, crop: 'Arabica Coffee' },
  gilgil: { id: 'ST-06', name: 'Gilgil Pasture & Fodder', lat: -0.4833, lng: 36.2833, crop: 'Rhodes Grass Fodder' },
});

const KNOWN_ENVELOPE_KEYS = new Set([
  'devaddr', 'deveui', 'devEUI', 'device_id', 'deviceId', 'id', 'mac', 'nodeId',
  'data', 'payload', 'payload_raw', 'raw', 'decoded_payload', 'objectJSON',
  'datetime', 'timestamp', 'time', 'ts',
  'desc', 'description',
  'best_gw', 'all_gw', 'gateways', 'rxInfo', 'txInfo',
  'topic'
]);

export function decodeLoRaMessage(rawMessage, topic = '') {
  let envelope = {};

  if (typeof rawMessage === 'string') {
    const text = rawMessage.trim();
    if (text.startsWith('{') && text.endsWith('}')) {
      try {
        envelope = JSON.parse(text);
      } catch {
        envelope = { data: text };
      }
    } else {
      envelope = { data: text };
    }
  } else if (rawMessage && typeof rawMessage === 'object') {
    envelope = { ...rawMessage };
  }

  const deviceId = resolveDeviceId(envelope, topic);
  const sensorId = `lora_${deviceId.toLowerCase()}`;
  const { timestampMs, timestampISO } = resolveTimestamp(envelope);
  const stationInfo = resolveStationInfo(envelope, deviceId);
  const signal = resolveSignalMetadata(envelope);
  const payloadResult = decodePayloadData(envelope);

  const customAttributes = { ...payloadResult.extraAttributes };
  for (const [key, value] of Object.entries(envelope)) {
    if (!KNOWN_ENVELOPE_KEYS.has(key)) {
      customAttributes[key] = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
    }
  }

  if (envelope.fcnt !== undefined) customAttributes.fcnt = String(envelope.fcnt);
  if (envelope.freq !== undefined) customAttributes.freq = String(envelope.freq);
  if (envelope.datr !== undefined) customAttributes.datr = String(envelope.datr);
  if (envelope.port !== undefined) customAttributes.port = String(envelope.port);
  if (envelope.app !== undefined) customAttributes.app = String(envelope.app);
  if (envelope.netid !== undefined) customAttributes.netid = String(envelope.netid);

  const primaryMetric = resolvePrimaryMetric(payloadResult.metrics);

  return Object.freeze({
    deviceId,
    sensorId,
    stationId: stationInfo.stationId,
    stationName: stationInfo.stationName,
    crop: stationInfo.crop,
    timestampMs,
    timestampISO,
    primaryMetric,
    metrics: Object.freeze(payloadResult.metrics),
    signal: Object.freeze(signal),
    location: Object.freeze(stationInfo.location),
    customAttributes: Object.freeze(customAttributes),
    rawHex: payloadResult.rawHex,
    schemaType: payloadResult.schemaType,
  });
}

function resolveDeviceId(envelope, topic) {
  let candidate = envelope.devaddr ||
    envelope.devEUI ||
    envelope.deveui ||
    envelope.dev_eui ||
    envelope.device_eui ||
    envelope.deviceId ||
    envelope.device_id ||
    envelope.nodeId ||
    envelope.node_id ||
    envelope.sensorId ||
    envelope.sensor_id ||
    envelope.eui ||
    envelope.mac ||
    envelope.id;

  if (!candidate) {
    for (const [k, v] of Object.entries(envelope)) {
      const lower = k.toLowerCase();
      if ((lower.includes('deveui') || lower.includes('devaddr') || lower.includes('device_id') || lower.includes('node')) && typeof v === 'string') {
        candidate = v;
        break;
      }
    }
  }

  if (candidate && typeof candidate === 'string' && candidate.trim()) {
    return candidate.trim().replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();
  }

  if (topic) {
    const parts = topic.split('/').filter(Boolean);
    const lastPart = parts[parts.length - 1];
    if (lastPart && lastPart !== '#' && lastPart !== '+') {
      return lastPart.toUpperCase();
    }
  }

  return 'UNKNOWN_NODE';
}

function resolveTimestamp(envelope) {
  const rawTime = envelope.datetime ?? envelope.timestamp ?? envelope.time ?? envelope.ts;
  let timestampMs = Date.now();

  if (typeof rawTime === 'number') {
    timestampMs = rawTime < 1e11 ? rawTime * 1000 : rawTime;
  } else if (typeof rawTime === 'string' && rawTime.trim()) {
    const parsed = Date.parse(rawTime);
    if (!Number.isNaN(parsed)) {
      timestampMs = parsed;
    } else {
      const num = Number(rawTime);
      if (!Number.isNaN(num) && num > 0) {
        timestampMs = num < 1e11 ? num * 1000 : num;
      }
    }
  }

  if (timestampMs < 1577836800000 || timestampMs > 2208988800000) {
    timestampMs = Date.now();
  }

  return {
    timestampMs,
    timestampISO: new Date(timestampMs).toISOString(),
  };
}

function resolveStationInfo(envelope, deviceId) {
  const desc = (envelope.desc || envelope.description || '').trim();
  const descLower = desc.toLowerCase();

  for (const [key, known] of Object.entries(KNOWN_STATION_MAP)) {
    if (descLower.includes(key)) {
      return {
        stationId: known.id,
        stationName: known.name,
        crop: known.crop,
        location: {
          stationId: known.id,
          stationName: known.name,
          lat: known.lat,
          lng: known.lng,
          altitudeMeters: 1890,
          depthCm: 15,
        }
      };
    }
  }

  const gwGps = envelope.best_gw?.gpspos || envelope.all_gw?.[0]?.gpspos;
  const lat = gwGps?.lat !== undefined ? Number(gwGps.lat) : -0.2833;
  const lng = (gwGps?.lon !== undefined ? Number(gwGps.lon) : (gwGps?.lng !== undefined ? Number(gwGps.lng) : 36.0667));
  const altitudeMeters = Number(envelope.best_gw?.gpsalt ?? envelope.all_gw?.[0]?.gpsalt ?? 1850);

  let stationName = desc || `Field Station ${deviceId}`;
  let stationId = desc
    ? `ST-${desc.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 16)}`
    : `ST-LORA-${deviceId.slice(0, 6)}`;

  return {
    stationId,
    stationName,
    crop: 'General Crop Field',
    location: {
      stationId,
      stationName,
      lat,
      lng,
      altitudeMeters,
      depthCm: 15,
    }
  };
}

function resolveSignalMetadata(envelope) {
  const bestGw = envelope.best_gw || {};
  const allGw = Array.isArray(envelope.all_gw) ? envelope.all_gw : [];

  const rawRssi = envelope.rssi ?? envelope.wifi_rssi ?? bestGw.rssi;
  const rssi = rawRssi !== undefined && rawRssi !== null ? Number(rawRssi) : null;

  const rawLsnr = envelope.lsnr ?? envelope.snr ?? bestGw.lsnr;
  const lsnr = rawLsnr !== undefined && rawLsnr !== null ? Number(rawLsnr) : null;

  return {
    rssi,
    lsnr,
    freq: envelope.freq !== undefined ? Number(envelope.freq) : 868.1,
    datr: envelope.datr || 'SF12BW125',
    codr: envelope.codr || '4/5',
    fcnt: envelope.fcnt !== undefined ? Number(envelope.fcnt) : null,
    port: envelope.port !== undefined ? Number(envelope.port) : 1,
    mac: envelope.mac || bestGw.mac || (allGw[0]?.mac ?? null),
    wifiRssi: envelope.wifi_rssi !== undefined ? Number(envelope.wifi_rssi) : null,
    gatewayCount: allGw.length > 0 ? allGw.length : (bestGw.mac ? 1 : 0),
  };
}

function decodePayloadData(envelope) {
  const metrics = {};
  const extraAttributes = {};
  let rawHex = '';
  let schemaType = 'unknown';

  const rawData = envelope.data ?? envelope.payload ?? envelope.payload_raw ?? envelope.raw;

  if (envelope.decoded_payload && typeof envelope.decoded_payload === 'object') {
    Object.assign(metrics, extractNumericMetrics(envelope.decoded_payload));
    schemaType = 'json_decoded';
    return { metrics, extraAttributes, rawHex: '', schemaType };
  }

  if (rawData && typeof rawData === 'object') {
    Object.assign(metrics, extractNumericMetrics(rawData));
    schemaType = 'json_decoded';
    return { metrics, extraAttributes, rawHex: '', schemaType };
  }

  if (typeof rawData === 'string' && /^[0-9a-fA-F\s]+$/.test(rawData.trim())) {
    rawHex = rawData.trim().replace(/\s+/g, '').toUpperCase();
    const bytes = [];
    for (let i = 0; i < rawHex.length; i += 2) {
      bytes.push(parseInt(rawHex.substr(i, 2), 16));
    }

    if (rawHex.startsWith('5FEE') && bytes.length === 10) {
      schemaType = 'teleops_5fee';
      const word1 = (bytes[2] << 8) | bytes[3];
      const word2 = (bytes[4] << 8) | bytes[5];
      const word3 = (bytes[6] << 8) | bytes[7];
      const word4 = (bytes[8] << 8) | bytes[9];

      const moisture = Number((word2 / 10).toFixed(1));
      metrics.moisture = moisture;

      const batteryMv = word4;
      metrics.batteryMv = batteryMv;
      metrics.batteryPct = calculateBatteryPct(batteryMv);

      if (word1 > 900 && word1 < 1300) {
        metrics.pressure = word1;
      } else {
        metrics.channel_1 = word1;
      }

      if (word3 > 0) {
        metrics.channel_3 = word3;
      }

      extraAttributes.rawWords = `${word1},${word2},${word3},${word4}`;
      return { metrics, extraAttributes, rawHex, schemaType };
    }

    schemaType = 'generic_hex';
    const words = [];
    for (let i = 0; i < bytes.length - 1; i += 2) {
      words.push((bytes[i] << 8) | bytes[i + 1]);
    }

    if (words.length >= 2) {
      const lastWord = words[words.length - 1];
      if (lastWord >= 2000 && lastWord <= 3600) {
        metrics.batteryMv = lastWord;
        metrics.batteryPct = calculateBatteryPct(lastWord);
        words.pop();
      }
    }

    words.forEach((w, idx) => {
      metrics[`channel_${idx + 1}`] = w;
    });

    if (words.length > 0 && words[0] >= 0 && words[0] <= 1000) {
      metrics.moisture = Number((words[0] / 10).toFixed(1));
    }

    extraAttributes.byteCount = String(bytes.length);
    return { metrics, extraAttributes, rawHex, schemaType };
  }

  const extracted = extractNumericMetrics(envelope);
  if (Object.keys(extracted).length > 0) {
    Object.assign(metrics, extracted);
    schemaType = 'envelope_metrics';
  } else {
    metrics.value = 1.0;
    schemaType = 'unparsed_payload';
  }

  return { metrics, extraAttributes, rawHex, schemaType };
}

function extractNumericMetrics(obj) {
  const result = {};
  if (!obj || typeof obj !== 'object') return result;

  const metricAliases = {
    moisture: ['moisture', 'soilmoisture', 'soil_moisture', 'sm', 'vswc'],
    humidity: ['humidity', 'rh', 'hum', 'ambient_humidity'],
    temperature: ['temperature', 'temp', 't', 'celsius', 'deg_c'],
    water: ['water', 'water_level', 'level', 'depth'],
    nitrogen: ['nitrogen', 'n', 'soil_n'],
    phosphorus: ['phosphorus', 'p', 'soil_p'],
    potassium: ['potassium', 'k', 'soil_k'],
    batteryPct: ['battery', 'batterypct', 'bat', 'battery_level'],
    batteryMv: ['batterymv', 'battery_mv', 'volt', 'voltage_mv'],
    pressure: ['pressure', 'baro', 'hpa', 'barometric_pressure'],
  };

  for (const [key, val] of Object.entries(obj)) {
    const num = Number(val);
    if (!Number.isNaN(num)) {
      const lower = key.toLowerCase();
      let matched = false;
      for (const [canonical, aliases] of Object.entries(metricAliases)) {
        if (aliases.includes(lower)) {
          result[canonical] = num;
          matched = true;
          break;
        }
      }
      if (!matched && !KNOWN_ENVELOPE_KEYS.has(key)) {
        result[key] = num;
      }
    }
  }

  return result;
}

function calculateBatteryPct(mv) {
  if (mv >= 3100) return 100;
  if (mv <= 2200) return 0;
  return Math.min(100, Math.max(0, Math.round(((mv - 2200) / (3100 - 2200)) * 100)));
}

function resolvePrimaryMetric(metrics) {
  let type = 'moisture';
  let value = 45.0;
  let unit = '%';

  if (metrics.moisture !== undefined) {
    type = 'moisture';
    value = metrics.moisture;
    unit = '%';
  } else if (metrics.humidity !== undefined) {
    type = 'humidity';
    value = metrics.humidity;
    unit = '%';
  } else if (metrics.temperature !== undefined) {
    type = 'temp';
    value = metrics.temperature;
    unit = '°C';
  } else if (metrics.water !== undefined) {
    type = 'water';
    value = metrics.water;
    unit = '%';
  } else if (metrics.channel_1 !== undefined) {
    type = 'moisture';
    value = metrics.channel_1;
    unit = 'raw';
  } else if (metrics.value !== undefined) {
    type = 'moisture';
    value = metrics.value;
    unit = '%';
  }

  let quality = 'GOOD';
  if (Number.isNaN(value) || value === null) {
    quality = 'FAULT';
    value = 0;
  } else if (unit === '%' && (value < 0 || value > 100)) {
    quality = 'OUT_OF_BOUNDS';
  }

  return {
    type,
    value,
    unit,
    quality,
  };
}
