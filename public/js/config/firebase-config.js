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
  apiKey: "AIzaSy_SHAMBAWATCH_PLACEHOLDER_KEY",
  authDomain: "shambawatch.firebaseapp.com",
  projectId: "shambawatch",
  storageBucket: "shambawatch.appspot.com",
  messagingSenderId: "1029384756",
  appId: "1:1029384756:web:a1b2c3d4e5f6g7h8",
  
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
    // Check if an app is already initialized
    let app;
    if (window.firebase.apps && window.firebase.apps.length > 0) {
      app = window.firebase.apps[0];
    } else {
      app = window.firebase.initializeApp(config);
      Logger.info('FirebaseConfig', `Initialized Firebase app for project: ${config.projectId}`);
    }

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
