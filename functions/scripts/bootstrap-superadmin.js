'use strict';

const { applicationDefault, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');

const COMPAT_TENANT_ID = 'lamylenoise';
const BRAND_ID = 'sokiva';

async function main() {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Usage: npm --prefix functions run bootstrap:superadmin -- owner@example.com');
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS must point to the SOKIVA service-account JSON file.');
  }

  const app = getApps().length ? getApps()[0] : initializeApp({ credential: applicationDefault() });
  const projectId = app.options.projectId || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '';
  if (!/^sokiva-(dev|staging|prod)$/.test(projectId)) {
    throw new Error(`Bootstrap blocked: credentials target '${projectId || 'unknown'}', not an approved SOKIVA project.`);
  }

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
