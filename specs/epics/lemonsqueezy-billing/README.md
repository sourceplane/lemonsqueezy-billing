# Epic: lemonsqueezy-billing (LS)

**Lemon Squeezy's Next.js Billing App is a billing portal over a Lemon Squeezy store: GitHub sign-in through Auth.js, the store's subscription plans synced into Postgres, checkout in Lemon.js's overlay, subscriptions kept current by signed webhooks, and the customer's own controls — pause, resume, cancel, change plan, update the payment method. Upstream runs it on Vercel with Neon. The port keeps the template's code, runs it on Cloudflare Workers through OpenNext with a Supabase project's Postgres behind Hyperdrive, turns `drizzle-kit push` into db-migrate migrations, and makes every third party optional: a fresh deployment shows sample plans and says what to connect.**

The port keeps the sign-in page, the dashboard and its webhook setup, the
billing page with its plans and subscriptions, the change-plans page, the
server actions, the webhook route and its processing, and the Wedges
components. It adds the unconnected mode (sample plans, the dashboard as a
preview until sign-in is connected, notices naming the secrets to store), the
generated Auth.js key, a read-only health route, the Workers build, the
monorepo wrapper, tests, the two Terraform roots, the migrations and the
deploy contract.

## Status

| Field | Value |
|-------|-------|
| Status | In progress — LS0 (this doc set) |
| Cluster | **LS** (LS0–LS4) |
| Owner(s) | `apps/web` · `tests/web` · `infra/terraform/{supabase,cloudflare-hyperdrive}` · `packages/db` + `infra/db-migrate` · `tests/db` |
| Forked from | `subscription-payments` (the billing row: optional payment provider, sample plans, the not-connected webhook); its data path from `saas-starter` (Hyperdrive, a Drizzle client per call, the generated app secret, the e2e's Hyperdrive lane), because this template queries Postgres through Drizzle |
| Upstream | [lmsqueezy/nextjs-billing](https://github.com/lmsqueezy/nextjs-billing) (MIT © 2023 Lemon Squeezy, LLC) |
| Changes | Next.js 16 and the Workers build, Hyperdrive in place of Neon, migrations in place of `drizzle-kit push`, WebCrypto for the webhook signature, the unconnected mode, the generated Auth.js key, the health route, tests, the Terraform roots and the deploy contract |
| Gate | LS1 is the first user-visible rung. LS2's roots apply only with a linked workspace; verified by `terraform validate`. |

## Read order

1. `design.md` — what maps to what, the wiring flow, what is out of scope
2. `implementation-plan.md` — the milestones and what "done" means for each
3. `risks-and-open-questions.md` — what could go wrong and what was decided
4. `IMPLEMENTATION-STATUS.md` — what actually shipped (kept distinct from intent)

## Milestones at a glance

| Milestone | What it lands | Done when |
|---|---|---|
| LS0 — the spec | intent, CI, tooling, the spec index, this doc set and the task contracts | merged on `main` |
| LS1 — the billing portal on Workers | `apps/web`, the rendered wrangler config, `tests/web` | `wrangler dev` serves every page unconnected, and with fake keys signs a database session in |
| LS2 — Supabase and Hyperdrive from Terraform, the schema through db-migrate | `infra/terraform/{supabase,cloudflare-hyperdrive}`, `packages/db`, `infra/db-migrate`, `tests/db` | the roots validate; the migrations apply and match the schema; the plan orders roots → migrations → Worker |
| LS3 — ready to instantiate | README, as-built status | a reader can run, test, preview, deploy and connect it |
| LS4 — an Orun baseline | card, build document, rename, bootstrap tooling, tests | a new billing portal goes from nothing to live in one landing; Baseline CI green |
