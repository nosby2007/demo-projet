# Employment Product Roadmap

## Mission

Enable African sellers and local couriers to create sustainable income through a marketplace designed around trust, simple operations, and transparent earnings.

## Primary users

### Seller

A seller may be an independent importer, home-based food producer, beauty specialist, fashion creator, restaurant, grocery store, or service provider.

The seller needs:

- a simple verified application;
- a public storefront and business profile;
- product submission with admin review;
- stock and availability controls;
- clear order preparation tasks;
- customer communication without exposing unnecessary personal data;
- transparent gross sales, fees, refunds, and payout balance;
- training and guidance for product photography, pricing, and customer service.

### Courier

A courier may work independently or through a local delivery partner.

The courier needs:

- a verified application and identity status;
- delivery zones and availability schedule;
- a list of eligible jobs;
- earnings displayed before accepting a job;
- safe pickup and drop-off instructions;
- navigation and customer contact controls;
- delivery proof;
- completed-job history and payout balance;
- ratings and dispute protection.

### Customer

The customer needs:

- authentic and available products;
- verified seller identity;
- reliable delivery estimates;
- transparent order status;
- safe payment and refund handling;
- support when a seller or courier cannot complete an order.

## Pilot scope: Abu Dhabi and Dubai

The pilot should remain intentionally narrow.

- 5 to 10 verified sellers;
- 3 to 5 verified couriers;
- cash on delivery;
- selected delivery zones;
- admin-reviewed product catalogue;
- manual payout reconciliation;
- direct operational support;
- weekly review of failed orders, delays, cancellations, and worker earnings.

## Employment workflow

### Seller onboarding

1. Create a customer account.
2. Submit seller application.
3. Provide business name, category, location, phone, and identity/business evidence.
4. Admin reviews the application.
5. Server assigns seller role and tenant.
6. Seller completes profile and payout information.
7. Seller submits products for review.
8. Approved products become active.

### Courier onboarding

1. Create a customer account.
2. Submit courier application.
3. Provide service zones, vehicle type, availability, phone, and verification documents.
4. Admin approves the existing account.
5. Courier completes safety and operating guidance.
6. Courier becomes eligible for jobs in approved zones.

### Order employment flow

```text
Customer order
  -> secure server validation
  -> seller preparation work
  -> ready for pickup
  -> courier accepts job
  -> in transit
  -> delivered with proof
  -> earnings become eligible for settlement
```

## Delivery milestones

### Milestone 1 — Secure pilot foundation

- server-authoritative orders;
- role-limited order visibility;
- multi-seller suborders;
- delivery jobs;
- product review queue;
- secure role approval;
- cash-on-delivery status.

### Milestone 2 — Worker operations

- seller availability and stock;
- courier zones and schedules;
- job acceptance transaction to prevent double assignment;
- delivery proof photo or OTP;
- cancellation reasons;
- worker notification inbox;
- earnings statements.

### Milestone 3 — Trust and payments

- identity and business verification records;
- online payment provider;
- verified payment webhooks;
- refund workflow;
- immutable earnings ledger;
- seller and courier payout batches;
- dispute workflow;
- customer, seller, and courier ratings.

### Milestone 4 — Growth outside UAE

- tenant-specific currency and taxes;
- configurable delivery zones;
- configurable commission policy;
- language packs;
- local payment providers;
- local compliance and operating partner roles;
- country-specific seller and courier verification.

## Success metrics

The platform should optimize employment and reliability, not vanity catalogue size.

- active earning sellers per month;
- active earning couriers per month;
- median seller monthly earnings;
- median courier earnings per completed job;
- percentage of orders completed successfully;
- time from order to seller readiness;
- time from readiness to courier pickup;
- cancellation and refund rate;
- repeat customer rate;
- seller and courier retention after 30 and 90 days.

## Product guardrails

- Do not claim a payment is complete without a verified provider event.
- Do not expose all customer data to every seller or courier.
- Do not allow two couriers to claim the same job.
- Do not hide fees or worker earnings.
- Do not activate sellers or couriers without an accountable approval record.
- Do not expand geographically until the pilot delivery operation is reliable.
