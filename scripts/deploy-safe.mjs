import { spawnSync } from 'node:child_process';

const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
const blockedProjects = new Set(['nursehome-7dc3f']);

if (!projectId) {
  console.error('FIREBASE_PROJECT_ID is required. Use a dedicated lamylenoise-dev, lamylenoise-staging or lamylenoise-prod project.');
  process.exit(1);
}

if (blockedProjects.has(projectId)) {
  console.error(`Deployment blocked: ${projectId} is a shared legacy project and must not host LAMYLENOISE production data.`);
  process.exit(1);
}

if (!/^lamylenoise-(dev|staging|prod)$/.test(projectId)) {
  console.error(`Deployment blocked: ${projectId} is not an approved LAMYLENOISE environment.`);
  process.exit(1);
}

const result = spawnSync(
  process.platform === 'win32' ? 'firebase.cmd' : 'firebase',
  ['deploy', '--project', projectId, '--only', 'hosting,database,functions'],
  { stdio: 'inherit' }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
