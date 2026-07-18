# SOKIVA identity and superadministrator setup

## Account model

SOKIVA uses Firebase Authentication for login and Realtime Database profiles for application roles.

Public account creation creates only a `customer` profile. Public forms can never create an administrator, seller, courier or superadministrator.

Supported operational roles:

- `customer`
- `seller`
- `courier`
- `admin`

The platform owner is represented compatibly as:

- `role: admin`
- `isSuperAdmin: true`

This preserves the existing admin authorization checks while allowing the interface to identify the owner as **Super administrateur**.

## Customer registration

The registration page:

1. creates the Firebase Auth account;
2. creates the trusted customer profile through `registerCustomerProfile`;
3. sends a verification email;
4. signs the account out;
5. requires the email to be verified before normal sign-in.

Customer profiles receive:

- `brandId: sokiva`
- `role: customer`
- `status: active`
- the temporary compatibility tenant used by the existing pilot data.

## Compatibility tenant

The public brand is now SOKIVA. The internal tenant database key remains temporarily `lamylenoise` so existing orders, catalogue indexes, rules and audit records continue to resolve atomically.

This compatibility key is not a visible brand and must not be shown in the interface. A later controlled data migration can move every database path and claim to a new tenant key in one operation.

## Creating the first superadministrator

### 1. Create the owner account

Create the owner as a normal SOKIVA customer through `register.html`, verify the email, and sign in once.

### 2. Synchronize the repository

```bash
git switch main
git pull origin main
npm --prefix functions install --ignore-scripts
```

### 3. Run the protected bootstrap locally

In Git Bash, point `GOOGLE_APPLICATION_CREDENTIALS` to the SOKIVA service-account JSON file and pass the exact owner email:

```bash
GOOGLE_APPLICATION_CREDENTIALS="/c/Users/YourName/Downloads/sokiva-dev-firebase-adminsdk.json" \
npm --prefix functions run bootstrap:superadmin -- owner@example.com
```

The bootstrap script:

- reads the service-account JSON locally;
- verifies that its `project_id` is exactly an approved SOKIVA project;
- refuses unrelated or legacy Firebase projects;
- requires the email to already exist in Firebase Auth;
- sets the trusted custom claims;
- updates the profile to active admin + `isSuperAdmin: true`.

The JSON key is never uploaded to the website or exposed in a public form.

### 4. Refresh claims

The owner must sign out and sign in again after bootstrap. Firebase custom claims are refreshed when a new ID token is issued.

## Profile and addresses

The account page loads only the authenticated user’s real profile and real orders. It does not contain seed names, fake points, fake addresses or sample order history.

Profile updates go through `updateMyProfile`. The backend validates:

- UAE phone format;
- supported language;
- maximum five addresses;
- required address fields;
- exactly one default address.

## First deployment

This identity stack requires a manual **full development deployment** because it adds Cloud Functions:

- `registerCustomerProfile`
- `getMyIdentity`
- `updateMyProfile`

In GitHub Actions run **Sokiva Firebase deployment** with:

- environment: `development`
- scope: `full`
- confirmation: `DEPLOY_FULL`

Keep automatic development deployment disabled until registration, email verification, sign-in, account rendering and superadministrator access have been tested successfully.
