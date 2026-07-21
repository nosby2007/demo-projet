import { readFile } from 'node:fs/promises';

const errors = [];
const read = path => readFile(path, 'utf8');

const [workflow, deploySafe, configureScript, gitignore, documentation] = await Promise.all([
  read('.github/workflows/firebase-deploy.yml'),
  read('scripts/deploy-safe.mjs'),
  read('scripts/configure-firebase-github.sh'),
  read('.gitignore'),
  read('docs/firebase-deployment.md')
]);

const requireText = (source, expected, message) => {
  if (!source.includes(expected)) errors.push(message);
};

for (const [expected, message] of [
  ['workflow_run:', 'Firebase deployment must wait for the quality workflow.'],
  ['Sokiva marketplace quality gate', 'Firebase deployment must reference the exact quality workflow name.'],
  ['branches:\n      - main', 'Automatic Firebase deployment must be restricted to main.'],
  ['workflow_dispatch:', 'Firebase deployment must support controlled manual runs.'],
  ["github.event.workflow_run.conclusion == 'success'", 'Automatic deployment must require a successful quality run.'],
  ["github.event.workflow_run.head_branch == 'main'", 'Automatic deployment must verify the validated branch is main.'],
  ["vars.FIREBASE_AUTO_DEPLOY_DEV == 'true'", 'Automatic development deployment must require an explicit repository opt-in.'],
  ["github.event_name == 'workflow_run' && 'hosting'", 'Automatic deployment must be Hosting-only.'],
  ['environment: ${{ github.event_name', 'Deployments must use protected GitHub Environments.'],
  ['FIREBASE_PROJECT_ID: ${{ vars.FIREBASE_PROJECT_ID }}', 'The Firebase project must come from an Environment variable.'],
  ['credentials_json: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_JSON }}', 'Google authentication must use the encrypted Environment secret.'],
  ['uses: google-github-actions/auth@v2', 'The pipeline must authenticate through the Google GitHub Action.'],
  ['persist-credentials: false', 'The deployment checkout must not persist the GitHub token.'],
  ['DEPLOY_FULL', 'Full deployments must require the stronger DEPLOY_FULL confirmation.'],
  ['echo "FIREBASE_CONFIRM_FULL=DEPLOY_FULL" >> "$GITHUB_ENV"', 'The workflow must pass the full-deploy confirmation to the safe wrapper.'],
  ["'hosting,database,functions,storage'", 'The full deployment scope must include Storage rules so they actually reach production.'],
  ['"$FIREBASE_DEPLOY_ONLY" = "hosting,database,functions,storage"', 'The DEPLOY_FULL confirmation gate must match the full deployment scope exactly.'],
  ['npm run build', 'The application must be revalidated before deployment.'],
  ['npm run test:functions', 'Cloud Functions must be revalidated before deployment.'],
  ['npm run deploy', 'The workflow must deploy through the safe wrapper.']
]) {
  requireText(workflow, expected, message);
}

if (/\bpull_request\s*:/.test(workflow)) {
  errors.push('Firebase deployment workflow must never deploy directly from pull_request events.');
}
if (workflow.includes('FIREBASE_TOKEN')) {
  errors.push('Legacy FIREBASE_TOKEN authentication is forbidden.');
}
if (workflow.includes('firebase deploy') && !workflow.includes('npm run deploy')) {
  errors.push('The workflow must not bypass scripts/deploy-safe.mjs.');
}

for (const [expected, message] of [
  ["'nursehome-7dc3f'", 'The shared legacy project must remain blocked.'],
  ["'lamylenoise-dev'", 'The legacy development project must remain blocked.'],
  ['/^sokiva-(dev|staging|prod)$/', 'The safe wrapper must allow only approved SOKIVA project IDs.'],
  ["'hosting'", 'Hosting must be an approved deployment scope.'],
  ["'hosting,database,functions'", 'The explicit full deployment scope must be supported.'],
  ["'hosting,database,functions,storage'", 'The full deployment scope with Storage must be supported.'],
  ["process.env.FIREBASE_CONFIRM_FULL !== 'DEPLOY_FULL'", 'Every full deployment must require DEPLOY_FULL.'],
  ["'--project', projectId", 'Firebase deploy must always receive an explicit project.'],
  ["'--only', deployOnly", 'Firebase deploy must always receive an explicit scope.'],
  ["'--non-interactive'", 'CI deployments must be non-interactive.']
]) {
  requireText(deploySafe, expected, message);
}

for (const [expected, message] of [
  ['gh auth status', 'The setup helper must verify GitHub CLI authentication.'],
  ['ACTUAL_PROJECT_ID', 'The setup helper must verify the service-account project ID.'],
  ['repos/$REPOSITORY/environments/$ENVIRONMENT', 'The setup helper must create the GitHub Environment.'],
  ['gh variable set FIREBASE_PROJECT_ID', 'The setup helper must configure the Firebase project variable.'],
  ['gh secret set FIREBASE_SERVICE_ACCOUNT_JSON', 'The setup helper must encrypt the service-account JSON as a GitHub secret.'],
  ['gh variable set FIREBASE_AUTO_DEPLOY_DEV', 'The setup helper must explain how to opt in to automatic development deployment.']
]) {
  requireText(configureScript, expected, message);
}

if (!gitignore.includes('*service-account*.json') || !gitignore.includes('firebase-adminsdk-*.json')) {
  errors.push('Service-account JSON files must be ignored by Git.');
}

for (const phrase of [
  'Opt-in automatic development Hosting deployment',
  'FIREBASE_AUTO_DEPLOY_DEV',
  'First manual development deployment',
  'DEPLOY_FULL',
  'configure-firebase-github.sh development',
  'required reviewers',
  'Never commit it'
]) {
  requireText(documentation, phrase, `Firebase deployment documentation is missing: ${phrase}`);
}

if (errors.length) {
  console.error('Firebase deployment pipeline validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Firebase deployment pipeline validation passed. Automatic dev Hosting deployment is explicit opt-in; manual full deploys require protected credentials and DEPLOY_FULL.');
