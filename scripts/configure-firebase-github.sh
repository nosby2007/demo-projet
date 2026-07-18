#!/usr/bin/env bash
set -euo pipefail

REPOSITORY="${GITHUB_REPOSITORY:-nosby2007/demo-projet}"
ENVIRONMENT="${1:-development}"
KEY_FILE="${2:-}"

case "$ENVIRONMENT" in
  development) PROJECT_ID="sokiva-dev" ;;
  staging) PROJECT_ID="sokiva-staging" ;;
  production) PROJECT_ID="sokiva-prod" ;;
  *)
    echo "Unknown environment: $ENVIRONMENT" >&2
    echo "Use development, staging or production." >&2
    exit 1
    ;;
esac

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI is required. Install gh, then run gh auth login." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to validate the service account JSON file." >&2
  exit 1
fi

gh auth status >/dev/null

if [ -z "$KEY_FILE" ] || [ ! -f "$KEY_FILE" ]; then
  echo "Service account JSON file not found." >&2
  echo "Usage: bash scripts/configure-firebase-github.sh $ENVIRONMENT /path/to/service-account.json" >&2
  exit 1
fi

ACTUAL_PROJECT_ID="$(node -e 'const fs=require("fs"); const file=process.argv[1]; const data=JSON.parse(fs.readFileSync(file,"utf8")); process.stdout.write(String(data.project_id||""));' "$KEY_FILE")"

if [ "$ACTUAL_PROJECT_ID" != "$PROJECT_ID" ]; then
  echo "Configuration blocked: the key belongs to '$ACTUAL_PROJECT_ID', expected '$PROJECT_ID'." >&2
  exit 1
fi

echo "Creating or updating GitHub Environment '$ENVIRONMENT' in $REPOSITORY..."
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "repos/$REPOSITORY/environments/$ENVIRONMENT" >/dev/null

echo "Setting FIREBASE_PROJECT_ID=$PROJECT_ID..."
gh variable set FIREBASE_PROJECT_ID \
  --repo "$REPOSITORY" \
  --env "$ENVIRONMENT" \
  --body "$PROJECT_ID"

echo "Encrypting FIREBASE_SERVICE_ACCOUNT_JSON in GitHub..."
gh secret set FIREBASE_SERVICE_ACCOUNT_JSON \
  --repo "$REPOSITORY" \
  --env "$ENVIRONMENT" \
  < "$KEY_FILE"

echo
printf "Firebase deployment environment configured:\n"
printf "  Repository: %s\n" "$REPOSITORY"
printf "  Environment: %s\n" "$ENVIRONMENT"
printf "  Firebase project: %s\n" "$PROJECT_ID"
printf "  Secret: FIREBASE_SERVICE_ACCOUNT_JSON\n"
echo
printf "The local JSON key was not uploaded to the repository. Store it securely or delete the local copy after verification.\n"

if [ "$ENVIRONMENT" = "development" ]; then
  echo
  echo "Automatic development deployment remains disabled by default."
  echo "After one successful manual Hosting deployment, enable it with:"
  echo "gh variable set FIREBASE_AUTO_DEPLOY_DEV --repo $REPOSITORY --body true"
fi
