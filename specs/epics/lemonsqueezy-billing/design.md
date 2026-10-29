# Design — lemonsqueezy-billing

## What the template is

[lmsqueezy/nextjs-billing](https://github.com/lmsqueezy/nextjs-billing): a
Next.js 14 App Router app, written by Lemon Squeezy as the base of a
subscription SaaS, over:

- **Auth.js v5** with the GitHub provider and the Drizzle adapter —
  `user`, `account`, `session`, `verificationToken` — and database sessions;
  a middleware runs its `authorized` callback, which guards `/dashboard` and
  sends a signed-in visitor from the sign-in page to it;
- **Lemon Squeezy** through `@lemonsqueezy/lemonsqueezy.js`: server actions
  that sync the store's subscription variants into `plan`, create a checkout
  (opened in Lemon.js's overlay), set up the store's webhook, and cancel,
  pause, resume or change a subscription; a webhook route that checks the
  `X-Signature` HMAC, stores the event in `webhookEvent` and upserts
  `subscription`;
- **Drizzle** over Neon's HTTP driver, the tables created with
  `drizzle-kit push`;
- **Wedges**, Lemon Squeezy's component library, on Tailwind 3.

The pages: `/` (sign in), `/dashboard` (the webhook setup), `/dashboard/billing`
(subscriptions and plans), `/dashboard/billing/change-plans/[id]`.

## How it maps

| Upstream | Here |
|---|---|
| Next.js 14.2, `middleware.ts` | Next.js 16.4.3 on `@opennextjs/cloudflare` 1.20.13 (its peer needs ≥ 16.4.1), one Worker + Static Assets; the middleware is `src/proxy.ts`, the same `auth` export |
| `neon(POSTGRES_URL)` + `drizzle-orm/neon-http`, a module-level `db` | `getDb()` (`src/db/index.ts`): `postgres-js` + Drizzle over the `HYPERDRIVE` binding's connection string, a client per call (`max: 5`, no prepared statements); `POSTGRES_URL` for scripts and tests |
| `NextAuth({...})`, one config at module load | `NextAuth(async () => ({...}))`: per request, so its adapter gets that request's client and its `secret` the environment's key |
| `drizzle-kit push` | `packages/db` migrations — `010_billing_schema` (the tables, as drizzle-kit would generate them, idempotent), `020_app_secrets`, `030_row_level_security` — applied by `infra/db-migrate`; `tests/db` holds the migrated tables to `src/db/schema.ts` |
| `AUTH_SECRET` from `openssl rand` | the key `020_app_secrets` generates in `app_private.secrets`; an `AUTH_SECRET` secret wins |
| `AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `WEBHOOK_URL` | `APP_URL`, a per-environment var in `wrangler.jsonc` (the Worker's workers.dev origin): the checkout's return URL, the webhook's base, the cookies' `__Secure-` decision; `WEBHOOK_URL` still overrides |
| Every `LEMONSQUEEZY_*` and `AUTH_GITHUB_*` required, the app throwing without them | optional Orun secrets (`optionalSecretEnv`) the deploy pushes to the Worker; `src/lib/connections.ts` says what is connected and every page asks it |
| `node:crypto` `createHmac` + `timingSafeEqual` | WebCrypto HMAC-SHA256 with a constant-time compare (`src/lib/signature.ts`) |
| `crypto.randomInt` for the event id | `crypto.getRandomValues`, the same range |
| `revalidatePath` in reads a page calls while rendering | dropped from those reads (Next.js 15+ refuses it during a render); kept in the actions |
| `params: { id }` | `params: Promise<{ id }>` (Next.js 15+) |

## The unconnected mode

A product is deployed by a convergence nobody attends, before its owner has a
Lemon Squeezy store or an OAuth app. So nothing may fail on them:

- **No GitHub OAuth app** (`AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`): Auth.js
  has no provider; the sign-in page names the two secrets and the callback
  URL, and its button is disabled. Nobody can sign in, so the dashboard is a
  **preview** anyone may open (`src/lib/authorized.ts`): it has no user and
  so no one's data, and every action that changes something requires a
  session.
- **No Lemon Squeezy** (any of `LEMONSQUEEZY_API_KEY`, `_STORE_ID`,
  `_WEBHOOK_SECRET`): the SDK is never set up
  (`LemonSqueezyNotConnectedError`); the dashboard names the missing keys and
  the webhook URL; the billing page shows two sample plans with their
  sign-up buttons disabled; `/api/webhook` answers 503 and stores nothing.
  With the webhook secret but not the API key, a signed event is stored and
  recorded as not processed for that reason.
- `/api/health` says which of the two is connected (booleans, never values),
  which the `02-docs` record reads.

## The wiring flow

```
infra/terraform/supabase ─apply─► SUPABASE_PROJECT_REF, _DB_PASSWORD, _DB_URL ─┬─► infra/terraform/cloudflare-hyperdrive ─apply─► WIRING_CLOUDFLARE_HYPERDRIVE ─┐
                                                                               └─► infra/db-migrate (apply: the migrations) ──────────────────────────────────┴─► apps/web (build: wrangler.jsonc with the id) → deploy
```

Each reader `dependsOn` its publishers with `mode: enforced` on a push to
main and advisory on a pull request; db-migrate also waits on the
Hyperdrive root, so a migration — the one step a re-run cannot take back —
runs only once everything else the Worker needs exists.

## Out of scope

- **A live Lemon Squeezy store and a GitHub OAuth app.** The owner's to
  connect; neither can be stood in for here (the SDK's API origin is fixed).
- **License keys, orders and usage records.** Upstream stubs their webhook
  branches; so does the port.
- **Custom domains**: the Worker goes live on workers.dev.
