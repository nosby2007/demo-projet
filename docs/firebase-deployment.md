# SOKIVA Firebase deployment pipeline

## What the pipeline does

The workflow `.github/workflows/firebase-deploy.yml` provides two deployment paths:

1. **Opt-in automatic development Hosting deployment**
   - remains disabled until repository variable `FIREBASE_AUTO_DEPLOY_DEV=true` is created;
   - runs only after the `Sokiva marketplace quality gate` succeeds on `main`;
   - deploys only Firebase Hosting;
   - targets only `sokiva-dev`.

2. **Manual controlled deployment**
   - started from GitHub Actions;
   - supports `development`, `staging` and `production` environments;
   - supports Hosting-only or full Hosting + Realtime Database rules + Cloud Functions deployment;
   - requires an explicit confirmation string.

The safe deploy wrapper rejects legacy projects and any project that does not match:

- `sokiva-dev`
- `sokiva-staging`
- `sokiva-prod`

## One-time development setup

### 1. Prepare a Firebase deployment service account

Create or select a dedicated service account in the `sokiva-dev` Google Cloud/Firebase project and download its JSON key.

The account must have the permissions required by the selected deployment scope:

- Firebase Hosting for Hosting-only deployments;
- Realtime Database Rules and Cloud Functions deployment permissions for full deployments.

Keep the JSON file outside the repository. Never commit it.

### 2. Synchronize the repository locally

```bash
git switch main
git pull origin main
```

After this pipeline PR is merged, run the setup helper from the repository root:

```bash
bash scripts/configure-firebase-github.sh development "/c/path/to/sokiva-dev-service-account.json"
```

The helper verifies that the JSON key belongs to `sokiva-dev`, creates the GitHub Environment `development`, and stores:

- Environment variable `FIREBASE_PROJECT_ID=sokiva-dev`
- Encrypted Environment secret `FIREBASE_SERVICE_ACCOUNT_JSON`

The JSON key is read from the local computer and encrypted directly by GitHub CLI. It is not added to Git or copied into the repository.

### 3. Verify GitHub configuration

```bash
gh variable list --env development --repo nosby2007/demo-projet
gh secret list --env development --repo nosby2007/demo-projet
```

The secret value is never displayed, which is expected.

## First manual development deployment

Keep automatic deployment disabled for the first test.

Open GitHub:

1. **Actions**
2. **Sokiva Firebase deployment**
3. **Run workflow**
4. Environment: `development`
5. Scope: `hosting`
6. Confirmation: `DEPLOY`

After the workflow succeeds, verify the development Hosting site and its deployment summary.

## Enable automatic development deployment

Only after a successful manual Hosting test, enable the repository-level opt-in:

```bash
gh variable set FIREBASE_AUTO_DEPLOY_DEV \
  --repo nosby2007/demo-projet \
  --body true
```

Then the automatic sequence becomes:

1. changes are merged into `main`;
2. the quality workflow runs;
3. only if the quality workflow succeeds, Firebase Hosting deploys the exact validated commit to `sokiva-dev`;
4. the deployment summary displays the environment, project, scope and revision.

The automatic path never deploys Database rules or Cloud Functions.

Disable automatic development deployment at any time with:

```bash
gh variable set FIREBASE_AUTO_DEPLOY_DEV \
  --repo nosby2007/demo-projet \
  --body false
```

## Manual deployment

Open GitHub:

1. **Actions**
2. **Sokiva Firebase deployment**
3. **Run workflow**

Choose:

- Environment: `development`, `staging`, or `production`
- Scope: `hosting` or `full`

Confirmation values:

- Hosting-only: `DEPLOY`
- Hosting + Database rules + Functions + Storage rules: `DEPLOY_FULL`

The workflow validates that each GitHub Environment points to the matching Firebase project. For example, `production` cannot deploy unless its `FIREBASE_PROJECT_ID` is exactly `sokiva-prod`.

## Staging and production

Do not configure these environments until the Firebase projects exist.

When they are ready:

```bash
bash scripts/configure-firebase-github.sh staging "/c/path/to/sokiva-staging-service-account.json"
bash scripts/configure-firebase-github.sh production "/c/path/to/sokiva-prod-service-account.json"
```

In GitHub repository settings, add required reviewers to the `staging` and `production` Environments before using them. This adds a human approval gate before credentials are released to a deployment job.

## Local deployment command

Hosting-only development deployment:

```bash
FIREBASE_PROJECT_ID=sokiva-dev \
FIREBASE_DEPLOY_ONLY=hosting \
npm run deploy
```

Full development deployment:

```bash
FIREBASE_PROJECT_ID=sokiva-dev \
FIREBASE_DEPLOY_ONLY=hosting,database,functions,storage \
FIREBASE_CONFIRM_FULL=DEPLOY_FULL \
npm run deploy
```

The wrapper uses an explicit project and `--non-interactive`; it never relies on the Firebase CLI's currently selected project.

## Credential incident response

If a service account JSON file is ever committed, pasted into an issue, or exposed in a screenshot:

1. disable or delete the key immediately in Google Cloud IAM;
2. generate a replacement key;
3. update `FIREBASE_SERVICE_ACCOUNT_JSON` in the relevant GitHub Environment;
4. remove the exposed material from the repository history when necessary.
