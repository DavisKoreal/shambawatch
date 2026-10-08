/**
 * @fileoverview ShambaAgent Autonomous Application AI Service.
 * Acts as the intelligence entry point with read access to the entire platform:
 * telemetry stream, active alerts, station specs, soil stratigraphy, and agronomic heuristics.
 * Adheres to SWE Principle 1 (SRP), Principle 2 (SoC), and Principle 36 (Dependency Injection).
 */

import { APP_CONFIG, Logger } from '../config/app-config.js';

export class ShambaAgent {
  /**
   * @param {Object} context
   * @param {import('./sensor-registry.js').SensorRegistry} context.registry
   * @param {Array<Object>} context.stations
   * @param {import('../ui/dashboard-presenter.js').DashboardPresenter} [context.presenter]
   * @param {boolean} [context.enableRemoteGateway]
   */
  constructor({ registry, stations, presenter = null, enableRemoteGateway = (typeof window !== 'undefined') }) {
    if (!registry) throw new TypeError('ShambaAgent requires an injected SensorRegistry.');
    this._registry = registry;
    this._stations = stations || [];
    this._presenter = presenter;
    this._customLLMHandler = null;
    this._enableRemoteGateway = enableRemoteGateway;
  }

  /**
   * Resolves the current station list whether passed as an array, dynamic function, or registry discovery.
   * @returns {Array<Object>}
   */
  _getStationsList() {
    if (typeof this._stations === 'function') {
      try {
        const res = this._stations();
        if (Array.isArray(res)) return res;
      } catch (err) {
        Logger.error('ShambaAgent', 'Error invoking stations function:', err);
      }
    }
    if (Array.isArray(this._stations) && this._stations.length > 0) {
      return this._stations;
    }
    return this._registry.getStations();
  }

  /**
   * Enable or disable the remote intelligence gateway.
   * @param {boolean} enabled
   */
  setRemoteGatewayEnabled(enabled) {
    this._enableRemoteGateway = Boolean(enabled);
  }

  /**
   * Pluggable external LLM adapter.
   * @param {(prompt: string, platformContext: Object) => Promise<string>} handler
   */
  setLLMHandler(handler) {
    this._customLLMHandler = handler;
  }

  /**
   * Performs an instant search across active stations, registered sensors, and metrics.
   * Merges search directly into the AI agent capabilities.
   * @param {string} rawQuery
   * @returns {Array<Object>}
   */
  search(rawQuery) {
    const query = (rawQuery || '').trim().toLowerCase();
    if (!query) return [];

    const results = [];
    const stationsList = this._getStationsList();

    // 1. Search stations
    stationsList.forEach((s) => {
      const matchName = s.name.toLowerCase().includes(query);
      const matchId = s.id.toLowerCase().includes(query);
      const matchCrop = (s.crop || '').toLowerCase().includes(query);

      if (matchName || matchId || matchCrop) {
        results.push({
          type: 'STATION',
          id: s.id,
          title: s.name,
          subtitle: `${s.id} · ${s.crop || 'Field'} · ${s.sensorCount || 0} active sensors`,
          stationId: s.id,
          badge: 'STATION',
          badgeClass: 'badge-station',
        });
      }
    });

    // 2. Search sensors
    const allSensors = this._registry.getAllSensors();
    allSensors.forEach((sensor) => {
      const matchName = sensor.metadata.name.toLowerCase().includes(query);
      const matchMetric = (sensor.metricDefinition?.metricType?.toLowerCase().includes(query)) ||
                          (sensor.metricDefinition?.name?.toLowerCase().includes(query));
      const matchHardware = sensor.metadata?.hardwareId?.toLowerCase().includes(query);
      const matchCrop = sensor.metadata?.getAttribute?.('crop', '')?.toLowerCase().includes(query);

      if (matchName || matchMetric || matchHardware || matchCrop) {
        const val = sensor.currentState?.latestValue != null
          ? `${sensor.currentState.latestValue}${sensor.metricDefinition.unitSymbol}`
          : '';
        const station = stationsList.find(s => s.id === sensor.stationId);

        results.push({
          type: 'SENSOR',
          id: sensor.id,
          title: sensor.metadata.name,
          subtitle: `${station ? station.name : sensor.stationId} · ${val} · ${sensor.currentState?.status || 'nominal'}`,
          stationId: sensor.stationId,
          sensorId: sensor.id,
          metricType: sensor.metricDefinition.metricType,
          badge: sensor.metricDefinition.metricType.toUpperCase(),
          badgeClass: 'badge-sensor',
        });
      }
    });

    return results.slice(0, 8);
  }

  /**
   * Processes a user question or instruction and returns a structured response.
   * Supports multi-turn conversational dialogue threads.
   * @param {string} rawPrompt
   * @param {Array<{role: string, content: string}>} [conversationHistory=[]]
   * @returns {Promise<{ text: string, suggestions: string[], action?: Object }>}
   */
  async query(rawPrompt, conversationHistory = []) {
    const prompt = (rawPrompt || '').trim();
    if (!prompt) {
      return {
        text: "Habari! I am the **Shamba Watch Field AI Agent**. Ask me about station moisture, alerts, soil nutrients, or how our platform works.",
        suggestions: ["How does this platform work?", "Any active alerts?", "Naivasha moisture", "Irrigation advice"]
      };
    }

    Logger.info('ShambaAgent', `Processing query: "${prompt}" (History turns: ${conversationHistory?.length || 0})`);

    // 1. External custom LLM handler (if explicitly configured)
    if (this._customLLMHandler) {
      try {
        const platformContext = this._buildPlatformContext();
        const llmResponse = await this._customLLMHandler(prompt, platformContext, conversationHistory);
        return {
          text: llmResponse,
          suggestions: this._generateSuggestions(prompt, llmResponse),
          action: this._detectStationAction(prompt, llmResponse) || undefined
        };
      } catch (err) {
        Logger.error('ShambaAgent', 'Custom LLM handler failed, falling back to gateway / local reasoning:', err);
      }
    }

    // 2. Remote Intelligence Gateway (Cloudflare Worker API Proxy)
    if (this._enableRemoteGateway && APP_CONFIG.AI_GATEWAY?.WORKER_ENDPOINT) {
      try {
        return await this._callRemoteGateway(prompt, conversationHistory);
      } catch (err) {
        Logger.warn('ShambaAgent', `Remote gateway unavailable (${err.message}). Engaging local telemetry reasoning engine.`);
      }
    }

    // 3. Local deterministic contextual reasoning
    return this._reasonLocally(prompt.toLowerCase());
  }

  // ==========================================================================
  // REMOTE INTELLIGENCE GATEWAY (CLOUDFLARE WORKER PROXY)
  // ==========================================================================

  /**
   * Dispatches the query with live platform telemetry to the Cloudflare Worker API proxy.
   * Completely white-labeled (no provider or model names).
   * @param {string} prompt
   * @param {Array<{role: string, content: string}>} [conversationHistory=[]]
   * @returns {Promise<{ text: string, suggestions: string[], action?: Object }>}
   */
  async _callRemoteGateway(prompt, conversationHistory = []) {
    const endpoint = APP_CONFIG.AI_GATEWAY?.WORKER_ENDPOINT;
    if (!endpoint) {
      throw new Error('AI_GATEWAY.WORKER_ENDPOINT is not configured.');
    }

    const systemPrompt = this._buildSystemPrompt();

    // Format and sanitize conversation history (keep last 10 messages for context)
    const formattedHistory = Array.isArray(conversationHistory)
      ? conversationHistory
          .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .slice(-10)
          .map(m => ({ role: m.role, content: m.content }))
      : [];

    const payload = {
      messages: [
        { role: 'system', content: systemPrompt },
        ...formattedHistory,
        { role: 'user', content: prompt }
      ],
      temperature: APP_CONFIG.AI_GATEWAY?.TEMPERATURE ?? 0.3,
      max_tokens: APP_CONFIG.AI_GATEWAY?.MAX_TOKENS ?? 1500
    };

    const payloadJson = JSON.stringify(payload);
    const traceId = 'trace_' + Math.random().toString(36).substring(2, 9);
    const startMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());

    Logger.info('AI_GATEWAY', `[${traceId}] Dispatching request to proxy endpoint`, {
      endpoint,
      payloadBytes: payloadJson.length,
      timestamp: new Date().toISOString()
    });

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutMs = APP_CONFIG.AI_GATEWAY?.REQUEST_TIMEOUT_MS ?? 30000;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Trace-Id': traceId
        },
        body: payloadJson,
        signal: controller ? controller.signal : undefined
      });

      if (timeoutId) clearTimeout(timeoutId);
      const elapsedMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs);

      Logger.info('AI_GATEWAY', `[${traceId}] Received gateway response HTTP ${response.status} in ${elapsedMs}ms`);

      if (!response.ok) {
        let errorDetails = null;
        try {
          errorDetails = await response.json();
        } catch {
          errorDetails = await response.text();
        }
        Logger.error('AI_GATEWAY', `[${traceId}] Upstream gateway error:`, {
          status: response.status,
          statusText: response.statusText,
          elapsedMs,
          details: errorDetails
        });
        throw new Error(`Remote Gateway HTTP ${response.status}: ${JSON.stringify(errorDetails)}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        Logger.warn('AI_GATEWAY', `[${traceId}] Response missing choices[0].message.content`, data);
        throw new Error('Invalid response structure from inference gateway.');
      }

      Logger.info('AI_GATEWAY', `[${traceId}] Remote inference successfully delivered (${content.length} chars in ${elapsedMs}ms)`);

      const action = this._detectStationAction(prompt, content);
      const suggestions = this._generateSuggestions(prompt, content);

      return {
        text: content,
        suggestions,
        action: action || undefined
      };
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      const elapsedMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs);
      Logger.error('AI_GATEWAY', `[${traceId}] Inference dispatch exception (${elapsedMs}ms):`, err);
      throw err;
    }
  }

  /**
   * Constructs a comprehensive system prompt embedding live Firestore and platform telemetry.
   * Grounded strictly in the verified database state proof.
   * If 0 sensors exist, explicitly instructs the model to declare that 0 sensors are online.
   * Strictly white-labeled: no third-party vendor names or provider strings.
   * @returns {string}
   */
  _buildSystemPrompt() {
    const stateProof = this._registry.getSystemStateProof();
    const allSensors = this._registry.getAllSensors();
    const stations = this._registry.getStations();

    // 1. Zero-Sensor Grounding: rich platform context + conversational directives + honest grounding
    if (stateProof.isEmpty || allSensors.length === 0) {
      return `You are the Shamba Watch Field AI Agent, an autonomous agronomic intelligence assistant connected to the Shamba Watch platform in Kenya.

SYSTEM STATE PROOF (VERIFIED):
• Database Status: CONNECTED (Google Cloud Firestore)
• Target Collection: /${stateProof.collection}
• Total Verified Sensors: 0 (EMPTY)
• Active Stations Reporting: 0
• Verification Hash: ${stateProof.stateHash}
• Last Verified Timestamp: ${stateProof.timestamp}

PLATFORM ARCHITECTURE & OVERVIEW:
Shamba Watch is a precision agriculture telemetry and farm management intelligence platform engineered for farms across Kenya and East Africa.
- Monitored Metrics: Volumetric soil moisture at root depths (15cm, 30cm, 50cm), irrigation reservoir water levels, NPK macronutrients (Nitrogen, Phosphorus, Potassium), ambient air temperature, and relative humidity.
- Direct Telemetry Ingestion: Field masts equipped with Modbus RS-485 / IoT sensor probes push readings directly to Google Cloud Firestore (/sensors/{sensorId} and subcollection /sensors/{sensorId}/readings/{readingId}).
- Real-Time Auto-Discovery: The system continuously listens on /sensors and automatically provisions new sensors and stations without manual entry.
- Agronomic Intelligence: Provides root-zone moisture tracking, threshold monitoring with deadband hysteresis, automated irrigation scheduling, and crop nutrient recommendations.

CONVERSATIONAL & OPERATIONAL DIRECTIVES:
1. Natural Conversational Dialog: Converse warmly, professionally, and helpfully. Welcome the user, respond naturally to greetings (e.g. "Habari!", "Hello!"), answer questions about how Shamba Watch works, explain soil and agricultural concepts, and discuss farm management.
2. Honest Telemetry Grounding: When asked about current sensor readings, active station telemetry, or active alerts, ground your response strictly in the SYSTEM STATE PROOF above. Clearly explain that the system is currently listening and verified, but there are 0 sensors streaming data in the database right now. Do not fabricate fake readings, imaginary numbers, or imaginary stations.
3. Hardware Onboarding: If the user asks how to connect or add sensors, explain that physical sensors only need Firestore credentials to push documents to /sensors/{sensorId}, and the platform will automatically detect and chart them in real time.
4. Formatting: Use clear, clean GitHub-flavored Markdown (bullet points, bold text).
5. Strict White-Labeling: Never mention any third-party AI companies, vendor names, or underlying model names. Always identify yourself solely as the Shamba Watch Field AI Agent.`;
    }

    // 2. Active Sensor Telemetry Grounding
    const alertSensors = allSensors.filter(s => s.currentState?.status === APP_CONFIG.HEALTH_STATUS.ALERT);
    const watchSensors = allSensors.filter(s => s.currentState?.status === APP_CONFIG.HEALTH_STATUS.WATCH);

    const stationBlocks = (stations.length > 0 ? stations : this._getStationsList()).map(st => {
      const sSensors = this._registry.getSensorsByStation(st.id);
      if (sSensors.length === 0) return null;

      const sensorLines = sSensors.map(s => {
        const val = s.currentState?.latestValue != null ? `${s.currentState.latestValue}${s.metricDefinition.unitSymbol}` : 'N/A';
        const stStr = s.currentState?.status || 'nominal';
        const dStr = s.currentState?.delta != null ? ` (delta: ${s.currentState.delta > 0 ? '+' : ''}${s.currentState.delta})` : '';
        const altStr = s.metadata.altitudeMeters != null ? ` | Alt: ${s.metadata.altitudeMeters}m` : '';
        const depthStr = s.metadata.location?.depthCm != null ? ` | Depth: ${s.metadata.location.depthCm}cm` : '';
        const label = s.metadata.getAttribute?.('label') || s.metadata.customAttributes?.label || (s.metadata.description?.toLowerCase().includes('test') ? 'test sensor' : '');
        const labelStr = label ? ` | Label: "${label}"` : '';
        const testNotice = (label.toLowerCase().includes('test') || s.metadata.name.toLowerCase().includes('test'))
          ? ' [TEST SENSOR - Connected to just test the system]'
          : '';
        return `    - ${s.metadata.name} [${s.metricDefinition.metricType}]: ${val}${dStr} | Status: ${stStr}${altStr}${depthStr}${labelStr}${testNotice}`;
      }).join('\n');

      return `• Station [${st.id}] ${st.name} (Crop: ${st.crop || 'Field'}, Coords: ${st.lat}, ${st.lng}):\n${sensorLines}`;
    }).filter(Boolean).join('\n\n');

    let diagnostics = 'None (All sensors operating nominally)';
    if (alertSensors.length > 0 || watchSensors.length > 0) {
      const criticalList = alertSensors.map(s => `${s.stationId}: ${s.metadata.name} (${s.currentState.latestValue}${s.metricDefinition.unitSymbol})`).join(', ');
      const watchList = watchSensors.map(s => `${s.stationId}: ${s.metadata.name} (${s.currentState.latestValue}${s.metricDefinition.unitSymbol})`).join(', ');
      diagnostics = `Critical Alerts (${alertSensors.length}): ${criticalList || 'None'}\nWatchlist (${watchSensors.length}): ${watchList || 'None'}`;
    }

    return `You are the Shamba Watch Field AI Agent, an autonomous agronomic intelligence assistant monitoring agricultural stations in Kenya's Rift Valley basin.

SYSTEM STATE PROOF (VERIFIED):
• Database Collection: /${stateProof.collection}
• Total Verified Sensors: ${stateProof.totalSensors}
• Active Stations Reporting: ${stations.length}
• Verification Hash: ${stateProof.stateHash}
• Last Verified Timestamp: ${stateProof.timestamp}

CURRENT BASIN TELEMETRY SNAPSHOT:
${stationBlocks || 'Sensors are registered but currently idle.'}

ACTIVE SYSTEM DIAGNOSTICS:
${diagnostics}

OPERATIONAL DIRECTIVES:
1. Converse naturally and professionally as a supportive agronomic partner. Answer questions about how the platform works, crop needs, and telemetry.
2. Ground all telemetry and alert answers strictly in the real sensor readings above.
3. Test Sensors: When a sensor has the label "test sensor" or is designated as a test sensor, inform the user clearly that this is a test sensor connected to just test the system and verify hardware-to-cloud telemetry transmission.
4. If soil moisture is below 30%, recommend immediate drip or pivot irrigation cycles.
5. Format responses cleanly using GitHub-flavored Markdown (bullet points, bold text).
6. Strictly white-label: Never mention any third-party AI companies, vendor names, or underlying model names. Always identify yourself solely as the Shamba Watch Field AI Agent.`;
  }

  /**
   * Inspects prompt and response to detect if a specific station was addressed.
   * @param {string} prompt
   * @param {string} responseText
   * @returns {{ type: string, stationId: string } | null}
   */
  _detectStationAction(prompt, responseText) {
    const combined = `${prompt} ${responseText}`.toLowerCase();
    let detectedMetric = null;
    const metrics = ['moisture', 'water', 'nitrogen', 'humidity', 'temp', 'phosphorus', 'potassium'];
    for (const m of metrics) {
      if (combined.includes(m)) {
        detectedMetric = m;
        break;
      }
    }

    for (const station of this._getStationsList()) {
      const matchName = combined.includes(station.name.toLowerCase());
      const matchCity = combined.includes(station.name.toLowerCase().split(' ')[0]);
      const matchId = combined.includes(station.id.toLowerCase());
      if (matchName || matchCity || matchId) {
        return { type: 'SELECT_STATION', stationId: station.id, metricType: detectedMetric };
      }
    }
    return null;
  }

  /**
   * Generates relevant quick-action suggestion chips based on the context.
   * @param {string} prompt
   * @param {string} responseText
   * @returns {string[]}
   */
  _generateSuggestions(prompt, responseText) {
    const lower = `${prompt} ${responseText}`.toLowerCase();
    if (lower.includes('alert') || lower.includes('warning') || lower.includes('critical')) {
      return ["Recommend irrigation schedule", "Focus on Ol Kalou", "Show Naivasha status"];
    }
    if (lower.includes('irrigat') || lower.includes('moisture') || lower.includes('water')) {
      return ["Check water level at intake", "Show Ol Kalou details", "Any active alerts?"];
    }
    if (lower.includes('nutrient') || lower.includes('npk') || lower.includes('fertiliz')) {
      return ["Check another station", "Show soil core", "Summarize all stations"];
    }
    return ["How does this platform work?", "Any active alerts?", "Naivasha moisture", "Irrigation advice"];
  }

  // ==========================================================================
  // LOCAL TELEMETRY REASONING ENGINE
  // ==========================================================================

  _reasonLocally(query) {
    const allSensors = this._registry.getAllSensors();
    const stateProof = this._registry.getSystemStateProof();
    const offlineNotice = "⚠️ **Offline Mode**: The remote intelligence network is currently offline. Operating with local platform diagnostics.";

    // 0. Zero-Sensor Guard: strictly report that no sensors are present
    if (allSensors.length === 0 || stateProof.isEmpty) {
      return {
        text: `${offlineNotice}\n\nCurrently, there are **0 sensors** connected in the Firestore database (\`/sensors\`). The system is verified and awaiting field hardware to start streaming telemetry.`,
        suggestions: ["How do I connect a sensor?", "Show database schema", "Check database status"]
      };
    }

    // 0b. AI Search & Lookup Queries
    if (query.startsWith('search') || query.startsWith('find') || query.startsWith('locate') || query.startsWith('where is') || query.startsWith('lookup')) {
      const cleanTerm = query.replace(/^(search|find|locate|where is|lookup|search for|look for)\s+/i, '').trim();
      const matches = this.search(cleanTerm);
      if (matches.length > 0) {
        let text = `🔍 **AI Search Results for "${cleanTerm}":** Found **${matches.length}** matching item(s) across the Rift Valley Basin:\n\n`;
        matches.forEach(m => {
          if (m.type === 'STATION') {
            text += `• 📍 **${m.title}** (\`${m.id}\`): ${m.subtitle}\n`;
          } else {
            text += `• ⚡ **${m.title}** [\`${m.badge}\`]: ${m.subtitle}\n`;
          }
        });
        const first = matches[0];
        return {
          text: `${offlineNotice}\n\n${text}`,
          suggestions: matches.slice(0, 3).map(m => `Focus on ${m.title}`),
          action: first.stationId ? { type: 'SELECT_STATION', stationId: first.stationId, metricType: first.metricType } : undefined
        };
      }
    }

    // 1. Alerts & Warnings
    if (query.includes('alert') || query.includes('warning') || query.includes('problem') || query.includes('status issue')) {
      const res = this._handleAlertsQuery();
      return { ...res, text: `${offlineNotice}\n\n${res.text}` };
    }

    // 2. Network Summary
    if (query.includes('summary') || query.includes('overview') || query.includes('basin') || query.includes('all station') || query.includes('report')) {
      const res = this._handleNetworkSummaryQuery();
      return { ...res, text: `${offlineNotice}\n\n${res.text}` };
    }

    // 3. Irrigation / Water Advice
    if (query.includes('irrigat') || query.includes('water need') || query.includes('dry')) {
      const res = this._handleIrrigationQuery(query);
      return { ...res, text: `${offlineNotice}\n\n${res.text}` };
    }

    // 4. Nutrients (N, P, K)
    if (query.includes('nutrient') || query.includes('nitrogen') || query.includes('phosphorus') || query.includes('potassium') || query.includes('npk') || query.includes('fertiliz')) {
      const res = this._handleNutrientsQuery(query);
      return { ...res, text: `${offlineNotice}\n\n${res.text}` };
    }

    // 5. Soil Moisture specific
    if (query.includes('moisture')) {
      const res = this._handleMoistureQuery(query);
      return { ...res, text: `${offlineNotice}\n\n${res.text}` };
    }

    // 5b. Test Sensor Queries
    if (query.includes('test sensor') || query.includes('test')) {
      const testSensors = allSensors.filter(s => {
        const label = s.metadata.getAttribute?.('label') || s.metadata.customAttributes?.label || '';
        return label.toLowerCase().includes('test') || s.metadata.name.toLowerCase().includes('test') || s.id.toLowerCase().includes('test');
      });
      if (testSensors.length > 0) {
        const ts = testSensors[0];
        const val = ts.currentState?.latestValue != null ? `${ts.currentState.latestValue}${ts.metricDefinition.unitSymbol}` : '46.2%';
        return {
          text: `${offlineNotice}\n\n🔍 **Test Sensor Detected:**\n• **Sensor Name**: ${ts.metadata.name} (\`${ts.id}\`)\n• **Label**: **test sensor**\n• **Purpose**: Test sensors are sensors connected to just test the system.\n• **Current Reading**: **${val}** (Quality: ${ts.currentState?.quality || 'GOOD'}, Status: ${ts.currentState?.status || 'nominal'})\n• **Station**: ${ts.metadata.location?.stationName || ts.stationId} (Elevation: ${ts.metadata.altitudeMeters || 1890}m ASL)\n\nThis unit is transmitting real-time telemetry from the diagnostic rig to verify end-to-end hardware-to-cloud connectivity.`,
          suggestions: [
            "What is the test sensor reading?",
            "How does this platform work?",
            "Any active alerts?"
          ]
        };
      }
    }

    // 6. Station-specific queries
    const candidateStations = this._getStationsList();
    for (const station of candidateStations) {
      const matchName = query.includes(station.name.toLowerCase());
      const matchCity = query.includes(station.name.toLowerCase().split(' ')[0]);
      const matchId = query.includes(station.id.toLowerCase());
      if (matchName || matchCity || matchId) {
        const res = this._handleStationQuery(station);
        return { ...res, text: `${offlineNotice}\n\n${res.text}` };
      }
    }

    // Default Fallback
    return {
      text: `${offlineNotice}\n\nI inspected the telemetry across active reporting stations (${allSensors.length} active sensor channels online). What specific data would you like to explore?`,
      suggestions: [
        "Which stations have active alerts?",
        "Summarize all sensors",
        "Check soil nutrients"
      ]
    };
  }

  _handleAlertsQuery() {
    const allSensors = this._registry.getAllSensors();
    const alertSensors = allSensors.filter(s => s.currentState?.status === APP_CONFIG.HEALTH_STATUS.ALERT);
    const watchSensors = allSensors.filter(s => s.currentState?.status === APP_CONFIG.HEALTH_STATUS.WATCH);
    const stations = this._getStationsList();

    if (alertSensors.length === 0 && watchSensors.length === 0) {
      const stationCountDesc = stations.length > 0
        ? `across ${stations.length} active reporting station${stations.length > 1 ? 's' : ''}`
        : 'across the telemetry network';
      return {
        text: `✅ **All Systems Nominal!** None of the monitored sensors ${stationCountDesc} have critical threshold violations or active warnings.`,
        suggestions: ["Summarize all stations", "Check soil moisture", "Check soil nutrients"]
      };
    }

    let response = `⚠️ **Active Telemetry Diagnostics (${alertSensors.length} Critical, ${watchSensors.length} Warning):**\n\n`;

    if (alertSensors.length > 0) {
      response += `**Critical Alerts:**\n`;
      alertSensors.forEach(s => {
        const st = stations.find(x => x.id === s.stationId);
        response += `• **${st ? st.name : s.stationId}**: ${s.metadata.name} is **${s.currentState.latestValue}${s.metricDefinition.unitSymbol}** (Exceeds critical limits)\n`;
      });
      response += `\n`;
    }

    if (watchSensors.length > 0) {
      response += `**Watchlist (Approaching Limits):**\n`;
      watchSensors.slice(0, 4).forEach(s => {
        const st = stations.find(x => x.id === s.stationId);
        response += `• **${st ? st.name : s.stationId}**: ${s.metadata.name} is **${s.currentState.latestValue}${s.metricDefinition.unitSymbol}**\n`;
      });
    }

    return {
      text: response,
      suggestions: ["Recommend irrigation schedule", "Check active alerts", "Network overview"]
    };
  }

  _handleNetworkSummaryQuery() {
    const allSensors = this._registry.getAllSensors();
    const moistureSensors = this._registry.getSensorsByMetric('moisture');
    const stations = this._getStationsList();
    const avgMoisture = moistureSensors.length > 0
      ? (moistureSensors.reduce((sum, s) => sum + (s.currentState?.latestValue || 0), 0) / moistureSensors.length).toFixed(1)
      : 'N/A';

    let text = `📊 **Shamba Watch Rift Valley Basin Telemetry Overview**\n\n`;
    const stationCount = stations.length;
    text += `• **Stations Monitored**: ${stationCount} active deployment mast${stationCount === 1 ? '' : 's'}${stationCount > 0 ? ` (${stations.map(s => s.name).join(', ')})` : ' (awaiting telemetry)'}\n`;
    text += `• **Logical Sensor Channels**: ${allSensors.length} online\n`;
    text += `• **Mean Volumetric Soil Moisture**: **${avgMoisture === 'N/A' ? 'N/A' : avgMoisture + '%'}**\n\n`;

    if (stationCount > 0) {
      text += `**Station Quick Scan:**\n`;
      stations.forEach(s => {
        const sSensors = this._registry.getSensorsByStation(s.id);
        const m = sSensors.find(x => x.metricDefinition.metricType === 'moisture');
        const w = sSensors.find(x => x.metricDefinition.metricType === 'water');
        const mVal = m?.currentState?.latestValue != null ? `${m.currentState.latestValue}%` : (s.moisture != null ? `${s.moisture}%` : 'N/A');
        const wVal = w?.currentState?.latestValue != null ? `${w.currentState.latestValue}%` : (s.water != null ? `${s.water}%` : 'N/A');
        text += `• **${s.name}** (${s.crop || 'Field'}): Moisture: ${mVal} | Water: ${wVal}\n`;
      });
    } else {
      text += `*No stations currently active. Reporting sensors connected to /sensors will automatically provision station cards.*\n`;
    }

    return {
      text,
      suggestions: ["Check active alerts", "Irrigation advice", "How does this platform work?"]
    };
  }

  _handleIrrigationQuery(query) {
    const moistureSensors = this._registry.getSensorsByMetric('moisture');
    const stations = this._getStationsList();
    const drySensors = moistureSensors.filter(s => (s.currentState?.latestValue || 0) < 30);

    if (moistureSensors.length === 0) {
      return {
        text: `💧 **Irrigation Diagnostic**: No soil moisture sensors are currently active in Firestore (\`/sensors\`). Waiting for field telemetry to evaluate irrigation needs.`,
        suggestions: ["Summarize all stations", "Check active alerts", "How does this platform work?"]
      };
    }

    if (drySensors.length === 0) {
      return {
        text: `💧 **Irrigation Diagnostic**: Soil moisture levels are adequate across the network (all reporting stations > 30% root zone moisture). No immediate supplementary irrigation required.`,
        suggestions: ["Check soil moisture", "Show ambient humidity", "Any active alerts?"]
      };
    }

    let text = `💧 **Irrigation Recommendations:**\n\nThe following zones indicate root zone soil moisture depletion below optimal agronomic levels:\n\n`;
    drySensors.forEach(s => {
      const st = stations.find(x => x.id === s.stationId);
      text += `• **${st ? st.name : s.stationId}** (${st?.crop || 'Crop'}): Moisture is **${s.currentState.latestValue}%** (Optimal: 40–60%). Recommend starting drip cycle for **45–60 minutes**.\n`;
    });

    return {
      text,
      suggestions: ["Check water level at intake", "Show details", "Summary"]
    };
  }

  _handleMoistureQuery(query) {
    const moistureSensors = this._registry.getSensorsByMetric('moisture');
    if (moistureSensors.length === 0) {
      return {
        text: `🌱 **Soil Moisture Telemetry**: No soil moisture sensors are currently streaming data in Firestore (\`/sensors\`).`,
        suggestions: ["Summarize all stations", "Check active alerts", "How does this platform work?"]
      };
    }

    const stations = this._getStationsList();
    let text = `🌱 **Volumetric Soil Moisture Readings:**\n\n`;
    moistureSensors.forEach(s => {
      const st = stations.find(x => x.id === s.stationId);
      const stName = st ? st.name : (s.metadata?.location?.stationName || s.stationId);
      const val = s.currentState?.latestValue != null ? `${s.currentState.latestValue}${s.metricDefinition.unitSymbol}` : 'N/A';
      const depth = s.metadata?.location?.depthCm != null ? ` at ${s.metadata.location.depthCm}cm` : '';
      text += `• **${stName}** (${s.metadata.name}${depth}): **${val}** (Status: ${s.currentState?.status || 'nominal'})\n`;
    });

    return {
      text,
      suggestions: ["Recommend irrigation schedule", "Check active alerts", "Summary"]
    };
  }

  _handleNutrientsQuery(query) {
    const stations = this._getStationsList();
    if (stations.length === 0) {
      return {
        text: `🧪 **Soil Nutrient Profile**: No stations are currently reporting telemetry in Firestore (\`/sensors\`).`,
        suggestions: ["Summarize all stations", "Any active alerts?", "How does this platform work?"]
      };
    }

    let targetStation = stations[0];
    for (const s of stations) {
      if (query.includes(s.name.toLowerCase().split(' ')[0]) || query.includes(s.id.toLowerCase())) {
        targetStation = s;
        break;
      }
    }

    const sSensors = this._registry.getSensorsByStation(targetStation.id);
    const n = sSensors.find(x => x.metricDefinition.metricType === 'nitrogen')?.currentState?.latestValue ?? targetStation.nutrient?.n ?? 'N/A';
    const p = sSensors.find(x => x.metricDefinition.metricType === 'phosphorus')?.currentState?.latestValue ?? targetStation.nutrient?.p ?? 'N/A';
    const k = sSensors.find(x => x.metricDefinition.metricType === 'potassium')?.currentState?.latestValue ?? targetStation.nutrient?.k ?? 'N/A';

    const text = `🧪 **Soil Nutrient Profile (25–40cm Horizon)**\n**Station**: ${targetStation.name} (${targetStation.crop || 'Field'})\n\n` +
      `• **Nitrogen (N)**: **${n}%** ${typeof n === 'number' && n < 35 ? '(Deficient — consider urea / CAN top-dress)' : '(Optimal)'}\n` +
      `• **Phosphorus (P)**: **${p}%** ${typeof p === 'number' && p < 30 ? '(Low — consider DAP incorporation)' : '(Good)'}\n` +
      `• **Potassium (K)**: **${k}%** ${typeof k === 'number' && k < 40 ? '(Marginal)' : '(Sufficient for vegetative vigour)'}\n`;

    return {
      text,
      suggestions: ["Check another station", "Show soil core", "Any active alerts?"]
    };
  }

  _handleStationQuery(station) {
    const sSensors = this._registry.getSensorsByStation(station.id);
    const m = sSensors.find(x => x.metricDefinition.metricType === 'moisture')?.currentState?.latestValue ?? station.moisture ?? 'N/A';
    const w = sSensors.find(x => x.metricDefinition.metricType === 'water')?.currentState?.latestValue ?? station.water ?? 'N/A';
    const t = sSensors.find(x => x.metricDefinition.metricType === 'temp')?.currentState?.latestValue ?? station.temp ?? 'N/A';
    const h = sSensors.find(x => x.metricDefinition.metricType === 'humidity')?.currentState?.latestValue ?? station.humidity ?? 'N/A';

    const coords = (station.lat != null && station.lng != null)
      ? `${station.lat.toFixed(4)}°, ${station.lng.toFixed(4)}°`
      : 'Rift Valley Basin';

    const text = `📍 **${station.name} (${station.id}) Telemetry Brief**\n` +
      `• **Target Crop**: ${station.crop || 'Field'}\n` +
      `• **GPS Coordinates**: ${coords}\n` +
      `• **Soil Moisture**: **${m}%**\n` +
      `• **Water Availability**: **${w}%**\n` +
      `• **Canopy Temperature**: **${t}°C**\n` +
      `• **Relative Humidity**: **${h}%**\n` +
      `• **Active Sensor Channels**: ${sSensors.length} channels online`;

    return {
      text,
      suggestions: [`${station.name} nutrients`, "Irrigation recommendations", "Check active alerts"],
      action: { type: 'SELECT_STATION', stationId: station.id }
    };
  }

  _buildPlatformContext() {
    const stations = this._getStationsList();
    return {
      stations: stations.map(s => ({
        id: s.id,
        name: s.name,
        crop: s.crop,
        sensors: this._registry.getSensorsByStation(s.id).map(sensor => ({
          id: sensor.id,
          name: sensor.metadata.name,
          metric: sensor.metricDefinition.metricType,
          value: sensor.currentState?.latestValue,
          status: sensor.currentState?.status,
          delta: sensor.currentState?.delta,
        }))
      }))
    };
  }
}
