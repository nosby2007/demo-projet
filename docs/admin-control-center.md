# SOKIVA Enterprise Operations Control Center

## Purpose

The Enterprise Operations Control Center is the trusted administrative plane for SOKIVA. It consolidates marketplace, order, finance, identity and risk information without weakening Firebase Realtime Database rules.

## Security model

- No direct browser reads of `orders`, `products`, `deliveryJobs`, earnings or other sensitive operational branches.
- Every administrative dataset is returned by a trusted callable Cloud Function.
- RBAC is enforced in the backend from the authenticated profile and signed Firebase Auth claims.
- The platform owner uses `role: admin` and `isSuperAdmin: true`.
- Future delegated administrators must receive explicit `adminPermissions` entries.
- Tenant selection is checked against the authenticated administrator profile.
- Customer contact and address data are excluded from order summaries returned to the dashboard.
- Role approval and rejection are backend operations and are audited by existing database triggers.

## Phase 1

Phase 1 establishes the enterprise foundation:

1. `getAdminCommandCenter` consolidates bounded operational snapshots.
2. `approveRoleRequestEnterprise` applies granular admin permission checks before the trusted approval workflow.
3. `rejectRoleRequest` provides a trusted and auditable refusal workflow.
4. Existing role approval continues to synchronize Firebase Auth custom claims.
5. `admin-runtime.js` displays loading, empty, success and failure states instead of leaving a blank page.
6. The executive dashboard exposes GMV, orders, recognized and expected platform revenue, seller and courier liabilities, marketplace actors, access requests, product moderation and low-stock alerts.
7. The UI never calls Realtime Database directly for sensitive enterprise data.

## Data contract

The dashboard response contains:

- `viewer`: masked account identity and granted permissions;
- `executive`: GMV, basket, order, payment and revenue indicators;
- `operations`: status counts and privacy-safe recent orders;
- `access`: role requests and claims synchronization failures;
- `marketplace`: role counts, product moderation and stock alerts;
- `security`: trusted source, project, region and data-quality warnings.

The callable limits each source to a bounded number of recent records. A warning is returned when a source reaches the limit so later phases can introduce durable aggregate tables without silently presenting incomplete analytics.

## Deployment

This phase adds Cloud Functions and frontend assets. Run the GitHub Actions workflow with:

- environment: `development`
- scope: `full`
- confirmation: `DEPLOY_FULL`

After deployment, sign out and sign in again before opening `admin.html` so the latest signed claims are available.

## Roadmap

Later phases will add delegated admin roles, granular permissions, durable daily aggregates, advanced order actions, payouts and reconciliation, customer support SLA, promotions, campaign operations, fraud review, system health, cost telemetry and AI-assisted operational analysis.
