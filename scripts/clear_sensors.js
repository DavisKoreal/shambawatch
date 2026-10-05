#!/usr/bin/env node
/**
 * @fileoverview Deletes sensor documents from Firestore /sensors to reset to zero-sensor state.
 * Usage: node scripts/clear_sensors.js
 */

import { APP_CONFIG } from '../public/js/config/app-config.js';
import { FIREBASE_CONFIG } from '../public/js/config/firebase-config.js';

console.log('\n============================================================');
console.log('  SHAMBA WATCH — SENSOR PURGE / RESET UTILITY');
console.log('============================================================\n');

const projectId = process.env.FIREBASE_PROJECT_ID || FIREBASE_CONFIG.projectId || 'shambawatch';
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const listUrl = `${baseUrl}/${APP_CONFIG.FIRESTORE_PATHS.SENSORS_COLLECTION}`;

try {
  const res = await fetch(listUrl);
  if (!res.ok) {
    console.log('No sensors found or database already empty.');
    process.exit(0);
  }

  const data = await res.json();
  const docs = data.documents || [];

  if (docs.length === 0) {
    console.log('✅ Database is already empty (0 sensors).');
    process.exit(0);
  }

  console.log(`Found ${docs.length} sensor(s) to remove:`);
  for (const doc of docs) {
    const docPath = doc.name;
    const deleteUrl = `https://firestore.googleapis.com/v1/${docPath}`;
    console.log(`Deleting: ${docPath.split('/').pop()}...`);
    await fetch(deleteUrl, { method: 'DELETE' });
  }

  console.log('\n✅ Database reset successfully to 0 sensors.');
} catch (err) {
  console.error('Purge error:', err.message);
}
