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

## Phase 2

Phase 2 turns the trusted read console into an operational command surface:

1. Administrators with `orders.write` can cancel eligible orders or force the ready-for-pickup transition when every seller leg is ready.
2. Every order intervention requires a reason and creates a privacy-safe audit event.
3. Administrators with `finance.read` receive a server-consolidated reconciliation queue; the browser never reads `earnings` directly.
4. Administrators with `finance.write` can settle up to 50 eligible seller or courier earnings atomically against a required payment reference.
5. A batch fails completely if one selected earning is missing or was already settled, preventing partial and duplicate reconciliation.
6. Delegated administrators see only modules allowed by granular permissions; the platform owner retains `*` access.

## Roadmap

Later phases will add delegated admin roles, granular permissions, durable daily aggregates, advanced order actions, payouts and reconciliation, customer support SLA, promotions, campaign operations, fraud review, system health, cost telemetry and AI-assisted operational analysis.

## Phase 3

Phase 3 introduces durable operational analytics:

1. Every order write updates a tenant-scoped daily aggregate from a per-order contribution ledger, making trigger retries idempotent.
2. Status changes replace the previous contribution instead of double-counting the order.
3. The aggregate stores order count, GMV, delivery, cancellation, payment and recognized platform revenue metrics.
4. The dashboard reads only the latest bounded daily series through the trusted admin callable.
5. The executive view exposes 7-day and 30-day summaries plus a responsive daily trend.
6. Browser access to `adminDailyMetrics` remains completely denied by Realtime Database rules.
7. An administrator with `analytics.write` can initialize the durable series from up to 500 tenant-filtered historical orders; the response explicitly reports truncation.
8. Backfill uses a transaction and preserves newer live order contributions committed while the rebuild is running.

## Phase 4

Phase 4 adds trusted Support Operations:

1. Active authenticated users create support cases only through a callable; direct database access remains denied.
2. Priority determines a server-calculated SLA target: critical 1 hour, high 4 hours, normal 12 hours and low 24 hours.
3. Administrators require `support.read` to view the privacy-minimized queue and `support.write` to act.
4. The queue exposes assignment, start, escalation, resolution and reopening workflows.
5. Escalation and resolution require an administrative note and every case mutation is audited.
6. Descriptions and private administrative notes are excluded from list summaries.

## Phase 5

Phase 5 adds trusted Risk & Fraud Operations:

1. Order writes are evaluated by deterministic rules with explicit signal weights; no opaque or AI-generated score is used.
2. High-value, payment-status mismatch, rapid-order, cancellation and refund signals create a tenant-scoped review case.
3. Administrators require `risk.read` for the privacy-minimized queue and `risk.write` for decisions.
4. Review states cover open, in-review, cleared, restricted and escalated cases with validated transitions.
5. Clearing, restricting, escalating and reopening require a reason; restriction state and the case decision are committed atomically.
6. Personal data and private decision reasons never appear in queue summaries or audit payloads.
7. Browser access to `riskCases` and `riskRestrictions` remains denied; only trusted functions can evaluate or mutate risk state.

## Phase 6

Phase 6 adds trusted System Health & Cost Telemetry:

1. Administrators require `system.read` for live health and `system.write` to capture a durable snapshot.
2. Server-side checks cover stalled orders, stale deliveries, breached support SLA, critical risk and analytics freshness.
3. Overall health is derived deterministically as healthy, degraded or critical from documented thresholds.
4. Capacity telemetry reports bounded estimated read units and explicitly states that it is neither billing data nor a Firebase invoice.
5. Snapshots contain only aggregate counts and statuses; raw operational records and personal data are never persisted.
6. The latest 30 snapshots provide a bounded health history through a trusted callable.
7. Browser access to `adminSystemTelemetry` remains denied by Realtime Database rules.

## Phase 7

Phase 7 adds trusted Promotions & Campaign Operations:

1. Administrators require `campaign.read` to inspect campaigns and `campaign.write` to create or transition them.
2. Campaign names, atomically unique normalized codes, discount values, budgets and time windows are validated by the backend.
3. The lifecycle supports draft, scheduled, active, paused, completed and cancelled states with explicit allowed transitions.
4. Activation and resumption require a currently valid campaign window; pause and cancellation require a reason.
5. Queue summaries expose budget, spend and usage aggregates without private administrative reasons.
6. Creation and every lifecycle decision are attributed to the administrator in the audit log.
7. Browser access to `campaigns` remains denied; all reads and mutations use trusted callable functions.

## Phase 8

Phase 8 adds owner-controlled Delegated Admin Governance:

1. Only a profile and signed claim both marked `isSuperAdmin` may manage delegated administrators.
2. The owner can promote an existing same-tenant profile, assign bounded permissions, suspend, reactivate or demote it.
3. A super-admin, the acting owner and profiles from another tenant cannot be targeted.
4. Permissions are selected from a fixed allowlist; wildcard and unknown permissions are rejected.
5. Profile state changes precede Auth claim synchronization so partially synchronized promotions never gain access.
6. Every governance action requires a reason and creates an administrator-attributed, privacy-safe audit event.
7. `delegatedAdmin.read` is available for delegated permission catalogs, while all governance mutations remain owner-only.
8. The governance workspace lists same-tenant non-admin profiles, reconciles verified pending profiles, supports masked search and promotes directly without manual UID entry.
9. Promotion is rejected server-side unless Firebase Authentication confirms the target email is verified.

## Phase 9

Phase 9 adds privacy-safe Operational Intelligence:

1. Administrators require `insights.generate`; the OpenAI key is a server secret and never reaches the browser or repository.
2. Only tenant-scoped aggregate counts are sent to the model; no profile, contact, address, note or raw record is included.
3. The Responses API uses a strict JSON schema and disables response storage.
4. Recommendations cite aggregate evidence and can never execute operational actions.
5. Human approval is forced on every recommendation, regardless of model output.
6. A deterministic fallback remains available when the model service is unavailable.
7. Generation is audited without storing prompts, model prose or personal data.
