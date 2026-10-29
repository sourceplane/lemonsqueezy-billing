# Implementation status — lemonsqueezy-billing

| Milestone | Status | Shipped in |
|---|---|---|
| LS0 — the spec | ✅ Shipped | [#1](https://github.com/sourceplane/lemonsqueezy-billing/pull/1) |
| LS1 — the billing portal on Workers | ✅ Shipped | [#2](https://github.com/sourceplane/lemonsqueezy-billing/pull/2) |
| LS2 — Supabase and Hyperdrive from Terraform, the schema through db-migrate | ✅ Shipped | [#3](https://github.com/sourceplane/lemonsqueezy-billing/pull/3) |
| LS3 — ready to instantiate | ✅ Shipped | [#4](https://github.com/sourceplane/lemonsqueezy-billing/pull/4) |
| LS4 — an Orun baseline | ✅ Shipped, tagged `baseline-v1` | [#5](https://github.com/sourceplane/lemonsqueezy-billing/pull/5) |

## Lineage

Forked from the **subscription-payments** row (a billing portal whose payment
provider is optional: sample plans until it is connected, a webhook that says
it is not). Its data path is **saas-starter**'s instead — the `supabase` and
`cloudflare-hyperdrive` roots, `getDb()` per call over the `HYPERDRIVE`
binding, the `020_app_secrets` and `030_row_level_security` migrations, the
e2e's Hyperdrive lane — because this template queries Postgres through
Drizzle, where subscription-payments talks to Supabase through supabase-js.
The shared machinery (rename, bootstrap tooling, contract tests, `ci.yml`) is
byte-identical in both.

## Versions

Next.js 16.4.3, React 19.2.4, `@opennextjs/cloudflare` 1.20.13 (its peer
needs Next ≥ 16.4.1), wrangler 4, `next-auth` 5.0.0-beta.32 and
`@auth/drizzle-adapter` 1.11.3 (both on `@auth/core` 0.41.3),
`drizzle-orm` 0.43.1, `postgres` 3.4, `@lemonsqueezy/lemonsqueezy.js` 3.3.1,
`@lemonsqueezy/wedges` 1.4.0 (a React 18 peer; risk LS-D), Tailwind 3.4.

## What is proven, and how

| Claim | Proven by |
|---|---|
| The app builds into one Worker + Static Assets with no database, no store and no OAuth app | `pnpm build` (`next build` + `opennextjs-cloudflare build`) |
| The webhook signature agrees with upstream's `node:crypto` check, and refuses a changed body, another secret, no signature and malformed hex | `tests/web` (signature) |
| The webhook route: 503 and nothing stored without the secret; 400 unsigned, wrongly signed or not an event; stored then processed when signed | `tests/web` (webhook-route) |
| Upstream's processing on a real migrated Postgres: an event stored under a random id in upstream's range, `subscription_created` creating the user's subscription priced by Lemon Squeezy (mocked), `subscription_updated` updating it in place, an unknown plan recorded, a missing API key recorded | `tests/web` (webhook-processing, PGlite + Drizzle) |
| What is connected, the SDK never set up without its keys, the sample plans never mistaken for synced ones; the `authorized` rule, the preview included; Auth.js's key; `/api/health` | `tests/web` |
| The migrated tables match `src/db/schema.ts` column for column (types, nullability, primary keys); every public table has RLS and no policy; the Data API's roles read and write nothing | `tests/db` |
| A bootstrap places the product only, renamed throughout (Lemon Squeezy's own names and the upstream link kept), and its own plan orders roots → migrations → Worker per environment | `testing/leak.test.sh`, `testing/placement.test.sh` |
| The bootstrapped product installs, typechecks, lints, tests and builds at its landing; its db-migrate lane applies every migration to a local Postgres with Supabase's roles through a stand-in Management API, then applies nothing; its stage web lane builds with the stage document's Hyperdrive id and dry-deploys | `testing/e2e.test.sh` |
| Served by `wrangler dev` with no secret: the component's own smoke; the sign-in page under the product's name naming the GitHub secrets and the callback URL, its button disabled; the dashboard's preview naming Lemon Squeezy's keys and the webhook URL; the sample plans, their buttons disabled; `/api/health`; the webhook's 503 | `testing/e2e.test.sh` |
| …and with fake GitHub and webhook keys: the dashboard guarded; sign-in → GitHub's authorize page with this deployment's callback; a database session → the dashboard with the user's subscription read through Hyperdrive; three refused webhooks and one stored, the missing API key recorded; then the Data API's roles reading none of the OAuth tokens or sessions | `testing/e2e.test.sh` |
| The applies, the migrations and the deploy on a real account; a GitHub OAuth round trip; a Lemon Squeezy checkout and its webhook | only a live, connected product (risks LS-M, LS-N) |

## Departures from the upstream template

1. **Next.js 16.4.3 on OpenNext** (upstream: Next.js 14.2 on Vercel). `middleware.ts` is `src/proxy.ts`, the same `auth` export and matcher; `params` is awaited (Next 15+); `revalidatePath` is dropped from `hasWebhook`, `syncPlans`, `getUserSubscriptions` and `getSubscriptionURLs`, which pages call while rendering and Next 15+ refuses there, and kept in the actions.
2. **The database client is per call** (`src/db/index.ts`, `getDb()`), `postgres-js` over the `HYPERDRIVE` binding, in place of a module-level Neon HTTP client. Auth.js is configured per request (`NextAuth(async () => …)`) so its adapter uses that request's client. Risk LS-A.
3. **The schema is migrations** (`packages/db`: `010_billing_schema`, `020_app_secrets`, `030_row_level_security`) applied by db-migrate, in place of `drizzle-kit push`; drizzle-kit and `drizzle.config.ts` are dropped. `src/db/schema.ts` is upstream's, its connection code moved to `index.ts`.
4. **Every third party is optional.** Lemon Squeezy's keys and the GitHub OAuth app are optional Orun secrets the deploy pushes to the Worker; `src/lib/connections.ts` says what is connected. Unconnected: the sign-in page names the GitHub secrets and the callback URL and disables its button; the dashboard is a preview anyone may open (`src/lib/authorized.ts`, risk LS-B) and names Lemon Squeezy's keys and the webhook URL instead of offering the webhook setup; the billing page shows two sample plans (`src/lib/sample-plans.ts`) with disabled buttons; `/api/webhook` answers 503 (upstream: 500); subscription actions are hidden. `setupWebhook` requires a session.
5. **The webhook signature is WebCrypto's** HMAC-SHA256 with a constant-time compare (`src/lib/signature.ts`), and the event id `crypto.getRandomValues` in `crypto.randomInt`'s range. `storeWebhookEvent`'s conflict target is the event's own id (upstream named `plans.id`, a column of another table). `processWebhookEvent` records a missing API key on the stored event instead of throwing.
6. **Auth.js's key** is `AUTH_SECRET` or the one `020_app_secrets` generated (`src/lib/auth-secret.ts`); `trustHost` is on and `useSecureCookies` follows `APP_URL` (risk LS-C).
7. **`APP_URL`**, a per-environment var in `wrangler.jsonc`, replaces `NEXT_PUBLIC_APP_URL` and defaults the webhook's base (upstream's `WEBHOOK_URL` still overrides).
8. **`/api/health`** reads the database through Hyperdrive and writes nothing — the deploy's smoke — and says which third parties are connected.
9. **The product's name** (`src/lib/site.ts`, upstream's "Lemon Stand") titles the pages and the checkout's thank-you note; the layouts' titles use it instead of "Lemon Squeezy Next.js Billing App Template".
10. **ESLint 9 flat config** (`eslint-config-next` 16) with the rules that flag upstream's code as written turned off (`react/display-name`, `react/no-unescaped-entities`, unused expressions, unused-disable reporting); upstream's Prettier and typescript-eslint strict configs are dropped.
11. **Two Terraform roots** — saas-starter's `supabase` and `cloudflare-hyperdrive` — and the `db-migrate` component, in place of a Neon database made by hand.
