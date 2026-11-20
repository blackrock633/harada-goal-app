# Harada monetization implementation and launch runbook

Updated 2026-10-27. This document supersedes the billing, pricing, review-access and App Store sections of `PREMIUM_SYSTEM.md`.

## Status

- **IMPLEMENTED:** Stripe hosted web checkout/portal, native RevenueCat purchase/restore integration, provider verification and reconciliation, centralized database authorization, monthly/annual catalog, downgrade protection, independent audited complimentary grants, Founding 100 allocation, and automated deterministic tests.
- **TESTED IN SANDBOX:** **Not yet.** No real provider test purchase, App Store sandbox purchase, or Google Play license-test purchase was performed. Mocked provider tests are not sandbox certification.
- **REQUIRES EXTERNAL CONFIGURATION:** provider accounts/products, secrets, webhook endpoints, reconciliation schedule, legal/support URLs, native SDK installation and a fresh native development build. npm was unreachable in this workspace (`ENOTFOUND`); `react-native-purchases` is declared at 10.15.0 but its lockfile/install and native linkage remain unverified.
- **NOT YET VERIFIED IN PRODUCTION:** all provider operations. Live billing remains disabled. Do not launch until the checklist below is complete.

## Audit and architecture

The repository has two active clients: Next.js 15/React 19 web and Expo SDK 58/React Native 0.88 with Expo Router for iOS, Android and an Expo web build. There is no basis for treating this as web-only. The legacy browser app is not the payment target. Native projects are generated with Expo; `eas.json` contains deployment profiles and `app.json` has an iOS bundle ID/EAS configuration. Android package registration still needs confirmation before store submission. There is no separate PWA billing provider.

Supabase Auth owns identity. Mobile sessions use secure storage, with cross-account query-cache clearing. Next server actions verify the Supabase session. Mobile writes use Postgres RPCs; web writes use a unit of work that assumes the authenticated database role and user claims. RLS and database triggers therefore cover both write paths. Local development uses PGlite/dev authentication; real billing requires a Supabase-backed environment. Public `profiles` are linked to `auth.users`; social profile data is separate from private subscription state.

The existing code already had Stripe REST Edge Functions, a price catalog, `subscriptions`, `plan_grants`, `get_my_plan`, premium triggers, a paywall, and analytics. It also had native external Stripe links, $7.99/$49.99 prices, paid basic weekly reflections, a three-day locally invented past-due grace, nullable unlimited subscription expiry, and editable excess goals after downgrade. This change extends that architecture instead of installing another web checkout system.

**Selected providers:** retain Stripe Billing/Checkout/Customer Portal for web. RevenueCat wraps StoreKit and Google Play Billing for native purchases. No native purchase routes to Stripe. The existing Stripe integration is not imported into RevenueCat: RevenueCat accepts only allowlisted `app_store`/`play_store` products, never Stripe or promotional transactions. This prevents duplicate authorities for the same transaction. `harada_private.plan_of` is the single effective-access resolver, combining these disjoint provider records with administrative grants. Both clients use that same server result, so an existing subscription works across devices/platforms. Purchase management remains with the original provider.

Official references checked:

- [Stripe webhooks](https://docs.stripe.com/webhooks)
- [Stripe invoice payments](https://docs.stripe.com/api/invoice-payment/list)
- [RevenueCat Expo integration](https://www.revenuecat.com/docs/getting-started/installation/expo)
- [RevenueCat customer identity](https://www.revenuecat.com/docs/customers/identifying-customers)
- [RevenueCat webhook authentication and reconciliation](https://www.revenuecat.com/docs/integrations/webhooks)
- [RevenueCat customer response schema](https://www.revenuecat.com/docs/api-v1/customer-info-model)
- [RevenueCat restoration](https://www.revenuecat.com/docs/getting-started/restoring-purchases)
- [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/)

## Access policy

| Capability | Free | Pro / valid complimentary grant | Server enforcement |
|---|---|---|---|
| Primary goal | One editable active goal | Multiple active goals | Activation and downgrade triggers |
| Full 64-chart, daily actions, basic statistics | Included | Included | Existing ownership/RLS |
| Basic daily and weekly reflection | Three standard fields | Included | Reflection trigger |
| Advanced weekly review | Read saved records | Structured `answers` fields | Reflection trigger |
| Monthly strategy review | Read saved records | Create/edit | Reflection trigger |
| Extended history/comparison | Saved records preserved | Existing `goal_history` output | Feature-checking RPC |
| Challenge | Records preserved | Existing participation and report | Challenge RPCs/RLS |
| Advanced insights | Core progress stays free | Existing history/insight UI | Protected history query |
| Profiles, follows, feed, progress/achievement sharing | Included | Included | Existing social authorization |

The existing feature identifiers are `multiple_goals`, `advanced_reviews`, `challenge`, `progress_history`, `insights`, `premium_templates`, `ai_planning`. They map to the requested conceptual feature names; there is no new competing client authorization interface. Internally use `harada_private.has_feature(user, feature)` and `require_feature`; Edge Functions use service-only `user_has_feature`. Clients display `get_my_plan`, never write it. No fictional analytics or comparison tool was added.

On downgrade, the oldest active goal (`created_at`, then ID) remains editable. Writes to the other active goals and their actions, outcomes, reflections, routine checks and focus additions are denied on the server. Read access remains. Users may explicitly call the existing `choose_active_goal` operation to archive the others, or archive/finish goals themselves. Restoration with Pro preserves the data. Basic weekly reflection remains Free. Saved advanced reflection records stay readable; advanced edits require Pro. Explicit user deletion remains possible; billing never deletes goals, achievements or reflection records.

## Billing and lifecycle

Web checkout accepts only `pro_monthly` or `pro_annual`; the server checks the Stripe price against the database amount/currency/one-month or one-year interval. Card entry occurs only at Stripe. Customers are linked before checkout. A database checkout attempt and Stripe idempotency key reuse the same session on retry; choosing another cadence while a session is open returns a conflict until that session expires (one hour). Existing paid or complimentary Pro access blocks an unnecessary new web purchase. Subscriptions with unresolved payments are managed through the portal.

Native prices come from RevenueCat's current offering, displayed using the store's localized price. Native purchase, cancellation, restoration and errors have separate UI states. Native subscription purchases require configured HTTPS terms/privacy links. Monthly and annual products must have no introductory offers/trials for the current disclosures. The SDK is configured only after sign-in with a stable, random, private billing identity from `my_billing_identity()`, not the public profile UUID. The identity is reused across devices and replaced on account switching. The device's SDK result never writes an entitlement; `billing-sync` asks the provider again.

Stripe webhooks verify raw-body HMAC signatures, timestamp tolerance and deployment mode. They fetch current subscriptions and refund state instead of applying stale event bodies. RevenueCat webhooks require a high-entropy configured Authorization header and the matching environment, then fetch Customer Info. Transfers reconcile both old and new private identities. Unsupported and unrecognized purchases never grant access.

The database applies state and event deduplication transactionally. A generation allocated **before** the external fetch prevents a slower old request overwriting a later fetch. Failures return retryable HTTP status and do not erase existing access. Provider identifiers and billing tables are inaccessible to ordinary users. Logs contain component/error codes or sanitized Stripe errors, not secrets, receipts or payment objects.

- Active/trialing Stripe access ends at the verified period end; null expiry never grants access.
- Cancellation scheduled retains access through that period; immediate cancellation revokes it.
- `past_due` retains only a previously verified paid-through period; no invented Stripe grace window.
- RevenueCat's verified grace-period expiry is respected. Refunded native subscriptions are revoked.
- A full refund of all payments for the latest Stripe invoice revokes access; partial/historical-period refunds do not revoke a later paid period. Reconciliation reads invoice payments and charge refund flags. A subsequent verified non-refunded paid subscription restores access.
- Web return URLs never grant access or claim a payment was received. Users can explicitly check their plan while a webhook is delayed.
- Scheduled `billing-reconcile` repairs missed webhooks; authenticated `billing-sync` rate-limits requests to one per 30 seconds. Run reconciliation frequently enough for the user volume: the batch processes the 20 least-recently reconciled accounts, with a one-hour refresh threshold. Scale the batch/schedule together before large launches. At paid-period expiry during a provider outage, access fails closed until verification succeeds; data is retained.

Full multi-account/parallel purchases across independent stores cannot be atomically prevented by Harada; store groups and the existing-plan check reduce accidental duplicate subscriptions. Provider subscriptions remain separately manageable. Alerts should flag duplicate subscriptions for operator review.

## Database migration

Apply `supabase/migrations/20261027120000_monetization.sql` after the existing migrations, through the normal migration tooling. It does not modify previously applied migrations.

- Updates new-checkout catalog to USD 399/month and 2999/year; clears their price IDs pending configuration.
- Preserves old configured Stripe prices as inactive legacy rows, so existing subscriptions continue to synchronize without a forced plan/price change.
- Adds Stripe environment, paid-through, revocation and generation fields.
- Adds native subscription/event mirrors, settings, lifecycle telemetry, private billing identities, checkout attempts, sync throttling and reconciliation tracking.
- Adds audited `admin_entitlement` grant/revoke/founding operations and a separate Founding Member table.
- Replaces effective plan calculation, basic weekly review restrictions and downgrade write enforcement.

Existing Stripe rows default to sandbox. For an existing live installation, verify and resynchronize them with live provider data in the separate production project before rollout; never blindly relabel test rows as production. Back up and rehearse the migration on staging first.

The concurrent profile/achievement migration `20261027140000_identity_achievements.sql` consumes the same founding designation table. It is separate work; do not create another founding table or derive Pro from its badge.

### Complimentary access and Founding 100

An operator is a row in `public.admins`, created by a trusted administrator outside the app. The signed-in operator calls:

```sql
-- Run as the authenticated admin, not an anonymous SQL session.
select public.admin_entitlement('USER_UUID','founding','Approved Founding 100 application');
select public.admin_entitlement('USER_UUID','grant','Complimentary Pro through launch',null,'2027-01-01');
select public.admin_entitlement('USER_UUID','revoke','Complimentary access revoked','GRANT_UUID');
```

`founding` serializes allocation and enforces numbers 1–100. It does not grant Pro by default. Operators may explicitly enable complimentary founding grants with `update public.billing_settings set founding_complimentary_pro=true`; this affects subsequent approvals only. The badge and grant remain separate, and revoking a grant leaves the designation intact. Paid subscriptions are never overwritten. Audit entries retain the reason, actor, action and timestamp. Do not delete grant rows to revoke access.

## Required configuration

Use separate Supabase projects, Stripe sandbox/live configurations, and RevenueCat projects for staging and production. Never connect sandbox webhooks to production. Runtime environment checks and stored environment tags provide an additional boundary.

| Variable / setting | Location | Purpose |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Edge secrets | Server-only Supabase access (normally injected by Supabase) |
| `STRIPE_SECRET_KEY` | Edge secret | Test or live Stripe secret/restricted key |
| `STRIPE_WEBHOOK_SECRET` | Edge secret | Exact endpoint's signing secret |
| `BILLING_ENVIRONMENT` | Edge setting | `SANDBOX` by default; `PRODUCTION` only in production |
| `ALLOW_LIVE_BILLING` | Edge setting | `false` until separately authorized for live billing |
| `APP_URL` | Edge setting | Web origin; HTTPS required for live mode |
| `ALLOWED_ORIGINS` | Edge setting | Comma-separated explicit web origins |
| `REVENUECAT_SECRET_KEY` | Edge secret | Server-side RevenueCat subscriber-read API key |
| `REVENUECAT_WEBHOOK_AUTHORIZATION` | Edge secret | Exact Authorization header, at least 32 characters; use a random bearer token |
| `REVENUECAT_ENTITLEMENT` | Edge setting | Default `harada_pro` |
| `REVENUECAT_PRODUCT_IDS` | Edge setting | Comma-separated allowlisted native product IDs exactly as returned by Customer Info |
| `BILLING_RECONCILE_AUTHORIZATION` | Edge/Vault secret | Separate random scheduler Authorization header, at least 32 characters |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | Native build | Public iOS SDK key for the corresponding RevenueCat project |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | Native build | Public Android SDK key |
| `EXPO_PUBLIC_TERMS_URL` / `EXPO_PUBLIC_PRIVACY_URL` | Native build | Published HTTPS terms/privacy pages |
| `EXPO_PUBLIC_BILLING_SUPPORT_URL` | Native build | Published HTTPS billing support page |
| `billing_settings.environment` | Database | Must match `BILLING_ENVIRONMENT`; default `SANDBOX` |
| `prices.stripe_price_id` | Database | Server-controlled Stripe price IDs for new checkout |

Keep existing Supabase public frontend settings. Never put provider secret keys or service-role credentials in `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*` variables. `.env.example` documents optional settings without credentials.

## Dashboard setup

### Stripe sandbox first

1. Create Harada Pro as a recurring product, with USD $3.99/month and $29.99/year prices. No paid download or club product. Use one-unit recurring prices, no trials, quantity changes, mixed subscriptions or metered billing.
2. Set the two catalog `stripe_price_id` values in staging. Keep legacy prices for existing subscribers. Checkout refuses any amount/currency/cadence mismatch.
3. Enable Customer Portal cancellation at period end, invoices/payment-method management and switching only between the supported Pro prices. Disable quantity changes and extra products. Configure billing support, business information, terms/privacy and tax treatment in Stripe. Review proration disclosure before enabling plan switches.
4. Register `/functions/v1/stripe-webhook` with the endpoint's secret and **API version `2025-06-30.basil`**, matching the pinned REST adapter. Subscribe to `checkout.session.completed`, `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_succeeded`, and `charge.refunded`.
5. Grant server API access to customers, prices, Checkout sessions, portal sessions, subscriptions, invoices/invoice payments, payment intents and charges. Harada never logs the returned payment objects.
6. Configure payment retry/dunning and cancellation behavior. Harada does not invent a grace period after unpaid renewal.

### RevenueCat and app stores

1. Create separate staging/production projects. Connect the correct App Store Connect app and Google Play app with their required provider credentials.
2. Register monthly/annual subscriptions in one subscription group on iOS and the appropriate subscription/base-plan arrangement on Google Play. Set initial USD prices to $3.99/$29.99; store-localized prices are authoritative. Do not enable introductory trials/offers for this UI.
3. Create entitlement `harada_pro`, attach both native products, and create a current Offering with `MONTHLY` and `ANNUAL` packages. Copy exact Customer Info product IDs into the server allowlist.
4. Configure restore behavior deliberately: require sign-in and prefer keeping purchases with the original identified account. Test any permitted transfer behavior; both sides are reconciled by the webhook.
5. Configure `/functions/v1/revenuecat-webhook`, the exact random Authorization header and the correct environment filter. Send all lifecycle events, including billing issues, expiration, refunds and transfers. Test-store purchases are intentionally not accepted as production/native store entitlements; use actual Apple/Google sandbox testing.
6. Set public SDK keys and legal/support URLs in the corresponding EAS build profile. Install the SDK using `npx expo install react-native-purchases@10.15.0`, commit the generated lockfile, then create a fresh development build. Expo Go cannot verify the real native payment path. The included config plugin sets Android activity launch mode to `singleTop` for payment authorization return flows.
7. Complete App Store subscription metadata/screenshots, agreements/tax/banking, privacy disclosures, Google Play billing setup and license testers. Obtain store approval. Do not replace store purchases with a universal external checkout link.

### Deploy and reconciliation

After staging migration and secret setup:

```sh
npx supabase functions deploy billing-checkout
npx supabase functions deploy billing-portal
npx supabase functions deploy billing-sync
npx supabase functions deploy stripe-webhook --no-verify-jwt
npx supabase functions deploy revenuecat-webhook --no-verify-jwt
npx supabase functions deploy billing-reconcile --no-verify-jwt
```

Public webhook/job endpoints perform their own signature/header authentication. User-facing billing functions authenticate the bearer token with Supabase Auth. If the project uses newer publishable keys incompatible with gateway JWT checking, follow Supabase's deployment guidance for those endpoints while retaining in-function authentication.

Schedule HTTPS POST to `billing-reconcile` every minute using Supabase Cron/pg_net (or the deployment's scheduler), with the Authorization header stored in Vault/secret storage. It takes no user-supplied body. Monitor response failures, webhook delivery failures, reconciliation age and provider API rate limits. Twenty accounts per minute covers 1,200 accounts per hour; increase throughput responsibly before that scale. Avoid overlapping job invocations. Do not paste secrets into committed SQL. Provider retries are finite, so the scheduler is required for launch.

## Analytics and reporting

Existing first-party events cover paywall views/prompts and checkout initiation. Verified Stripe event IDs record checkout completion/payment outcomes exactly once. `billing_lifecycle_events` records provider activation, cancellation scheduling, reactivation, renewal and status changes. The table is server-written; users cannot forge financial events. Existing admin metrics are operational approximations of the Stripe mirror, not a ledger and not complete native revenue. Use Stripe and RevenueCat reports for authoritative revenue, refunds and native conversion. Never sum client success events as revenue.

## Verification and launch checklist

See `MONETIZATION_TEST_RESULTS.md` for the final local commands/results and limitations.

- [ ] Install SDK and commit its generated native lockfile; compile iOS and Android development builds.
- [ ] Apply/rehearse all migrations in staging, including the other profile work if shipped together.
- [ ] Configure staging Stripe prices, portal and signed webhook; configure native store products/offerings/entitlement/webhook.
- [ ] Configure legal/support pages and matching client/server environments; test production rejects sandbox state.
- [ ] Run actual Stripe sandbox monthly/annual checkout, abandoned checkout, SCA, duplicate retries, cancellation/reactivation, plan changes, failed renewal, renewal, full/partial refunds and delayed/reordered webhook replay.
- [ ] Run Apple sandbox and Google license-test monthly/annual purchases, pending/cancelled payments, billing retry/grace/expiry, refund/revocation, restore after reinstall, account switching and cross-device entitlement synchronization.
- [ ] Verify grant/revoke/founding authorization, capacity, audit records and no coupling to badge display.
- [ ] Verify Free core/social/weekly-reflection functionality and all paid server boundaries with direct API calls.
- [ ] Verify multiple-goal downgrade read/edit selection and re-upgrade without data loss.
- [ ] Enable/monitor the reconciliation scheduler; test a deliberately missed webhook and provider outage.
- [ ] Verify Edge Functions under Deno/Supabase runtime; local TypeScript wiring checks do not substitute for deployment tests.
- [ ] Obtain store approval and separately authorize production/live billing. Only then configure a separate live project/key/endpoint and set both environment settings to production.
- [ ] Perform a separately authorized production smoke test and record evidence. None has been performed by this task.
