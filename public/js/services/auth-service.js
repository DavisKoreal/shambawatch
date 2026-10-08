/**
 * @fileoverview AuthService — Authentication & Role-Based Access Control (RBAC).
 * Manages user identity, session state, and role claims (Admin vs. Farmer).
 * Adheres to Rules 1 (SRP), 2 (SoC), 18 (Explicit Error Handling), and 46 (Event-Driven).
 */

import { StructuredLogger } from '../core/structured-logger.js';
import { EventTypes } from '../contracts/event-types.js';
import { createSuccessEnvelope, createErrorEnvelope, ServiceErrorCode } from '../contracts/service-envelope.js';
import { ensureFirebaseApp } from '../config/firebase-config.js';

function getFirebase() {
  if (typeof window !== 'undefined' && window.firebase) return window.firebase;
  if (typeof globalThis !== 'undefined' && globalThis.firebase) return globalThis.firebase;
  return null;
}

export const UserRole = Object.freeze({
  ADMIN: 'admin',
  FARMER: 'farmer'
});

export class AuthService {
  /**
   * @param {Object} dependencies
   * @param {import('../core/event-bus.js').EventBus} dependencies.eventBus
   */
  constructor({ eventBus }) {
    this._eventBus = eventBus;
    this._logger = new StructuredLogger('AuthService');
    this._currentUser = null;
    this._currentProfile = null;
    this._authListenerUnsubscribe = null;
    this._isInitialized = false;
  }

  /**
   * Initializes Firebase Auth listener and hydrates current user profile.
   * @returns {Promise<void>}
   */
  async init() {
    const fb = getFirebase();
    if (!fb || !fb.auth) {
      this._logger.warn('Firebase Auth SDK is not available in window context.');
      return;
    }

    // Ensure Firebase default app exists before calling fb.auth()
    try {
      if (!fb.apps || fb.apps.length === 0) {
        ensureFirebaseApp();
      }
    } catch (e) {
      this._logger.warn('Error verifying Firebase app initialization:', e.message);
    }

    try {
      if (typeof fb.auth === 'function') {
        const authInstance = fb.auth();
        if (typeof authInstance.setPersistence === 'function') {
          await authInstance.setPersistence('local');
        }
      }
    } catch (_) {}

    return new Promise((resolve) => {
      this._authListenerUnsubscribe = fb.auth().onAuthStateChanged(async (user) => {
        if (user) {
          try {
            await this._syncUserProfile(user);
            this._currentUser = user;
            this._logger.info(`User authenticated: ${user.email} (${this._currentProfile?.role})`);
          } catch (roleErr) {
            this._logger.warn(`User ${user.email} has no assigned role in the system. Revoking session.`);
            this._currentUser = null;
            this._currentProfile = null;
            await fb.auth().signOut().catch(() => {});
          }
        } else {
          this._currentUser = null;
          this._currentProfile = null;
          this._logger.info('No active user session. Running in guest/observer mode.');
        }

        this._isInitialized = true;
        await this._publishAuthState();
        resolve();
      });
    });
  }

  /**
   * Fetches the role mapping document from Firestore (/roles/roles or /config/roles).
   * Maps user emails (lowercase) to their assigned role ('admin' or 'farmer').
   * @returns {Promise<Object<string, string>>}
   */
  async fetchRoleMappingDocument() {
    const defaultRoles = {
      'admin@shambawatch.org': UserRole.ADMIN,
      'farmer@shambawatch.org': UserRole.FARMER,
      'farmer1@shambawatch.org': UserRole.FARMER
    };

    const fb = getFirebase();
    if (!fb?.firestore) return defaultRoles;
    const db = fb.firestore();

    try {
      // 1. Try primary /roles/roles
      let snapshot = await db.collection('roles').doc('roles').get();
      if (!snapshot.exists) {
        // Fallback /config/roles
        snapshot = await db.collection('config').doc('roles').get();
      }
      if (!snapshot.exists) {
        // Fallback /roles/mapping
        snapshot = await db.collection('roles').doc('mapping').get();
      }

      if (!snapshot.exists) {
        // If not created yet in Firestore, seed initial document
        const initialRoles = {
          'admin@shambawatch.org': UserRole.ADMIN,
          'farmer@shambawatch.org': UserRole.FARMER,
          'farmer1@shambawatch.org': UserRole.FARMER
        };
        try {
          await db.collection('roles').doc('roles').set(initialRoles, { merge: true });
          this._logger.info('Initialized seed /roles/roles mapping document in Firestore.');
          return initialRoles;
        } catch (_) {
          return initialRoles;
        }
      }

      const data = snapshot.data() || {};
      const mapping = {};

      // Parse fields: direct email properties or nested under roles/emails/users
      const source = data.roles || data.emails || data.users || data;
      for (const [key, val] of Object.entries(source)) {
        if (!key) continue;
        const normalizedKey = key.trim().toLowerCase();
        let role = typeof val === 'string'
          ? val.toLowerCase().trim()
          : (val?.role?.toLowerCase()?.trim() || UserRole.FARMER);

        if (role !== UserRole.ADMIN && role !== UserRole.FARMER) {
          role = role.includes('admin') ? UserRole.ADMIN : UserRole.FARMER;
        }
        mapping[normalizedKey] = role;
      }

      return mapping;
    } catch (err) {
      this._logger.warn('Failed to fetch role mapping document from Firestore:', err.message);
      return defaultRoles;
    }
  }

  /**
   * Sets or updates an email-to-role mapping in the Firestore /roles/roles document.
   * @param {string} email
   * @param {string} role 'admin' | 'farmer'
   * @returns {Promise<Object>} Service Envelope
   */
  async setRoleMapping(email, role) {
    const fb = getFirebase();
    if (!fb?.firestore) return createErrorEnvelope(ServiceErrorCode.SERVICE_UNAVAILABLE, 'Firestore unavailable');
    const db = fb.firestore();

    try {
      const emailKey = email.trim().toLowerCase();
      const validRole = role === UserRole.ADMIN ? UserRole.ADMIN : UserRole.FARMER;

      await db.collection('roles').doc('roles').set({
        [emailKey]: validRole
      }, { merge: true });

      this._logger.info(`Updated /roles/roles mapping in Firestore: ${emailKey} -> ${validRole}`);

      // If user profile currently exists with that email in /users, sync profile as well
      try {
        const usersSnap = await db.collection('users').where('email', '==', emailKey).get();
        if (!usersSnap.empty) {
          for (const userDoc of usersSnap.docs) {
            await userDoc.ref.update({
              role: validRole,
              updatedAt: new Date().toISOString()
            });
          }
        }
      } catch (_) {}

      return createSuccessEnvelope({ email: emailKey, role: validRole });
    } catch (err) {
      this._logger.error('Failed to set role mapping:', err);
      return createErrorEnvelope(ServiceErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  /**
   * Fetches or initializes user profile in Firestore (/users/{uid}),
   * strictly enforcing that the user must have an assigned role in the system.
   * @private
   * @param {Object} user Firebase Auth User
   */
  async _syncUserProfile(user) {
    const emailLower = (user?.email || '').trim().toLowerCase();
    let roleMapping = {};
    try {
      roleMapping = await this.fetchRoleMappingDocument();
    } catch (_) {}
    const mappedRole = roleMapping[emailLower] || null;

    const fb = getFirebase();
    if (!fb?.firestore) {
      if (!mappedRole) {
        throw new Error('Access denied: Your account does not have an assigned role in the system. Please contact your system administrator.');
      }
      this._currentProfile = {
        uid: user?.uid || 'offline-uid',
        email: user?.email || '',
        displayName: user?.displayName || (mappedRole === UserRole.ADMIN ? 'System Admin' : 'Field Farmer'),
        role: mappedRole,
        assignedStationId: null
      };
      return;
    }
    const db = fb.firestore();

    const docRef = db.collection('users').doc(user.uid);
    const snapshot = await docRef.get();

    // Determine assigned role: priority is /roles/roles mapping, fallback is established /users/{uid} role
    let effectiveRole = mappedRole;
    if (!effectiveRole && snapshot.exists) {
      const existingData = snapshot.data();
      if (existingData?.role === UserRole.ADMIN || existingData?.role === UserRole.FARMER) {
        effectiveRole = existingData.role;
      }
    }

    // STRICT ROLE ENFORCEMENT: If no assigned role exists in the system, reject access
    if (!effectiveRole) {
      throw new Error('Access denied: Your account does not have an assigned role in the system. Please contact your system administrator.');
    }

    try {
      if (snapshot.exists) {
        const existingData = snapshot.data();
        if (existingData.role !== effectiveRole) {
          existingData.role = effectiveRole;
          existingData.updatedAt = new Date().toISOString();
          await docRef.set(existingData, { merge: true });
          this._logger.info(`Synchronized user role for ${user.email} from /roles/roles: ${effectiveRole}`);
        }
        this._currentProfile = existingData;
      } else {
        // First-time login for pre-approved email with assigned role
        const defaultProfile = {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || (effectiveRole === UserRole.ADMIN ? 'System Admin' : 'Field Farmer'),
          role: effectiveRole,
          assignedStationId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        await docRef.set(defaultProfile);
        this._currentProfile = defaultProfile;
        this._logger.info(`Provisioned authorized Firestore user profile: ${user.email} as ${defaultProfile.role}`);
      }
    } catch (err) {
      this._logger.error('Failed to sync user profile from Firestore:', err);
      this._currentProfile = {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || 'Field User',
        role: effectiveRole,
        assignedStationId: null
      };
    }
  }

  /**
   * Signs in a user with email and password, enforcing role assignment.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<Object>} Service Envelope
   */
  async signIn(email, password) {
    try {
      const fb = getFirebase();
      if (!fb?.auth) {
        throw new Error('Firebase Auth is not available.');
      }

      const cred = await fb.auth().signInWithEmailAndPassword(email, password);
      try {
        await this._syncUserProfile(cred.user);
      } catch (roleErr) {
        // Immediately revoke and sign out unassigned users
        await fb.auth().signOut().catch(() => {});
        this._currentUser = null;
        this._currentProfile = null;
        await this._publishAuthState();
        return createErrorEnvelope(ServiceErrorCode.UNAUTHORIZED, roleErr.message);
      }

      this._currentUser = cred.user;
      await this._publishAuthState();
      return createSuccessEnvelope({ user: cred.user, profile: this._currentProfile });
    } catch (err) {
      this._logger.error('Sign-in failed:', err.message);
      return createErrorEnvelope(ServiceErrorCode.UNAUTHORIZED, err.message);
    }
  }

  /**
   * Registers a new user with email and password, verifying assigned role.
   * @param {string} email
   * @param {string} password
   * @param {Object} details
   * @param {string} [details.displayName]
   * @param {string} [details.role]
   * @param {string|null} [details.assignedStationId]
   * @returns {Promise<Object>} Service Envelope
   */
  async signUp(email, password, { displayName, role = null, assignedStationId = null } = {}) {
    try {
      // 1. Check role mapping pre-assignment: must have an assigned role to register
      const emailLower = (email || '').trim().toLowerCase();
      const roleMapping = await this.fetchRoleMappingDocument().catch(() => ({}));
      const assignedRole = roleMapping[emailLower] || null;

      if (!assignedRole) {
        return createErrorEnvelope(
          ServiceErrorCode.UNAUTHORIZED,
          'Access denied: This email has not been assigned a role in the system. Please contact your system administrator.'
        );
      }

      const fb = getFirebase();
      if (!fb?.auth) {
        throw new Error('Firebase Auth is not available.');
      }

      const cred = await fb.auth().createUserWithEmailAndPassword(email, password);
      const user = cred.user;

      if (displayName) {
        await user.updateProfile({ displayName });
      }

      const profile = {
        uid: user.uid,
        email: user.email,
        displayName: displayName || (assignedRole === UserRole.ADMIN ? 'Administrator' : 'Farmer'),
        role: assignedRole === UserRole.ADMIN ? UserRole.ADMIN : UserRole.FARMER,
        assignedStationId: assignedStationId || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (fb.firestore) {
        const db = fb.firestore();
        await db.collection('users').doc(user.uid).set(profile);
      }

      this._currentUser = user;
      this._currentProfile = profile;
      await this._publishAuthState();
      return createSuccessEnvelope({ user, profile });
    } catch (err) {
      this._logger.error('Registration failed:', err.message);
      return createErrorEnvelope(ServiceErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  /**
   * Signs out the current user.
   * @returns {Promise<void>}
   */
  async signOut() {
    try {
      const fb = getFirebase();
      if (fb?.auth) {
        await fb.auth().signOut();
      }
      this._currentUser = null;
      this._currentProfile = null;
      await this._publishAuthState();
    } catch (err) {
      this._logger.error('Sign-out failed:', err);
    }
  }

  /**
   * Helper to sign in with demo accounts or register them automatically.
   * @param {'admin'|'farmer'} role
   * @returns {Promise<Object>}
   */
  async quickSignInDemo(role = 'admin') {
    const isAdm = role === 'admin';
    const email = isAdm ? 'admin@shambawatch.org' : 'farmer@shambawatch.org';
    const pass = isAdm ? 'Admin@123456' : 'Farmer@123456';
    const displayName = isAdm ? 'Lead Agronomist (Admin)' : 'Nakuru Basin Farmer';

    const fb = getFirebase();
    if (!fb?.auth) {
      // In offline / test environment: mock demo sign-in directly
      this._currentUser = {
        uid: isAdm ? 'admin-demo-01' : 'farmer-demo-01',
        email,
        displayName
      };
      this._currentProfile = {
        uid: this._currentUser.uid,
        email,
        displayName,
        role: isAdm ? UserRole.ADMIN : UserRole.FARMER,
        assignedStationId: isAdm ? null : 'station-naivasha-01',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await this._publishAuthState();
      return createSuccessEnvelope({ user: this._currentUser, profile: this._currentProfile });
    }

    const loginRes = await this.signIn(email, pass);
    if (loginRes.data) return loginRes;

    // If account doesn't exist, automatically create it
    if (loginRes.error && (loginRes.error.message.includes('user-not-found') || loginRes.error.message.includes('invalid-credential') || loginRes.error.message.includes('INVALID_LOGIN_CREDENTIALS'))) {
      this._logger.info(`Demo user ${email} not found. Creating account...`);
      return this.signUp(email, pass, {
        displayName,
        role: isAdm ? UserRole.ADMIN : UserRole.FARMER,
        assignedStationId: isAdm ? null : 'ST-01'
      });
    }

    return loginRes;
  }

  /**
   * Fetches all registered farmers in the system (for Admin portal).
   * @returns {Promise<Array<Object>>}
   */
  async fetchAllFarmers() {
    const fb = getFirebase();
    if (!fb?.firestore) return [];
    try {
      const db = fb.firestore();
      const snapshot = await db.collection('users').where('role', '==', UserRole.FARMER).get();
      const farmers = [];
      snapshot.forEach((doc) => {
        farmers.push(doc.data());
      });
      return farmers;
    } catch (err) {
      this._logger.warn('Failed to query farmers with filter, falling back to all users:', err);
      try {
        const db = fb.firestore();
        const snapshot = await db.collection('users').get();
        const farmers = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.role === UserRole.FARMER) {
            farmers.push(data);
          }
        });
        return farmers;
      } catch (e) {
        this._logger.error('Failed to fetch users from Firestore:', e);
        return [];
      }
    }
  }

  /**
   * Assigns a station to a farmer (Admin capability).
   * @param {string} farmerUid
   * @param {string|null} stationId
   * @param {string} [stationName]
   * @returns {Promise<Object>} Service Envelope
   */
  async assignStationToFarmer(farmerUid, stationId, stationName = '') {
    if (!this.isAdmin()) {
      return createErrorEnvelope(ServiceErrorCode.UNAUTHORIZED, 'Only administrators can assign stations.');
    }

    const fb = getFirebase();
    if (!fb?.firestore) {
      // Mock assignment for offline / unit tests
      if (this._currentUser?.uid === farmerUid && this._currentProfile) {
        this._currentProfile.assignedStationId = stationId;
      }
      await this._eventBus.publish(EventTypes.FARMER_ASSIGNED, {
        farmerId: farmerUid,
        farmerUid,
        stationId,
        stationName
      }, { sourceService: 'AuthService' });
      return createSuccessEnvelope({ farmer: { uid: farmerUid, assignedStationId: stationId }, farmerUid, stationId });
    }

    try {
      const db = fb.firestore();
      const farmerRef = db.collection('users').doc(farmerUid);
      const farmerSnap = await farmerRef.get();
      if (!farmerSnap.exists) {
        return createErrorEnvelope(ServiceErrorCode.NOT_FOUND, 'Farmer profile not found.');
      }

      const farmerData = farmerSnap.data();
      const oldStationId = farmerData.assignedStationId;

      // 1. Update farmer profile document
      await farmerRef.update({
        assignedStationId: stationId,
        updatedAt: new Date().toISOString()
      });

      // 2. If farmer was previously assigned to another station, clear previous station's assignment
      if (oldStationId && oldStationId !== stationId) {
        try {
          await db.collection('stations').doc(oldStationId).set({
            assignedFarmerId: null,
            assignedFarmerName: null,
            assignedFarmerEmail: null,
            assignedAt: null
          }, { merge: true });
        } catch (_) {}
      }

      // 3. Update new station document if stationId is provided
      if (stationId) {
        try {
          await db.collection('stations').doc(stationId).set({
            id: stationId,
            stationId: stationId,
            name: stationName || stationId,
            assignedFarmerId: farmerUid,
            assignedFarmerName: farmerData.displayName || farmerData.email,
            assignedFarmerEmail: farmerData.email,
            assignedAt: new Date().toISOString()
          }, { merge: true });
        } catch (_) {}
      }

      this._logger.info(`Assigned station ${stationId} to farmer ${farmerData.email}`);

      // Publish event
      await this._eventBus.publish(EventTypes.FARMER_ASSIGNED, {
        farmerId: farmerUid,
        farmerUid,
        farmerEmail: farmerData.email,
        stationId,
        stationName
      }, { sourceService: 'AuthService' });

      // If current user is this farmer, update local profile
      if (this._currentUser?.uid === farmerUid && this._currentProfile) {
        this._currentProfile.assignedStationId = stationId;
        await this._publishAuthState();
      }

      return createSuccessEnvelope({ farmer: { uid: farmerUid, assignedStationId: stationId }, farmerUid, stationId });
    } catch (err) {
      this._logger.error('Failed to assign station:', err);
      return createErrorEnvelope(ServiceErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  /**
   * Publishes auth state across the event bus.
   * @private
   */
  async _publishAuthState() {
    await this._eventBus.publish(EventTypes.AUTH_STATE_CHANGED, {
      isAuthenticated: Boolean(this._currentUser),
      user: this._currentUser,
      profile: this._currentProfile,
      role: this.role,
      isAdmin: this.isAdmin(),
      isFarmer: this.isFarmer(),
      assignedStationId: this.assignedStationId
    }, { sourceService: 'AuthService' });
  }

  /** @returns {boolean} */
  get isAuthenticated() {
    return Boolean(this._currentUser);
  }

  /**
   * Method compatibility alias
   * @returns {boolean}
   */
  isAuthenticatedUser() {
    return Boolean(this._currentUser);
  }

  /** @returns {string|null} */
  get role() {
    return this._currentProfile?.role || (this._currentUser ? UserRole.FARMER : null);
  }

  /** @returns {boolean} */
  isAdmin() {
    if (!this._currentUser) return false;
    return this.role === UserRole.ADMIN;
  }

  /** @returns {boolean} */
  isFarmer() {
    return this.role === UserRole.FARMER;
  }

  /** @returns {string|null} */
  get assignedStationId() {
    return this._currentProfile?.assignedStationId || null;
  }

  /** @returns {string|null} */
  getAssignedStationId() {
    return this.assignedStationId;
  }

  /** @returns {Object|null} */
  get user() {
    return this._currentUser;
  }

  /** @returns {Object|null} */
  getCurrentUser() {
    return this._currentUser;
  }

  /** @returns {Object|null} */
  get profile() {
    return this._currentProfile;
  }

  /** @returns {Object|null} */
  getCurrentProfile() {
    return this._currentProfile;
  }

  /**
   * Cleans up listeners (Rule 15).
   */
  dispose() {
    if (this._authListenerUnsubscribe) {
      this._authListenerUnsubscribe();
      this._authListenerUnsubscribe = null;
    }
  }
}
