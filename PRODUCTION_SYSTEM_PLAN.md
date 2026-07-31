# Carousel Generator Production System Plan

## Product model

The application uses a local-first, payment-provider-independent architecture:

- Guests can create and export carousels stored only in their browser.
- Authenticated free users receive limited cloud storage and AI credits.
- Creator users receive expanded storage, AI credits, version history, and paid templates.
- Payments change internal entitlements; PayPal, manual payments, and a future Paddle integration are adapters rather than the source of truth.

Initial plan limits are configuration, not hard-coded product logic:

| Plan | Cloud carousels | Storage | AI credits/month | Templates |
| --- | ---: | ---: | ---: | --- |
| Guest | 0 | Local browser only | 0 | Free |
| Free | 5 | 100 MB | 5 | Free |
| Creator | 100 | 2 GB | 150 | Free and premium |

## Phase 1: tenant isolation and security

1. Use personal workspaces as the tenancy boundary from day one.
2. Derive user identity from a verified Firebase ID token; never accept a caller-provided owner ID.
3. Store cloud data under `workspaces/{workspaceId}` and authorize access through the workspace owner or membership records.
4. Add version-controlled Firestore and Storage rules plus security contract tests.
5. Disable the legacy process-global carousel API in production. It may only be enabled explicitly for local MCP development.
6. Keep server-only collections, including entitlements, usage ledgers, and payment events, unwritable by browser clients.

## Phase 2: multi-carousel local persistence

1. Replace the single `localStorage` document with an IndexedDB repository.
2. Store independent carousel records with stable IDs, names, creation timestamps, update timestamps, and documents.
3. Add a local library supporting create, open, rename, duplicate, and delete.
4. Autosave the active carousel without blocking editing.
5. Migrate `localStorage.carousel_state` exactly once and retain a migration marker.
6. Keep browser data isolated from signed-in cloud data and make guest-to-cloud import explicit.

## Phase 3: entitlements and cloud persistence

1. Create a personal workspace on first sign-in.
2. Store cloud carousels under `workspaces/{workspaceId}/carousels/{carouselId}`.
3. Define provider-neutral plan limits and normalize effective entitlements on the server.
4. Enforce authentication and AI-credit availability on AI endpoints.
5. Record AI usage idempotently in a server-only ledger and monthly workspace usage document.
6. Keep UI gating advisory; server and Firebase rules remain authoritative.
7. On downgrade, preserve existing content and prevent only additional usage above the new limits.

## Later phases

### Manual paid access

An admin-only grant flow records a payment reference, amount, currency, coverage period, and expiry before granting Creator entitlements. Grants expire automatically and are auditable; production access is never granted through ad hoc Firestore edits.

### Premium templates

Templates have stable IDs, versions, previews, categories, and access tiers. Public previews are separate from protected payloads. Premium payloads are returned only by an authenticated, entitlement-checked endpoint. Applying a template clones it into the user's carousel.

### PayPal and Paddle

Payment adapters translate verified provider events into internal subscription records. Browser redirects never grant access. Webhook event IDs are stored for replay safety. PayPal can be added when merchant eligibility is confirmed; Paddle can be added later without changing application authorization.

## Required acceptance gates

- User A cannot read, list, update, delete, or download User B's data.
- Signed-out users cannot use AI or cloud endpoints.
- Free users cannot fetch premium template payloads directly.
- AI credits are deducted once even if requests are retried.
- Forged or replayed payment events cannot grant access.
- Manual grants expire and downgrades do not delete customer data.
- Account changes never expose another account's local or cloud carousel.
- Existing `carousel_state` data migrates once and remains available after reload.
- Applying a template creates an independent carousel copy.

## Rollout order

1. Deploy application code that understands the new workspace model and legacy migration.
2. Deploy Firestore and Storage indexes/rules.
3. Verify isolation with two production test accounts.
4. Enable cloud sync for a small cohort behind a feature flag.
5. Enable AI metering after usage documents and alerts are visible.
6. Add manual Creator grants, then premium templates, then automated billing.
