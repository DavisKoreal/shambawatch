/**
 * @fileoverview AdminPortalView — Administration Portal for Farmer & Station Management.
 * Fulfills requirement: Admins can view all farmers, view all stations, view unassigned stations,
 * and assign/reassign stations to farmers.
 * Adheres to Rules 1 (SRP), 2 (SoC), 6 (Low Cyclomatic Complexity), and 34 (Interface Adapters).
 */

import { StructuredLogger } from '../core/structured-logger.js';
import { UserRole } from '../services/auth-service.js';

export class AdminPortalView {
  /**
   * @param {Object} dependencies
   * @param {import('../services/auth-service.js').AuthService} dependencies.authService
   * @param {import('../services/station-service.js').StationService} dependencies.stationService
   * @param {HTMLElement} dependencies.mountEl
   * @param {() => void} [dependencies.onAssignmentChanged]
   */
  constructor({ authService, stationService, mountEl, onAssignmentChanged }) {
    this._authService = authService;
    this._stationService = stationService;
    this._mountEl = mountEl;
    this._onAssignmentChanged = onAssignmentChanged;
    this._logger = new StructuredLogger('AdminPortalView');
    this._isOpen = false;
    this._farmers = [];

    this._render();
    this._bindEvents();
  }

  /**
   * Opens the Admin Portal and refreshes data.
   */
  async open() {
    this._isOpen = true;
    const modal = this._mountEl.querySelector('.shamba-modal-overlay');
    if (modal) modal.classList.add('open');
    await this.refresh();
  }

  /**
   * Closes the Admin Portal.
   */
  close() {
    this._isOpen = false;
    const modal = this._mountEl.querySelector('.shamba-modal-overlay');
    if (modal) modal.classList.remove('open');
  }

  /**
   * Refreshes the farmer and station data from Firestore.
   */
  async refresh() {
    const loadingEl = this._mountEl.querySelector('#adminLoadingIndicator');
    if (loadingEl) loadingEl.style.display = 'block';

    try {
      this._farmers = await this._authService.fetchAllFarmers();
      this._renderOverviewStats();
      this._renderFarmerTable();
      this._renderUnassignedStations();
      await this._renderRoleMappingTable();
    } catch (err) {
      this._logger.error('Failed to load admin data:', err);
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  /**
   * Initial DOM render of modal container.
   * @private
   */
  _render() {
    this._mountEl.innerHTML = `
      <div class="shamba-modal-overlay admin-portal-overlay" id="adminPortalOverlay" aria-modal="true" role="dialog">
        <div class="shamba-modal-content admin-portal-box">
          <button class="shamba-modal-close" id="adminPortalCloseBtn" type="button" aria-label="Close Admin Portal">×</button>
          
          <div class="admin-portal-header">
            <div class="admin-header-title-row">
              <span class="admin-badge">ADMINISTRATION CONSOLE</span>
              <h2>Farmer & Station Management</h2>
              <p class="admin-header-sub">Manage network subscribers, assign stations to field farmers, and audit unassigned infrastructure.</p>
            </div>
            <div class="admin-header-actions">
              <button class="btn-secondary btn-sm" id="adminRefreshBtn" type="button">🔄 Refresh Data</button>
            </div>
          </div>

          <div id="adminLoadingIndicator" class="admin-loading-bar" style="display:none;">Loading data...</div>
          <div id="adminFeedbackBanner" class="admin-feedback-banner" style="display:none;"></div>

          <!-- SECTION 1: NETWORK KPI METRICS -->
          <div class="admin-kpi-grid" id="adminKpiGrid">
            <div class="admin-kpi-card">
              <div class="kpi-label">Total Stations</div>
              <div class="kpi-value" id="kpiTotalStations">—</div>
            </div>
            <div class="admin-kpi-card">
              <div class="kpi-label">Assigned Stations</div>
              <div class="kpi-value" id="kpiAssignedStations" style="color:var(--moss);">—</div>
            </div>
            <div class="admin-kpi-card">
              <div class="kpi-label">Unassigned Stations</div>
              <div class="kpi-value" id="kpiUnassignedStations" style="color:var(--earth);">—</div>
            </div>
            <div class="admin-kpi-card">
              <div class="kpi-label">Registered Farmers</div>
              <div class="kpi-value" id="kpiTotalFarmers" style="color:var(--water);">—</div>
            </div>
          </div>

          <!-- SECTION 2: FARMERS & ASSIGNMENTS TABLE -->
          <div class="admin-section">
            <div class="admin-section-header">
              <h3>🌾 Registered Farmers & Assigned Stations</h3>
              <span class="admin-section-meta" id="farmerTableMeta">0 farmers registered</span>
            </div>

            <div class="admin-table-container">
              <table class="admin-table" id="farmerAssignmentTable">
                <thead>
                  <tr>
                    <th>Farmer Name & Email</th>
                    <th>Current Station</th>
                    <th>Assign / Reassign Station</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="farmerTableBody">
                  <tr><td colspan="4" class="table-empty">Loading farmers...</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- SECTION 3: UNASSIGNED STATIONS -->
          <div class="admin-section">
            <div class="admin-section-header">
              <h3>📡 Unassigned Monitoring Stations</h3>
              <span class="admin-section-meta" id="unassignedStationsMeta">Stations without a subscribed farmer</span>
            </div>
            <div class="unassigned-stations-grid" id="unassignedStationsGrid">
              <div class="table-empty">No unassigned stations.</div>
            </div>
          </div>

          <!-- SECTION 4: QUICK ADD FARMER -->
          <div class="admin-section">
            <div class="admin-section-header">
              <h3>➕ Provision New Farmer Account</h3>
            </div>
            <form class="admin-add-farmer-form" id="adminAddFarmerForm">
              <div class="form-row">
                <input type="text" id="newFarmerName" placeholder="Farmer Full Name (e.g. John Chege)" required>
                <input type="email" id="newFarmerEmail" placeholder="Email (e.g. jchege@shambawatch.org)" required>
                <input type="password" id="newFarmerPassword" placeholder="Initial Password (6+ chars)" required minlength="6">
                <select id="newFarmerStation">
                  <option value="">-- Assign Station (Optional) --</option>
                </select>
                <button type="submit" class="btn-primary" id="newFarmerSubmitBtn">Create & Assign</button>
              </div>
            </form>
          </div>

          <!-- SECTION 5: EMAIL-TO-ROLE MAPPINGS (/roles/roles) -->
          <div class="admin-section">
            <div class="admin-section-header">
              <h3>🔐 Email-to-Role Mappings (Firestore <code>/roles/roles</code>)</h3>
              <span class="admin-section-meta" id="roleMappingMeta">Firestore Access Control Matrix</span>
            </div>
            <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">
              Users signing in with matching emails are automatically assigned their declared role (Admin or Farmer).
            </p>
            <div class="admin-table-container">
              <table class="admin-table" id="roleMappingTable">
                <thead>
                  <tr>
                    <th>User Email</th>
                    <th>Configured Role</th>
                    <th>Quick Change</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody id="roleMappingTableBody">
                  <tr><td colspan="4" class="table-empty">Loading role mappings...</td></tr>
                </tbody>
              </table>
            </div>

            <form class="admin-add-farmer-form" id="adminAddRoleForm" style="margin-top: 14px;">
              <div class="form-row">
                <input type="email" id="newRoleEmail" placeholder="User Email (e.g. supervisor@shambawatch.org)" required style="flex: 2;">
                <select id="newRoleSelect" style="flex: 1;">
                  <option value="farmer">Farmer</option>
                  <option value="admin">Admin</option>
                </select>
                <button type="submit" class="btn-primary" id="newRoleSubmitBtn">Save Mapping</button>
              </div>
            </form>
          </div>

        </div>
      </div>
    `;
  }

  /**
   * Binds modal event listeners.
   * @private
   */
  _bindEvents() {
    const overlay = this._mountEl.querySelector('#adminPortalOverlay');
    const closeBtn = this._mountEl.querySelector('#adminPortalCloseBtn');
    const refreshBtn = this._mountEl.querySelector('#adminRefreshBtn');
    const addFarmerForm = this._mountEl.querySelector('#adminAddFarmerForm');

    closeBtn?.addEventListener('click', () => this.close());
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._isOpen) this.close();
    });

    refreshBtn?.addEventListener('click', () => this.refresh());

    // Add farmer submission
    addFarmerForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = this._mountEl.querySelector('#newFarmerName').value.trim();
      const email = this._mountEl.querySelector('#newFarmerEmail').value.trim();
      const password = this._mountEl.querySelector('#newFarmerPassword').value;
      const stationId = this._mountEl.querySelector('#newFarmerStation').value;
      const submitBtn = this._mountEl.querySelector('#newFarmerSubmitBtn');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Provisioning...';

      try {
        const res = await this._authService.signUp(email, password, {
          displayName: name,
          role: UserRole.FARMER,
          assignedStationId: stationId || null
        });

        if (res.error) {
          this._showFeedback(res.error.message, 'error');
        } else {
          this._showFeedback(`✓ Successfully provisioned farmer ${name} (${email})!`, 'success');
          addFarmerForm.reset();
          await this.refresh();
        }
      } catch (err) {
        this._showFeedback(err.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create & Assign';
      }
    });

    // Add role mapping submission
    const addRoleForm = this._mountEl.querySelector('#adminAddRoleForm');
    addRoleForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = this._mountEl.querySelector('#newRoleEmail')?.value.trim();
      const role = this._mountEl.querySelector('#newRoleSelect')?.value;
      const submitBtn = this._mountEl.querySelector('#newRoleSubmitBtn');

      if (!email) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
      try {
        const res = await this._authService.setRoleMapping(email, role);
        if (res.error) {
          this._showFeedback(res.error.message, 'error');
        } else {
          this._showFeedback(`✓ Role mapped: ${email} ➔ ${role.toUpperCase()}`, 'success');
          addRoleForm.reset();
          await this._renderRoleMappingTable();
        }
      } catch (err) {
        this._showFeedback(err.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Mapping';
      }
    });
  }

  /**
   * Renders the top overview KPI metrics.
   * @private
   */
  _renderOverviewStats() {
    const allStations = this._stationService.getActiveStations();
    const assignedStationIds = new Set(this._farmers.map((f) => f.assignedStationId).filter(Boolean));
    const assignedCount = allStations.filter((s) => assignedStationIds.has(s.id)).length;
    const unassignedCount = allStations.length - assignedCount;

    const elTotal = this._mountEl.querySelector('#kpiTotalStations');
    const elAssigned = this._mountEl.querySelector('#kpiAssignedStations');
    const elUnassigned = this._mountEl.querySelector('#kpiUnassignedStations');
    const elFarmers = this._mountEl.querySelector('#kpiTotalFarmers');

    if (elTotal) elTotal.textContent = allStations.length;
    if (elAssigned) elAssigned.textContent = assignedCount;
    if (elUnassigned) elUnassigned.textContent = unassignedCount;
    if (elFarmers) elFarmers.textContent = this._farmers.length;

    // Also populate station dropdown in Add Farmer form
    const newFarmerStationSelect = this._mountEl.querySelector('#newFarmerStation');
    if (newFarmerStationSelect) {
      newFarmerStationSelect.innerHTML = '<option value="">-- Assign Station (Optional) --</option>' +
        allStations.map((s) => `<option value="${s.id}">${s.name} (${s.id}) · ${s.crop || ''}</option>`).join('');
    }
  }

  /**
   * Renders the farmer list table.
   * @private
   */
  _renderFarmerTable() {
    const tbody = this._mountEl.querySelector('#farmerTableBody');
    const meta = this._mountEl.querySelector('#farmerTableMeta');
    const allStations = this._stationService.getActiveStations();

    if (!tbody) return;

    if (meta) {
      meta.textContent = `${this._farmers.length} farmer(s) registered`;
    }

    if (this._farmers.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="table-empty">
            No farmers registered yet. Use the "Provision New Farmer Account" form below to register a farmer.
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = this._farmers.map((farmer) => {
      const assignedStation = allStations.find((s) => s.id === farmer.assignedStationId);
      const stationDisplay = assignedStation
        ? `<span class="station-assigned-tag">📍 ${assignedStation.name} (${assignedStation.id})</span>`
        : `<span class="station-unassigned-tag">Unassigned</span>`;

      const options = allStations.map((s) => {
        const isSelected = s.id === farmer.assignedStationId;
        return `<option value="${s.id}" ${isSelected ? 'selected' : ''}>${s.name} (${s.id})</option>`;
      }).join('');

      return `
        <tr data-farmer-uid="${farmer.uid}">
          <td>
            <div class="farmer-cell-info">
              <strong class="farmer-name">${farmer.displayName || 'Farmer'}</strong>
              <small class="farmer-email">${farmer.email}</small>
            </div>
          </td>
          <td>${stationDisplay}</td>
          <td>
            <div class="assignment-control-row">
              <select class="station-assign-select" data-farmer-uid="${farmer.uid}">
                <option value="">-- Select Station --</option>
                ${options}
              </select>
              <button class="btn-primary btn-xs btn-assign-action" data-farmer-uid="${farmer.uid}" type="button">
                Assign
              </button>
            </div>
          </td>
          <td>
            ${farmer.assignedStationId ? `
              <button class="btn-outline-danger btn-xs btn-unassign-action" data-farmer-uid="${farmer.uid}" type="button">
                Unassign
              </button>
            ` : '<span style="opacity:0.4; font-size:11px;">—</span>'}
          </td>
        </tr>
      `;
    }).join('');

    // Attach click listeners to Assign buttons
    tbody.querySelectorAll('.btn-assign-action').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const uid = btn.dataset.farmerUid;
        const select = tbody.querySelector(`.station-assign-select[data-farmer-uid="${uid}"]`);
        const targetStationId = select ? select.value : '';
        const station = allStations.find((s) => s.id === targetStationId);

        if (!targetStationId) {
          this._showFeedback('Please select a station to assign.', 'error');
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Saving...';
        const res = await this._authService.assignStationToFarmer(uid, targetStationId, station ? station.name : '');
        btn.disabled = false;
        btn.textContent = 'Assign';

        if (res.error) {
          this._showFeedback(res.error.message, 'error');
        } else {
          this._showFeedback(`✓ Station ${station?.name || targetStationId} assigned successfully!`, 'success');
          await this.refresh();
          if (this._onAssignmentChanged) this._onAssignmentChanged();
        }
      });
    });

    // Attach click listeners to Unassign buttons
    tbody.querySelectorAll('.btn-unassign-action').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const uid = btn.dataset.farmerUid;
        btn.disabled = true;
        btn.textContent = 'Unassigning...';
        const res = await this._authService.assignStationToFarmer(uid, null, '');
        btn.disabled = false;
        btn.textContent = 'Unassign';

        if (res.error) {
          this._showFeedback(res.error.message, 'error');
        } else {
          this._showFeedback('✓ Station assignment removed.', 'success');
          await this.refresh();
          if (this._onAssignmentChanged) this._onAssignmentChanged();
        }
      });
    });
  }

  /**
   * Renders the cards for stations that have no assigned farmer.
   * @private
   */
  _renderUnassignedStations() {
    const container = this._mountEl.querySelector('#unassignedStationsGrid');
    const allStations = this._stationService.getActiveStations();
    const assignedStationIds = new Set(this._farmers.map((f) => f.assignedStationId).filter(Boolean));
    const unassignedStations = allStations.filter((s) => !assignedStationIds.has(s.id));

    if (!container) return;

    if (unassignedStations.length === 0) {
      container.innerHTML = `
        <div class="table-empty" style="grid-column: 1 / -1; padding: 20px;">
          ✓ All monitoring stations currently have a dedicated farmer assigned!
        </div>`;
      return;
    }

    container.innerHTML = unassignedStations.map((station) => {
      const farmerOptions = this._farmers.map((f) => `
        <option value="${f.uid}">${f.displayName || f.email} (${f.email})</option>
      `).join('');

      return `
        <div class="unassigned-station-card">
          <div class="station-card-top">
            <strong>${station.name}</strong>
            <span class="station-id-pill">${station.id}</span>
          </div>
          <div class="station-card-meta">
            <span>Crop: ${station.crop || 'Field'}</span>
            <span>Coords: ${station.lat?.toFixed(3)}°, ${station.lng?.toFixed(3)}°</span>
          </div>
          <div class="station-quick-assign">
            <select class="quick-assign-farmer-select" data-station-id="${station.id}">
              <option value="">-- Assign to Farmer --</option>
              ${farmerOptions}
            </select>
            <button class="btn-primary btn-xs btn-quick-assign-submit" data-station-id="${station.id}" type="button">
              Assign
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach quick assign listeners
    container.querySelectorAll('.btn-quick-assign-submit').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const stationId = btn.dataset.stationId;
        const select = container.querySelector(`.quick-assign-farmer-select[data-station-id="${stationId}"]`);
        const farmerUid = select ? select.value : '';
        const station = allStations.find((s) => s.id === stationId);

        if (!farmerUid) {
          this._showFeedback('Please select a farmer to assign this station to.', 'error');
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Assigning...';
        const res = await this._authService.assignStationToFarmer(farmerUid, stationId, station ? station.name : '');
        btn.disabled = false;
        btn.textContent = 'Assign';

        if (res.error) {
          this._showFeedback(res.error.message, 'error');
        } else {
          this._showFeedback(`✓ Station ${station?.name || stationId} assigned successfully!`, 'success');
          await this.refresh();
          if (this._onAssignmentChanged) this._onAssignmentChanged();
        }
      });
    });
  }

  /**
   * Renders the email-to-role mappings table from /roles/roles in Firestore.
   * @private
   */
  async _renderRoleMappingTable() {
    const tbody = this._mountEl.querySelector('#roleMappingTableBody');
    const meta = this._mountEl.querySelector('#roleMappingMeta');
    if (!tbody) return;

    try {
      const mapping = await this._authService.fetchRoleMappingDocument();
      const entries = Object.entries(mapping || {});

      if (meta) {
        meta.textContent = `${entries.length} role mapping(s) configured`;
      }

      if (entries.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" class="table-empty">
              No email mappings found in <code>/roles/roles</code>. Add one using the form below.
            </td>
          </tr>`;
        return;
      }

      // Sort alphabetically by email
      entries.sort((a, b) => a[0].localeCompare(b[0]));

      tbody.innerHTML = entries.map(([email, role]) => {
        const roleStr = String(role).toLowerCase();
        const roleBadge = roleStr === 'admin'
          ? '<span class="status-badge" style="background:rgba(217,79,4,0.15); color:var(--crimson); border:1px solid rgba(217,79,4,0.3); font-weight:700;">ADMIN</span>'
          : '<span class="status-badge" style="background:rgba(44,122,82,0.15); color:var(--moss); border:1px solid rgba(44,122,82,0.3); font-weight:700;">FARMER</span>';

        return `
          <tr data-role-email="${email}">
            <td><strong>${email}</strong></td>
            <td>${roleBadge}</td>
            <td>
              <select class="role-switch-select" data-email="${email}">
                <option value="farmer" ${roleStr === 'farmer' ? 'selected' : ''}>Farmer</option>
                <option value="admin" ${roleStr === 'admin' ? 'selected' : ''}>Admin</option>
              </select>
            </td>
            <td>
              <button class="btn-primary btn-xs btn-update-role" data-email="${email}" type="button">Update</button>
            </td>
          </tr>
        `;
      }).join('');

      tbody.querySelectorAll('.btn-update-role').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const email = btn.dataset.email;
          const select = tbody.querySelector(`.role-switch-select[data-email="${email}"]`);
          const newRole = select ? select.value : 'farmer';

          btn.disabled = true;
          btn.textContent = 'Saving...';
          const res = await this._authService.setRoleMapping(email, newRole);
          btn.disabled = false;
          btn.textContent = 'Update';

          if (res.error) {
            this._showFeedback(res.error.message, 'error');
          } else {
            this._showFeedback(`✓ Role updated: ${email} ➔ ${newRole.toUpperCase()}`, 'success');
            await this._renderRoleMappingTable();
          }
        });
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="4" class="table-empty" style="color:var(--crimson);">Error loading roles: ${err.message}</td></tr>`;
    }
  }

  /**
   * Displays banner feedback (success or error).
   * @private
   */
  _showFeedback(msg, type = 'success') {
    const banner = this._mountEl.querySelector('#adminFeedbackBanner');
    if (banner) {
      banner.textContent = msg;
      banner.className = `admin-feedback-banner ${type}`;
      banner.style.display = 'block';
      setTimeout(() => {
        if (banner) banner.style.display = 'none';
      }, 5000);
    }
  }
}
