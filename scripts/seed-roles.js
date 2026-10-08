#!/usr/bin/env node
/**
 * @fileoverview Seeds and manages the Firestore /roles/roles document.
 * 
 * Requirement:
 * "In the firebase, I will create users and we will also have a document that stores
 * user emails mapped to the roles that they have. Create this and we go."
 * 
 * Target Firestore document:
 * Collection: "roles", Document: "roles" (/roles/roles)
 * Structure:
 * {
 *   "admin@shambawatch.org": "admin",
 *   "farmer@shambawatch.org": "farmer",
 *   ...
 * }
 * 
 * Usage:
 *   node scripts/seed-roles.js                  # Inspects & seeds defaults into /roles/roles
 *   node scripts/seed-roles.js add <email> <role> # Adds or updates an email mapping
 *   node scripts/seed-roles.js get              # Displays current /roles/roles document
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { FIREBASE_CONFIG } from '../public/js/config/firebase-config.js';

console.log('\n============================================================');
console.log('  SHAMBA WATCH — FIRESTORE ROLE MAPPING SEED UTILITY');
console.log('============================================================\n');

const projectId = process.env.FIREBASE_PROJECT_ID || FIREBASE_CONFIG.projectId || 'shambawatch';
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

/**
 * Resolves or refreshes Google OAuth2 access token from Firebase CLI configstore.
 */
async function resolveAuthToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(configPath)) {
    console.warn('⚠️ Warning: firebase-tools.json not found. Proceeding without auth header.');
    return null;
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const tokens = config.tokens;
    if (!tokens || !tokens.access_token) return null;

    if ((!tokens.access_token || !tokens.expires_at || Date.now() > (tokens.expires_at - 120000)) && tokens.refresh_token) {
      console.log('[AUTH] Refreshing Firebase OAuth access token...');
      const refreshRes = await fetch('https://www.googleapis.com/oauth2/v3/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
          client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token,
        }),
      });

      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        tokens.access_token = refreshData.access_token;
        tokens.expires_at = Date.now() + (refreshData.expires_in * 1000);
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log('[AUTH] Token refreshed successfully.');
      }
    }

    return tokens.access_token;
  } catch (err) {
    console.warn('⚠️ Could not resolve token from firebase-tools.json:', err.message);
    return null;
  }
}

/**
 * Fetches current /roles/roles document from Firestore REST API.
 */
async function fetchCurrentRoles(headers) {
  const url = `${baseUrl}/roles/roles`;
  const res = await fetch(url, { headers });
  if (res.status === 404) {
    return {};
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch /roles/roles: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const fields = json.fields || {};
  const result = {};
  for (const [key, val] of Object.entries(fields)) {
    if (val.stringValue) {
      result[key] = val.stringValue;
    }
  }
  return result;
}

/**
 * Updates /roles/roles document in Firestore REST API.
 */
async function updateRolesDocument(mappings, headers) {
  const url = `${baseUrl}/roles/roles`;
  
  const fields = {};
  for (const [email, role] of Object.entries(mappings)) {
    fields[email.toLowerCase().trim()] = { stringValue: role.toLowerCase().trim() };
  }

  const res = await fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields })
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Failed to update /roles/roles: ${res.status} ${res.statusText} - ${errorBody}`);
  }

  return await res.json();
}

async function main() {
  const authToken = await resolveAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const args = process.argv.slice(2);
  const command = args[0] || 'seed';

  if (command === 'get') {
    console.log('Fetching /roles/roles from Firestore...');
    const current = await fetchCurrentRoles(headers);
    console.log('\nCurrent /roles/roles mappings:');
    console.table(Object.entries(current).map(([email, role]) => ({ Email: email, Role: role })));
    return;
  }

  if (command === 'add') {
    const email = args[1];
    const role = (args[2] || 'farmer').toLowerCase();
    if (!email) {
      console.error('Usage: node scripts/seed-roles.js add <email> <admin|farmer>');
      process.exit(1);
    }
    console.log(`Adding mapping: ${email} -> ${role}...`);
    const current = await fetchCurrentRoles(headers);
    current[email.toLowerCase().trim()] = role;
    await updateRolesDocument(current, headers);
    console.log('✓ Successfully updated /roles/roles in Firestore!');
    return;
  }

  // Default: Seed standard defaults
  console.log('Inspecting /roles/roles in Firestore...');
  let current = {};
  try {
    current = await fetchCurrentRoles(headers);
    console.log('Existing mappings found:', Object.keys(current).length);
  } catch (err) {
    console.warn('⚠️ Could not read current mappings (read quota or permission):', err.message);
    console.log('Proceeding with direct seed/patch write...');
  }

  const defaults = {
    'admin@shambawatch.org': 'admin',
    'farmer@shambawatch.org': 'farmer',
    'supervisor@shambawatch.org': 'admin',
    'daviskoreal@gmail.com': 'admin',
    ...current
  };

  console.log('\nSeeding /roles/roles with:');
  console.table(Object.entries(defaults).map(([email, role]) => ({ Email: email, Role: role })));

  await updateRolesDocument(defaults, headers);
  console.log('✓ /roles/roles successfully seeded into Firestore (/roles/roles)!');
}

main().catch((err) => {
  console.error('\n❌ Execution error:', err);
  process.exit(1);
});
