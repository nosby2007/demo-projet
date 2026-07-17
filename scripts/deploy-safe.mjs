import { spawnSync } from 'node:child_process';

const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
const blockedProjects = new Set([
  'nursehome-7dc3f',
  'lamylenoise-dev',
  'lamylenoise-staging',
  'lamylenoise-prod'
]);

if (!projectId) {
  console.error('FIREBASE_PROJECT_ID is required. Use sokiva-dev, sokiva-staging or sokiva-prod.');
  process.exit(1);
}

if (blockedProjects.has(projectId)) {
  console.error(`Deployment blocked: ${projectId} is a legacy or unrelated project and must not host SOKIVA data.`);
  process.exit(1);
}

if (!/^sokiva-(dev|staging|prod)$/.test(projectId)) {
  console.error(`Deployment blocked: ${projectId} is not an approved SOKIVA environment.`);
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
