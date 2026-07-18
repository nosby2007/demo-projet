'use strict';

const { readFileSync } = require('node:fs');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');

const COMPAT_TENANT_ID = 'lamylenoise';
const BRAND_ID = 'sokiva';

async function main() {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Usage: npm --prefix functions run bootstrap:superadmin -- owner@example.com');
  }
  const credentialsPath = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
  if (!credentialsPath) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS must point to the SOKIVA service-account JSON file.');
  }

  let credentials;
  try {
    credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read the service-account JSON: ${error.message}`);
  }
  const projectId = String(credentials.project_id || '').trim();
  if (!/^sokiva-(dev|staging|prod)$/.test(projectId)) {
    throw new Error(`Bootstrap blocked: credentials target '${projectId || 'unknown'}', not an approved SOKIVA project.`);
  }

  const app = getApps().length ? getApps()[0] : initializeApp({
    credential: cert(credentials),
    projectId,
    databaseURL: `https://${projectId}-default-rtdb.firebaseio.com`
  });
  const auth = getAuth(app);
  const database = getDatabase(app);
  const user = await auth.getUserByEmail(email);
  const existingProfile = (await database.ref(`profiles/${user.uid}`).get()).val() || {};
  const now = Date.now();

  const claims = {
    ...(user.customClaims || {}),
    role: 'admin',
    tenantId: existingProfile.tenantId || COMPAT_TENANT_ID,
    brandId: BRAND_ID,
    isSuperAdmin: true
  };
  await auth.setCustomUserClaims(user.uid, claims);
  await database.ref(`profiles/${user.uid}`).update({
    uid: user.uid,
    email: user.email,
    name: user.displayName || existingProfile.name || email.split('@')[0],
    role: 'admin',
    status: 'active',
    tenantId: existingProfile.tenantId || COMPAT_TENANT_ID,
    brandId: BRAND_ID,
    isSuperAdmin: true,
    createdAt: Number(existingProfile.createdAt || now),
    updatedAt: now
  });

  console.log(`Superadministrator bootstrap complete for ${email}.`);
  console.log(`Project: ${projectId}`);
  console.log(`UID: ${user.uid}`);
  console.log('The user must sign out and sign in again to refresh Firebase Auth claims.');
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
