# lemonsqueezy-billing

Lemon Squeezy's [Next.js Billing App](https://github.com/lmsqueezy/nextjs-billing)
— GitHub sign-in through Auth.js with database sessions, plans synced from a
Lemon Squeezy store, checkout in Lemon.js's overlay, subscriptions kept
current by signed webhooks and paused, resumed, cancelled or changed from the
dashboard, Drizzle over Postgres — running on **Cloudflare Workers + Static
Assets** through [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare),
with its Postgres a **Supabase** project's database reached through
**Cloudflare Hyperdrive**, both provisioned by Terraform through
[Orun](https://github.com/sourceplane/orun) and the schema applied by Orun's
`db-migrate`, and packaged as an **Orun baseline**: one command takes a new
billing portal from nothing to live on stage and prod, in its own repository,
under its own name, in ONE landing.

The template's code is the code. What the port changes is what the Workers
runtime and a fresh, unattended deployment force: the database client is
built per call over the Hyperdrive binding (`src/db/index.ts`) instead of a
module-level Neon client, Auth.js is configured per request, the webhook's
signature is checked with WebCrypto, the schema is migrations instead of
`drizzle-kit push`, and nothing has to be connected for the app to deploy —
without Lemon Squeezy's keys the billing page shows sample plans and says
what to connect, without a GitHub OAuth app the dashboard is open as a
preview, and Auth.js's key defaults to one the database generates for
itself. What the baseline adds is everything needed to make a copy of it
somebody else's. See [`specs/epics/lemonsqueezy-billing`](specs/epics/lemonsqueezy-billing/README.md)
for the design, the milestones and the as-built status, including every
departure.

## Instantiating a product

```bash
git clone --depth 1 --branch <baseline-tag> https://github.com/sourceplane/lemonsqueezy-billing
cd lemonsqueezy-billing
orun new --blueprint repo-blueprint.yaml --out ~/products/acme-billing --run-hooks --resume \
  --set reponame=acme-billing --set productname="Acme Billing" \
  --set githuborg=acme-inc --set subdomain=<workers-dev-subdomain>
```

Or, once the platform's registry lists it, from the Orun console (Baselines →
`lemonsqueezy-billing` → Build). Two phases: **`01-product`** creates the
repository, mints the five brokered credentials (Cloudflare and Supabase) and
lands the whole product as one pull request, whose convergence on `main`
provisions and deploys it per environment in a fixed order —

```
supabase ──▶ cloudflare-hyperdrive ──▶ db-migrate ──▶ web
```

— each edge `mode: enforced` on a push to main and advisory on a pull
request; then **`02-docs`** records the live deployment from probed facts.
**[BOOTSTRAP.md](BOOTSTRAP.md)** is the operator guide;
[docs/phases/](docs/phases/README.md) has a page per phase.

The new repository receives the **product only** — the app, the Terraform
roots, the migrations, the tests, its CI, its tooling, a README of its own
and its operating contract — renamed throughout to the product's name,
repository, Worker, Supabase project and Hyperdrive config. None of this
repository's machinery ships. **Lemon Squeezy and the GitHub OAuth app are
the owner's to connect afterwards**, as the product's optional Orun secrets
(its README, "Connect Lemon Squeezy" and "Connect sign-in"): no platform
brokers them, so the card asks for neither.

| What makes it a baseline | Where |
|---|---|
| The console card (inputs, secrets, programme) | `blueprint.yaml` |
| The build document (modules, phases, hooks) | `repo-blueprint.yaml` |
| This tree's identity, the product's README and the bootstrap's task contracts | `.baseline/` |
| The rename engine (product-name seam: `apps/web/src/lib/site.ts`) | `tooling/rebrand/rebrand.mjs` |
| The bootstrap's helpers (deferrals, redeploy marker, work-tree strip) | `tooling/bootstrap/` |
| The deployment-record renderer | `hooks/render-deployment-docs.sh` |
| The product's context pack | `ai/context/` |
| The baseline's tests: contract, leak, offline bootstrap and plans, end to end | `testing/`, `.github/workflows/baseline.yml` |
| Cutting a `baseline-vN` tag | `.github/workflows/tag.yml` |

## What is here (the product)

| Surface | Where |
|---|---|
| The product's name | `apps/web/src/lib/site.ts` |
| The sign-in page, the dashboard, billing and plan changes | `apps/web/src/app`, `apps/web/src/components` |
| The server actions — checkout, webhook setup, plan sync, cancel, pause, resume, change plan | `apps/web/src/app/actions.ts` |
| The webhook: signature, storage, processing | `apps/web/src/app/api/webhook/route.ts`, `src/lib/signature.ts`, `src/lib/webhook.ts` |
| Auth.js, its key, the proxy | `apps/web/src/auth.ts`, `src/lib/auth-secret.ts`, `src/lib/authorized.ts`, `src/proxy.ts` |
| What is connected, and the sample plans until it is | `apps/web/src/lib/connections.ts`, `src/lib/sample-plans.ts` |
| Drizzle schema and the per-call client | `apps/web/src/db` (`getDb()`) |
| Workers build and deploy contract | `apps/web/next.config.ts`, `open-next.config.ts`, `wrangler.template.jsonc` → `wrangler.jsonc` (committed), `component.yaml` |
| The schema as migrations, and Lumen's runner | `packages/db` (`@saas/db`) |
| The Supabase project, the Hyperdrive config, the migration step | `infra/terraform/supabase`, `infra/terraform/cloudflare-hyperdrive`, `infra/db-migrate` |
| Tests | `tests/web`, `tests/db` (vitest) |

## Getting started

```bash
pnpm install
pnpm run wire:fixture   # re-render apps/web/wrangler.jsonc from its template (committed; this changes nothing)
pnpm typecheck
pnpm lint
pnpm test
pnpm build              # next build + opennextjs-cloudflare build → apps/web/.open-next
```

The build needs no database, no Lemon Squeezy store and no OAuth app.

**Running it locally.** A Postgres on `localhost:54322` (`supabase start`),
the migrations applied in order, then Next's dev server or the built Worker:

```bash
export POSTGRES_URL=postgres://postgres:postgres@localhost:54322/postgres
for f in packages/db/src/migrations/*/up.sql; do psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -q -f "$f" || break; done
pnpm --filter @app/web dev                  # http://localhost:3000, or:
pnpm build && pnpm --filter @app/web preview   # the Worker under wrangler dev, http://localhost:8787
```

Copy `apps/web/.dev.vars.example` to `apps/web/.dev.vars` for Lemon
Squeezy's keys, a GitHub OAuth app and a `WEBHOOK_URL` tunnel; every key is
optional, and without them the app runs unconnected.

**Connecting Lemon Squeezy and sign-in.** In a deployed product they are
the product's own Orun secrets, per environment — `LEMONSQUEEZY_API_KEY`,
`LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET`, `AUTH_GITHUB_ID`,
`AUTH_GITHUB_SECRET` (`orun secrets set <KEY> --env <env>`) — which the next
deploy hands to the Worker; then **Setup Webhook** on the dashboard
registers the store's webhook. The product's README
(`.baseline/product/README.md`, which is what a product built from here
carries) has the steps in full.

## How it maps to Vercel and Neon

| Upstream (Vercel + Neon) | Here |
|---|---|
| Next.js 14 hosting, `middleware.ts` | One Cloudflare Worker (`.open-next/worker.js`) + Static Assets on Next.js 16; the middleware is `proxy.ts` (Next 16's name) and runs in the Worker |
| Neon serverless Postgres, `neon(POSTGRES_URL)` + `drizzle-orm/neon-http` at module scope | The Supabase project's Postgres through Hyperdrive: `getDb()` builds a `postgres` client + Drizzle per call from `env.HYPERDRIVE.connectionString`; `POSTGRES_URL` is for local scripts |
| `drizzle-kit push` from a laptop | `infra/db-migrate` applies `packages/db/src/migrations` (the same tables, as SQL; `tests/db` holds them to the Drizzle schema) through Supabase's Management API per environment, after the project and the Hyperdrive config exist, before the Worker deploys |
| `AUTH_SECRET` from `openssl rand` | Optional: unset, Auth.js's key is the one the environment's database generated (`app_private.secrets`) |
| `AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `WEBHOOK_URL` in `.env` | `APP_URL`, a var in `wrangler.jsonc` per environment (the Worker's workers.dev origin); `WEBHOOK_URL` still overrides for a tunnel |
| `LEMONSQUEEZY_*`, `AUTH_GITHUB_*` in the project's env vars, all required | Optional Orun secrets, pushed to the Worker as secrets by the deploy; until they exist the app says what to connect — sample plans, the dashboard as a preview, the webhook a 503 |
| `node:crypto` HMAC for the webhook signature | WebCrypto (`src/lib/signature.ts`) |
| A database created by hand | `infra/terraform/supabase` (one project per environment) + `infra/terraform/cloudflare-hyperdrive` (one config per environment), ids and credentials as orun secrets |
| "Clone this repo" | `orun new --blueprint repo-blueprint.yaml` — a new repository, branded, provisioned, deployed |

## CI

| Workflow | What it runs | Ships to a product |
|---|---|---|
| `ci.yml` | the Orun pipeline, and the only workflow a product carries: `orun plan --changed`, then one job per lane. A pull request runs the verify lanes (the app built and dry-deployed per environment, both Terraform roots checked and planned, the migrations planned), except the bootstrap's own landings (`orun/BASE-*`), where `plan` alone runs and nothing waits for it — the landing was checked in the build box; a merge applies, migrates and deploys stage → prod. It plans nothing while `intent.yaml` names the placeholder workspace `ws_CHANGE_ME`, as this repository does. A manual run (Orunbase's Deploy button, or Run workflow on `main`) plans the environment and components it names under the push-to-main trigger, so they deploy as a merge deploys them | yes |
| `baseline.yml` | the baseline's own tiers: contract tests and generated component docs; the blueprint read by the pinned orun, the leak gate, the offline bootstrap and the product's own plans; the product built, migrated into a local Postgres, dry-deployed and served — unconnected, then with fake keys | no |
| `tag.yml` | cuts a `baseline-vN` tag (manual) | no |

## Licence

The app is Lemon Squeezy's Next.js Billing App, MIT © 2023 Lemon Squeezy, LLC
— `apps/web/LICENSE`, kept with the code it covers.
