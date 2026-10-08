/**
 * @fileoverview Firebase Client Configuration and Initialization Helper.
 * Centralizes Firebase project settings and connection lifecycle.
 * Adheres to Principle 26 (Externalized Configuration) and Principle 2 (Separation of Concerns).
 */

import { Logger } from './app-config.js';

// ============================================================================
// FIREBASE CONFIGURATION OBJECT
// Replace with your Firebase Project credentials from Firebase Console.
// ============================================================================
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBHJ38xvf5GrUq_VsAKqcS3CK1BIkIBSSM",
  authDomain: "shambawatch.firebaseapp.com",
  projectId: "shambawatch",
  storageBucket: "shambawatch.firebasestorage.app",
  messagingSenderId: "633801544514",
  appId: "1:633801544514:web:52f70eff1b3f1e68596edb",
  measurementId: "G-M63S91V77V",
  
  // Set to true if running against local Firebase Emulator Suite
  useEmulator: false,
  emulatorHost: "localhost",
  emulatorPort: 8080,
};

/**
 * Checks whether custom, non-placeholder credentials have been provided.
 * @returns {boolean}
 */
export function isFirebaseConfigured() {
  return (
    typeof FIREBASE_CONFIG.apiKey === 'string' &&
    FIREBASE_CONFIG.apiKey.length > 20 &&
    !FIREBASE_CONFIG.apiKey.includes('PLACEHOLDER')
  );
}

/**
 * Safely initializes the default Firebase App if not already initialized.
 * @param {Object} [customConfig]
 * @returns {Object|null}
 */
export function ensureFirebaseApp(customConfig = null) {
  if (typeof window === 'undefined' || !window.firebase) {
    return null;
  }
  const config = customConfig || FIREBASE_CONFIG;
  try {
    if (window.firebase.apps && window.firebase.apps.length > 0) {
      return window.firebase.apps[0];
    }
    const app = window.firebase.initializeApp(config);
    Logger.info('FirebaseConfig', `Initialized Firebase app for project: ${config.projectId}`);
    return app;
  } catch (error) {
    Logger.error('FirebaseConfig', 'Failed to initialize Firebase app:', error);
    return null;
  }
}

/**
 * Safely initializes Firebase and Firestore if the Firebase SDK is present in window.
 * Supports both production Firebase and local Firestore Emulator.
 * 
 * @param {Object} [customConfig] Optional override config from user input.
 * @returns {Object|null} Initialized Firestore instance or null if unavailable.
 */
export function initializeFirestoreClient(customConfig = null) {
  if (typeof window === 'undefined' || !window.firebase) {
    Logger.warn('FirebaseConfig', 'Firebase SDK script is not loaded in the window environment.');
    return null;
  }

  const config = customConfig || FIREBASE_CONFIG;

  try {
    ensureFirebaseApp(config);

    const db = window.firebase.firestore();

    // Enable local Firestore emulator if configured
    if (config.useEmulator) {
      db.useEmulator(config.emulatorHost || 'localhost', config.emulatorPort || 8080);
      Logger.info('FirebaseConfig', `Connected Firestore to local emulator at ${config.emulatorHost}:${config.emulatorPort}`);
    }

    return db;
  } catch (error) {
    Logger.error('FirebaseConfig', 'Failed to initialize Firestore client:', error);
    throw error;
  }
}
