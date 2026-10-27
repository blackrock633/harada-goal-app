# Harada Pro, the 30-Day Challenge, sharing and analytics

How the premium system is built, what it enforces where, and what a deploy needs. Written 2026-10-26.

## 1. Shape

```
 Mobile app (Expo)            Web app (Next.js)                 Stripe
   reads + RPCs ──────────┐     landing, pricing, /s/<token>,     Checkout, Portal
   functions.invoke ───┐  │     /billing/*, /account/billing,       │
                       │  │     /challenge, /admin                  │ signed webhook
                       ▼  ▼            │                            ▼
            Supabase Edge Functions    │            stripe-webhook ──► billing_apply()
            billing-checkout ──► Stripe API                              (service role)
            billing-portal  ──► Stripe API                                    │
            ai-plan         ──► Claude API (Pro, 20/day)                      ▼
                       │                                  Postgres: subscriptions, plans, prices
                       ▼                                  plan_of(user) ← the one entitlement check
            Postgres RPCs and triggers (RLS, grants, write guard)
```

- **One source of truth for access:** `harada_private.plan_of(user)` returns `free` or `pro` from
  `subscriptions` (Stripe's state, written only by the webhook) and `plan_grants` (comps/test access, written
  only by an operator). Every premium rule asks `harada_private.has_feature()`. Clients only *display*
  `get_my_plan()`.
- **Enforcement lives in the database**, so the mobile RPC path and the web server path (which writes tables
  directly) are covered alike: the active-goal limit and the review rules are triggers; templates, history,
  share cards and the challenge are SECURITY DEFINER functions that check `auth.uid()` themselves.
- **Limits and prices are rows** (`plans.max_active_goals`, `plan_features`, `prices`), not constants.

## 2. Free and Pro

| Capability | Free | Pro | Enforced by |
|---|---|---|---|
| Goals | 1 active (drafts unlimited) | unlimited active | trigger `goals_active_limit` (HG402) |
| Matrix 1 + 8 + 64, daily tracking, basic progress | yes | yes | — |
| Daily reflection (3 questions) | yes | yes | — |
| Weekly and monthly reviews | — | yes | trigger `reflections_review_entitlement`, RLS `reflections_select_own` |
| Progress history and trends | — | yes | `goal_history()` |
| Templates | 4 free | + 5 premium | `get_template()` |
| Planning suggestions (Claude) | — | yes, 20/day | `ai-plan` Edge Function |
| 30-Day Challenge | — | yes | `join_challenge()`, `leave_challenge()`, `complete_challenge()`, `challenge_summary()`, RLS `challenge_select_own` |
| Progress cards, share links | yes | yes (`challenge` card is Pro) | `build_card()` |

**Downgrades never touch data.** Goals, weekly/monthly reviews and challenge enrollments stay stored and untouched. A user over the Free
limit sees `overLimit: true` and picks one goal with `choose_active_goal()`; the others are archived (not
deleted) and can be restored as active again with Pro. Existing weekly/monthly reflections and challenge enrollments remain intact and become accessible again when the user upgrades to Pro.

**Subscription states** (`plan_of`):

| Stripe status | Access |
|---|---|
| `active`, `trialing` | Pro until `current_period_end` |
| `active` + `cancel_at_period_end` | Pro until the period ends, then Free (Stripe sends `canceled`) |
| `past_due` (renewal failed, Stripe retrying) | Pro for 3 days after the period end, then Free |
| `canceled`, `unpaid`, `incomplete*`, `paused` | Free |

## 3. Billing (Stripe)

- **Checkout** (`billing-checkout`): signed-in user only; refuses a second subscription (use the portal);
  checks that Stripe's price (amount, currency, interval) equals the `prices` row Harada displays, so the page
  can never show one price and charge another; creates/links one Stripe customer per user (idempotency key);
  returns the Checkout URL. Card data stays on Stripe.
- **Portal** (`billing-portal`): payment method, invoices, plan switch, cancellation.
- **Webhook** (`stripe-webhook`, deployed with `--no-verify-jwt`): verifies the `Stripe-Signature` HMAC on the
  raw body (5-minute tolerance) before parsing; applies `customer.subscription.*`, `checkout.session.completed`
  (links the customer, reads the subscription) and records `invoice.*`. `billing_apply()` is idempotent on the
  event id (`billing_events`) and ignores events older than the stored state, so redeliveries and
  out-of-order delivery are safe. Returns 500 only when the database could not be updated (Stripe retries).
- **Safe testing:** `sk_test_` keys are Stripe test mode. A live key is refused unless `ALLOW_LIVE_BILLING=true`.
  For QA without Stripe, grant Pro with a row in `plan_grants` (SQL editor).
- **Success page** (`/billing/success`) shows "Pro is active" only when `get_my_plan()` says so.
- **App Store:** purchases happen on Stripe's web checkout, opened in the browser. Before submitting the iOS
  app, decide how this fits Apple's rules for your storefronts (US external purchase links are allowed; other
  storefronts may require in-app purchase). This is a policy decision, not code.

## 4. Reviews, templates, history

- `reflections.kind` adds `monthly`; `reflections.answers` (jsonb) holds the extra questions
  (`intended, completed, obstacles, learned, priorities, strategy`), validated by `parse_answers()`.
- `goal_templates` holds every template (free and premium) as data; add one with an `insert` (shape of
  `src/domain/templates.ts`). The free rows mirror the bundled templates (test `templates-sync`).
- `goal_history(goal, weeks)`: per week, tasks due vs done, tasks completed, routine days checked, reflections
  and plan changes. Activity only; the UI says so.

## 5. The 30-Day Challenge

`challenge_enrollments` (one `active` per user, unique index), `join_challenge` (needs an active own goal and
`committed: true`; idempotent on the client id), `leave_challenge`, `complete_challenge` (from day 30; up to 5
accomplishments and a final reflection), `challenge_summary` (per-day activity from completed tasks, routine
checks and reflections; weekly reviews; milestones). Nothing is stored per day, so a missed day is simply a
day without activity and nothing resets. Daily work uses the existing Today screen and reflections.

## 6. Sharing and referrals

- **Cards are built on the server** from the fields the user ticks (`build_card`): goal title, name and
  numbers are off by default; numbers come from the database, never from the client; free-text lines are the
  user's own words (≤ 200 characters). The app previews exactly that and renders the image on the device
  (Story 1080×1920, Square 1080×1080, Wide 1200×630).
- **Links** (`create_share_link`) store a *snapshot* of the card under a 256-bit random token; nothing points
  back to the goal, so the public page cannot reach any other data. Expiry 1–365 days (default 90), revocable,
  20 live links per user. `get_shared_card` (anon) answers `null` alike for unknown, revoked and expired tokens.
  The web page `/s/<token>` adds per-IP rate limiting, `noindex` and no caching.
- **Referrals:** each profile has a random 10-hex `referral_code`. A sign-up carrying it is attributed once
  (`referrals.referred_id` is the primary key), never to oneself, at most 25 per referrer per 24 h; the first
  paid subscription sets `converted_at`.

## 7. Analytics and admin

- `analytics_events` with a fixed list of event names; `track_event()` accepts only numbers, booleans and
  `[a-z0-9_]` tokens as property values, so goal text, reflections, emails or payment data cannot be stored.
  Server-side events (subscription activated/cancelled, referral sign-up, challenge joined, share link created)
  are written by the database and cannot be sent by clients. 120 events per hour per user/visitor.
- `admin_metrics()` for rows in `public.admins` (add operators by hand). Counts come from application tables;
  MRR is the sum over `active` subscriptions of the amount Stripe last reported (after simple coupons), annual
  divided by 12; trials and past-due are excluded. Web page: `/admin` (404 for everyone else).

## 8. Configuration

| Where | Variable | Purpose |
|---|---|---|
| Edge Functions | `STRIPE_SECRET_KEY` | `sk_test_…` (or `sk_live_…` with `ALLOW_LIVE_BILLING=true`) |
| Edge Functions | `STRIPE_WEBHOOK_SECRET` | `whsec_…` of the webhook endpoint |
| Edge Functions | `APP_URL` | web origin for Stripe return pages, e.g. `https://harada.app` |
| Edge Functions | `ALLOW_LIVE_BILLING` | `true` only in production |
| Edge Functions | `ANTHROPIC_API_KEY` | planning suggestions; unset = feature reports "not available" |
| Edge Functions | `ALLOWED_ORIGINS` | browser origins allowed to call the functions (web build only) |
| Database | `prices.stripe_price_id` | `update prices set stripe_price_id = 'price_…' where id = 'pro_monthly'` (and `pro_annual`) |
| Mobile | `EXPO_PUBLIC_WEB_URL` | web origin for share links and referral links |
| Web | as in `docs/SUPABASE_SETUP.md` | unchanged |

Prices are changed in two places on purpose: create the new Price in Stripe, then point the `prices` row at
it and update its amount. Checkout refuses until both agree.

## 9. Deploy

```bash
npx supabase db push                                   # migrations 20261026120000 … 20261026150000
npx supabase secrets set STRIPE_SECRET_KEY=sk_test_… STRIPE_WEBHOOK_SECRET=whsec_… APP_URL=https://… ANTHROPIC_API_KEY=…
npx supabase functions deploy billing-checkout
npx supabase functions deploy billing-portal
npx supabase functions deploy ai-plan
npx supabase functions deploy stripe-webhook --no-verify-jwt
```

In Stripe (test mode first): create the product "Harada Pro" with a monthly price (7.99 USD) and an annual
price (49.99 USD), set their ids on the `prices` rows, add a webhook endpoint
`https://<project>.supabase.co/functions/v1/stripe-webhook` for `checkout.session.completed`,
`customer.subscription.created|updated|deleted|paused|resumed` and `invoice.paid|payment_failed`, and enable
the customer portal (cancellation at period end, plan switching between the two prices).

Pin `npm:@anthropic-ai/sdk` in `supabase/functions/ai-plan/index.ts` to the version you deploy with.
