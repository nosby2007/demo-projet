# LAMYLENOISE SaaS Architecture

## Product direction

LAMYLENOISE is not intended to copy a global general-purpose marketplace. It is a focused commerce and employment platform that helps African sellers reach customers and helps local couriers earn income through trusted delivery work, starting in the UAE.

The first production tenant is `lamylenoise`. The architecture introduces a tenant boundary now so that the platform can later support other cities, countries, communities, or operating partners without mixing their data.

## Core principles

1. **Employment first**: seller and courier workflows must improve access to real earning opportunities.
2. **Server-authoritative commerce**: prices, totals, commissions, payment states, assignments, and payouts are never trusted from the browser.
3. **Transparent earnings**: each seller order and delivery job records the amount attributed to the worker.
4. **Progressive rollout**: cash on delivery is the first supported payment flow; online payment providers will be connected only through verified webhooks.
5. **Focused marketplace**: the platform prioritizes African products, verified sellers, reliable delivery, and local customer trust.

## Runtime components

```text
Static storefront and role portals
        |
        | Firebase callable functions
        v
Cloud Functions (me-central1)
        |
        +-- Firebase Auth and custom claims
        +-- Realtime Database
        +-- future payment provider webhooks
        +-- future email, SMS and WhatsApp notifications
```

The existing HTML, CSS and modular JavaScript remain in place during the first migration stage. `saas-runtime.js` replaces sensitive browser operations with callable Cloud Functions.

## Trusted functions

### `createOrderDraft`

- requires an authenticated customer;
- reloads every product from the database;
- ignores totals supplied by the browser;
- validates product status and tenant;
- recalculates shipping and all monetary values;
- creates one customer order and one seller order per seller;
- creates a courier job for cash-on-delivery orders;
- records payment as `pending_cod` or `pending`, never automatically as paid.

### `listOrdersForRole`

Returns only the operational data appropriate to the authenticated role:

- admin: tenant orders;
- customer: own orders;
- seller: own seller orders;
- courier: available jobs and jobs assigned to that courier.

### `transitionOrder`

Applies role-specific state transitions. A courier can claim an available job and mark their assigned job delivered. A seller can prepare their own seller order. An admin can supervise the full lifecycle.

### `submitProduct`

A seller submission is stored as `pending_review`. Admin-created products may be activated directly.

### `approveRoleRequest`

Approves an existing authenticated account, updates the profile, and applies Firebase Auth custom claims. Passwords are never generated or stored in the database.

## Data model

```text
profiles/{uid}
tenants/{tenantId}/public
roleRequests/{requestId}
products/{productId}
orders/{orderId}
customerOrders/{customerUid}/{orderId}
sellerOrders/{sellerUid}/{orderId}
deliveryJobs/{orderId}
```

Every new business record contains `tenantId`. Direct browser writes are denied for orders, seller orders, customer order indexes, and delivery jobs.

## Commission model for the pilot

For merchandise subtotal:

- platform: 15%;
- courier base earning: 10%;
- seller earning: remaining 75%.

The delivery fee is added to the courier allocation. This is an initial operating model, not a permanent universal rule. Future tenant configuration will allow controlled commission policies by market and service type.

## Payment rollout

### Pilot

- cash on delivery;
- server-created orders;
- courier assignment;
- manual reconciliation by admin.

### Next stage

- payment provider checkout session created by a Cloud Function;
- provider webhook verifies success;
- webhook changes `paymentStatus` to `paid`;
- immutable ledger entries are created;
- refunds and seller payouts are processed from server-side records.

The frontend must never mark a payment successful.

## Security boundaries

- Firebase Auth identifies every customer, seller, courier, and admin.
- Custom claims accelerate role checks, while the database profile remains the business record.
- Realtime Database client rules deny writes to financial and operational collections.
- Cloud Functions use Admin SDK and perform all authorization and validation.
- Firebase App Check should be enforced after staging validation.
- Production must use a dedicated Firebase project instead of the shared `nursehome-7dc3f` project.

## Environments

Target projects:

```text
lamylenoise-dev
lamylenoise-staging
lamylenoise-prod
```

No production deployment should occur until these projects and their secrets are separated.

## Migration path

1. Secure the current static application with callable functions.
2. Validate the pilot workflow with a small group of sellers and couriers.
3. Move the UI incrementally to Angular standalone applications.
4. Introduce payment webhooks and an immutable financial ledger.
5. Add configurable tenants, subscriptions, plans, and regional operating rules.
6. Expand to additional markets only after operational metrics prove reliability.
