/**
 * @fileoverview NotificationManager Component.
 * Manages toast notifications for newly discovered field sensors, system alerts, and status changes.
 * Adheres to SWE Principle 1 (SRP) and Principle 2 (Separation of Concerns).
 */

import { Logger } from '../config/app-config.js';

export class NotificationManager {
  /**
   * @param {HTMLElement} [containerEl] - Optional container to mount notifications into.
   * @param {Function} [onSelectStation] - Callback when user clicks 'View' on a sensor notification.
   */
  constructor(containerEl = null, onSelectStation = null) {
    this._container = containerEl || this._createDefaultContainer();
    this._onSelectStation = onSelectStation;
    this._notifications = new Map();
  }

  /**
   * Displays a notification when a new physical sensor is detected on the network.
   * @param {import('../domain/sensor.js').Sensor} sensor
   * @param {string} [stationName]
   */
  notifyNewSensor(sensor, stationName = null) {
    const stationLabel = stationName || sensor.stationId;
    const title = 'New Sensor Detected';
    const message = `Online: ${sensor.metadata.name} at ${stationLabel}`;
    
    this._showToast({
      id: `sensor-${sensor.id}-${Date.now()}`,
      type: 'discovery',
      icon: '🌱',
      title,
      message,
      actionLabel: 'View Sensor',
      onAction: () => {
        if (this._onSelectStation) {
          this._onSelectStation(sensor.stationId, sensor.id);
        }
      },
      durationMs: 7000,
    });

    Logger.info('NotificationManager', `Discovery toast displayed for sensor: ${sensor.id}`);
  }

  /**
   * Displays an alert notification.
   * @param {string} title
   * @param {string} message
   * @param {number} [durationMs=6000]
   */
  notifyAlert(title, message, durationMs = 6000) {
    this._showToast({
      id: `alert-${Date.now()}`,
      type: 'alert',
      icon: '⚠️',
      title,
      message,
      durationMs,
    });
  }

  /**
   * Displays a general informational notification.
   * @param {string} title
   * @param {string} message
   * @param {number} [durationMs=5000]
   */
  notifyInfo(title, message, durationMs = 5000) {
    this._showToast({
      id: `info-${Date.now()}`,
      type: 'info',
      icon: 'ℹ️',
      title,
      message,
      durationMs,
    });
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  _createDefaultContainer() {
    let container = document.getElementById('shambaNotificationContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'shambaNotificationContainer';
      container.className = 'shamba-notification-container';
      document.body.appendChild(container);
    }
    return container;
  }

  _showToast({ id, type, icon, title, message, actionLabel, onAction, durationMs }) {
    const toast = document.createElement('div');
    toast.className = `shamba-toast toast-${type}`;
    toast.id = id;

    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
      ${actionLabel ? `<button class="toast-action-btn" type="button">${actionLabel}</button>` : ''}
      <button class="toast-close-btn" type="button" aria-label="Close">&times;</button>
    `;

    // Event listeners
    if (actionLabel && onAction) {
      const actionBtn = toast.querySelector('.toast-action-btn');
      if (actionBtn) {
        actionBtn.addEventListener('click', () => {
          onAction();
          this._dismissToast(toast);
        });
      }
    }

    const closeBtn = toast.querySelector('.toast-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this._dismissToast(toast));
    }

    this._container.prepend(toast);

    // Trigger enter animation
    requestAnimationFrame(() => {
      toast.classList.add('toast-visible');
    });

    // Auto dismiss timer
    if (durationMs > 0) {
      setTimeout(() => {
        this._dismissToast(toast);
      }, durationMs);
    }
  }

  _dismissToast(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-leaving');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }
}
