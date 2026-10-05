/**
 * @fileoverview AiChatBar UI Component.
 * Floating, unobtrusive AI input bar anchored at bottom center with an expandable,
 * full-featured multi-turn conversational dialogue drawer.
 * Adheres to SWE Principle 1 (SRP), Principle 2 (Separation of Concerns), and Principle 3.
 */

export class AiChatBar {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.mountEl - The container element to mount into.
   * @param {import('../services/shamba-agent.js').ShambaAgent} options.agent - The AI agent.
   * @param {(stationId: string) => void} [options.onSelectStation] - Callback to select station.
   */
  constructor({ mountEl, agent, onSelectStation = null }) {
    this._mountEl = mountEl;
    this._agent = agent;
    this._onSelectStation = onSelectStation;
    this._isOpen = false;
    this._conversationHistory = []; // { role: 'user' | 'assistant', content: string }
    this._messages = []; // Renderable message models { role, content, time }
    this._isFullscreen = false;

    this._render();
    this._bindEvents();
    this._initWelcomeMessage();
  }

  _initWelcomeMessage() {
    this._addMessage({
      role: 'assistant',
      content: "Habari! I am the **Shamba Watch Field AI Agent**, your conversational agronomic partner.\n\nAsk me how the platform works, check real-time sensor telemetry, or get advice on irrigation, soil nutrients, and crop health across the Rift Valley basin.",
      time: this._getTimeString()
    });
  }

  _render() {
    this._mountEl.className = 'ai-chat-container';
    this._mountEl.innerHTML = `
      <!-- Floating Conversational Dialog Popover (Expands above bar) -->
      <div class="ai-popover" id="aiPopover" aria-hidden="true">
        <div class="ai-popover-header">
          <div class="ai-header-brand">
            <span class="ai-sparkle">✦</span>
            <span class="ai-header-title">Shamba Watch Field AI</span>
            <span class="ai-header-status">
              <span class="ai-status-dot"></span>
              <span class="ai-status-text">Intelligence Gateway</span>
            </span>
          </div>
          <div class="ai-header-actions">
            <button class="ai-btn-expand" id="aiExpandBtn" type="button" title="Fit chat to full screen" aria-label="Toggle Fullscreen">⛶ Fit Screen</button>
            <button class="ai-btn-clear" id="aiClearBtn" type="button" title="Clear conversation history">↺ Clear</button>
            <button class="ai-popover-close" id="aiCloseBtn" type="button" aria-label="Minimize">&times;</button>
          </div>
        </div>

        <!-- Scrollable Multi-Turn Message Feed -->
        <div class="ai-message-list" id="aiMessageList"></div>

        <!-- Suggestion Chips -->
        <div class="ai-suggestions" id="aiSuggestions">
          <button class="ai-chip" type="button">How does this platform work?</button>
          <button class="ai-chip" type="button">Any active alerts?</button>
          <button class="ai-chip" type="button">Naivasha moisture</button>
          <button class="ai-chip" type="button">Irrigation advice</button>
        </div>

        <!-- In-Drawer Input Bar -->
        <form class="ai-dialog-form" id="aiDialogForm">
          <input 
            type="text" 
            id="aiDialogInput" 
            class="ai-dialog-input" 
            placeholder="Type a message or agronomic question..." 
            autocomplete="off" 
            spellcheck="false"
          />
          <button type="submit" class="ai-dialog-send-btn" aria-label="Send Message">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </form>
      </div>

      <!-- Small Floating Bar at Center Bottom -->
      <form class="ai-bar-pill" id="aiBarForm">
        <span class="ai-pill-sparkle">✦</span>
        <input 
          type="text" 
          id="aiInput" 
          class="ai-pill-input" 
          placeholder="Ask Shamba Watch AI..." 
          autocomplete="off" 
          spellcheck="false"
        />
        <button type="submit" class="ai-pill-send-btn" aria-label="Submit Question">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="19" x2="12" y2="5"></line>
            <polyline points="5 12 12 5 19 12"></polyline>
          </svg>
        </button>
      </form>
    `;
  }

  _bindEvents() {
    const barForm = this._mountEl.querySelector('#aiBarForm');
    const barInput = this._mountEl.querySelector('#aiInput');
    const dialogForm = this._mountEl.querySelector('#aiDialogForm');
    const dialogInput = this._mountEl.querySelector('#aiDialogInput');
    const closeBtn = this._mountEl.querySelector('#aiCloseBtn');
    const clearBtn = this._mountEl.querySelector('#aiClearBtn');
    const suggestionsEl = this._mountEl.querySelector('#aiSuggestions');

    // Bottom floating pill submission
    barForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = barInput.value.trim();
      if (!val) return;
      barInput.value = '';
      await this.ask(val);
    });

    // In-drawer input submission
    dialogForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = dialogInput.value.trim();
      if (!val) return;
      dialogInput.value = '';
      await this.ask(val);
    });

    // Clear chat history
    clearBtn.addEventListener('click', () => {
      this.clearChat();
    });

    // Toggle Fit Screen / Fullscreen
    const expandBtn = this._mountEl.querySelector('#aiExpandBtn');
    if (expandBtn) {
      expandBtn.addEventListener('click', () => {
        this.toggleFullscreen();
      });
    }

    // Minimize popover
    closeBtn.addEventListener('click', () => {
      this.close();
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._isOpen) {
        this.close();
      }
    });

    // Light-dismiss: close when clicking outside popover (if not full screen)
    document.addEventListener('pointerdown', (e) => {
      if (!this._isOpen || this._isFullscreen) return;
      const popover = this._mountEl.querySelector('#aiPopover');
      const barForm = this._mountEl.querySelector('#aiBarForm');
      if (popover && !popover.contains(e.target) && (!barForm || !barForm.contains(e.target))) {
        this.close();
      }
    });

    // Suggestion chips delegation
    suggestionsEl.addEventListener('click', (e) => {
      const chip = e.target.closest('.ai-chip');
      if (chip) {
        this.ask(chip.textContent.trim());
      }
    });
  }

  /**
   * Submits a question to the AI agent and updates the conversational feed.
   * @param {string} prompt
   */
  async ask(prompt) {
    this.open();

    const timeStr = this._getTimeString();

    // 1. Add User Message
    this._addMessage({
      role: 'user',
      content: prompt,
      time: timeStr
    });

    // 2. Show Loading Indicator
    this._showLoading();

    try {
      // 3. Query agent with multi-turn conversation history
      const result = await this._agent.query(prompt, this._conversationHistory);

      // Remove loading bubble
      this._hideLoading();

      // 4. Update multi-turn history memory
      this._conversationHistory.push({ role: 'user', content: prompt });
      this._conversationHistory.push({ role: 'assistant', content: result.text });

      // 5. Add Assistant Message
      this._addMessage({
        role: 'assistant',
        content: result.text,
        time: this._getTimeString()
      });

      // 6. Handle UI action (e.g., station focus)
      if (result.action && result.action.type === 'SELECT_STATION' && this._onSelectStation) {
        this._onSelectStation(result.action.stationId);
      }

      // 7. Update Suggestion Chips
      if (Array.isArray(result.suggestions) && result.suggestions.length > 0) {
        this._renderSuggestions(result.suggestions);
      }

      // Focus drawer input for immediate typing
      const dialogInput = this._mountEl.querySelector('#aiDialogInput');
      if (dialogInput) dialogInput.focus();

    } catch (error) {
      this._hideLoading();
      this._addMessage({
        role: 'assistant',
        content: `⚠️ Sorry, I encountered an issue: ${error.message}`,
        time: this._getTimeString(),
        isError: true
      });
    }
  }

  _addMessage({ role, content, time, isError = false }) {
    this._messages.push({ role, content, time, isError });
    const listEl = this._mountEl.querySelector('#aiMessageList');
    if (!listEl) return;

    const msgEl = document.createElement('div');
    msgEl.className = `ai-message ai-message-${role} ${isError ? 'ai-message-error' : ''}`;

    if (role === 'assistant') {
      const formattedContent = this._formatMarkdown(content);
      msgEl.innerHTML = `
        <div class="ai-msg-avatar">✦</div>
        <div class="ai-msg-bubble">
          <div class="ai-msg-body">${formattedContent}</div>
          <div class="ai-msg-time">${time}</div>
        </div>
      `;
    } else {
      const escaped = this._escapeHtml(content);
      msgEl.innerHTML = `
        <div class="ai-msg-bubble">
          <div class="ai-msg-body">${escaped}</div>
          <div class="ai-msg-time">${time}</div>
        </div>
      `;
    }

    listEl.appendChild(msgEl);
    this._scrollToBottom();
  }

  _showLoading() {
    const listEl = this._mountEl.querySelector('#aiMessageList');
    if (!listEl || listEl.querySelector('#aiLoadingIndicator')) return;

    const loadEl = document.createElement('div');
    loadEl.id = 'aiLoadingIndicator';
    loadEl.className = 'ai-message ai-message-assistant ai-loading-item';
    loadEl.innerHTML = `
      <div class="ai-msg-avatar">✦</div>
      <div class="ai-msg-bubble">
        <div class="ai-loading-dots">
          <span class="ai-pulse-dot"></span>
          <span class="ai-pulse-dot"></span>
          <span class="ai-pulse-dot"></span>
          <span class="ai-loading-text">Analyzing telemetry...</span>
        </div>
      </div>
    `;
    listEl.appendChild(loadEl);
    this._scrollToBottom();
  }

  _hideLoading() {
    const loadEl = this._mountEl.querySelector('#aiLoadingIndicator');
    if (loadEl) loadEl.remove();
  }

  _scrollToBottom() {
    const listEl = this._mountEl.querySelector('#aiMessageList');
    if (listEl) {
      listEl.scrollTop = listEl.scrollHeight;
    }
  }

  _renderSuggestions(suggestions) {
    const suggestionsEl = this._mountEl.querySelector('#aiSuggestions');
    if (!suggestionsEl) return;
    suggestionsEl.innerHTML = suggestions
      .map(s => `<button class="ai-chip" type="button">${this._escapeHtml(s)}</button>`)
      .join('');
  }

  clearChat() {
    this._messages = [];
    this._conversationHistory = [];
    const listEl = this._mountEl.querySelector('#aiMessageList');
    if (listEl) listEl.innerHTML = '';
    this._initWelcomeMessage();
    this._renderSuggestions([
      "How does this platform work?",
      "Any active alerts?",
      "Naivasha moisture",
      "Irrigation advice"
    ]);
  }

  open() {
    this._isOpen = true;
    const popover = this._mountEl.querySelector('#aiPopover');
    if (popover) {
      popover.classList.add('visible');
      popover.setAttribute('aria-hidden', 'false');
      this._scrollToBottom();
      const dialogInput = this._mountEl.querySelector('#aiDialogInput');
      if (dialogInput) dialogInput.focus();
    }
  }

  toggleFullscreen(force = null) {
    this._isFullscreen = (force !== null) ? Boolean(force) : !this._isFullscreen;
    const popover = this._mountEl.querySelector('#aiPopover');
    const expandBtn = this._mountEl.querySelector('#aiExpandBtn');
    if (popover) {
      popover.classList.toggle('ai-fullscreen', this._isFullscreen);
    }
    if (expandBtn) {
      expandBtn.innerHTML = this._isFullscreen ? '🗗 Compact' : '⛶ Fit Screen';
      expandBtn.title = this._isFullscreen ? 'Restore compact size' : 'Fit to full screen';
    }
    this._scrollToBottom();
  }

  close() {
    this._isOpen = false;
    const popover = this._mountEl.querySelector('#aiPopover');
    if (popover) {
      popover.classList.remove('visible');
      popover.setAttribute('aria-hidden', 'true');
    }
  }

  _getTimeString() {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  _escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  _formatInline(str) {
    if (!str) return '';
    return str
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Code inline
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Italic
      .replace(/(?<!\*)\*([^\*]+)\*(?!\*)/g, '<em>$1</em>');
  }

  _formatMarkdown(text) {
    if (!text) return '';
    let src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 1. Tables Parser
    const tableRegex = /((?:^[ \t]*\|.+?\|[ \t]*(?:\n|$)){2,})/gm;
    src = src.replace(tableRegex, (match) => {
      const lines = match.trim().split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) return match;
      let headerCells = [];
      let rows = [];
      let hasHeader = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\|[ \t]*(?::?-+:?[ \t]*\|)+$/.test(line)) {
          if (i === 1 && lines.length > 1) hasHeader = true;
          continue;
        }
        const rawCells = line.split('|').slice(1, -1).map(c => c.trim());
        if (i === 0) headerCells = rawCells;
        else rows.push(rawCells);
      }

      let html = '\n<div class="ai-table-wrap"><table class="ai-table">';
      if (hasHeader && headerCells.length > 0) {
        html += '<thead><tr>';
        headerCells.forEach(c => { html += `<th>${this._formatInline(c)}</th>`; });
        html += '</tr></thead>';
      } else if (headerCells.length > 0) {
        rows.unshift(headerCells);
      }
      html += '<tbody>';
      rows.forEach(row => {
        html += '<tr>';
        row.forEach(c => { html += `<td>${this._formatInline(c)}</td>`; });
        html += '</tr>';
      });
      html += '</tbody></table></div>\n';
      return html;
    });

    // 2. Headings (###, ##, #)
    src = src.replace(/^###[ \t]+(.*)$/gm, '<h4 class="ai-h4">$1</h4>');
    src = src.replace(/^##[ \t]+(.*)$/gm, '<h3 class="ai-h3">$1</h3>');
    src = src.replace(/^#[ \t]+(.*)$/gm, '<h2 class="ai-h2">$1</h2>');

    // 3. Horizontal Rules
    src = src.replace(/^[ \t]*(\-{3,}|\*{3,})[ \t]*$/gm, '<hr class="ai-hr" />');

    // 4. Blockquotes
    src = src.replace(/^[ \t]*>[ \t]?(.*)$/gm, '<blockquote class="ai-quote">$1</blockquote>');

    // 5. Unordered List Items
    src = src.replace(/^[ \t]*[•\-\*][ \t]+(.*)$/gm, '<li class="ai-li">$1</li>');

    // 6. Ordered List Items
    src = src.replace(/^[ \t]*(\d+)\.[ \t]+(.*)$/gm, '<li class="ai-oli" value="$1">$2</li>');

    // Wrap consecutive lists
    src = src.replace(/((?:<li class="ai-li">.*?<\/li>\s*)+)/gs, '<ul class="ai-ul">$1</ul>');
    src = src.replace(/((?:<li class="ai-oli".*?<\/li>\s*)+)/gs, '<ol class="ai-ol">$1</ol>');

    // 7. Inline formatting
    src = this._formatInline(src);

    // 8. Line breaks
    src = src.replace(/\n\n+/g, '<br/><br/>');
    src = src.replace(/\n/g, '<br/>');

    // Clean extraneous breaks around block elements
    src = src.replace(/<\/(h2|h3|h4|div|table|ul|ol|blockquote)><br\/>/g, '</$1>');
    src = src.replace(/<br\/><(h2|h3|h4|div|table|ul|ol|blockquote)/g, '<$1');
    src = src.replace(/<br\/>\s*<\/(ol|ul)>/g, '</$1>');
    src = src.replace(/<(ol|ul)>\s*<br\/>/g, '<$1>');

    return src;
  }
}
