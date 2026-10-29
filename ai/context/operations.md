# lemonsqueezy-billing — operating contract (for humans and agents)

This is the standing guide to how this product is deployed and operated.
Instance facts (live URLs, workspace, whether Lemon Squeezy and GitHub
sign-in are connected, the secrets it uses) live in [deployment.md](deployment.md), rendered from
probed reality by the bootstrap's `02-docs` phase; this file is the contract
that stays true between deployments. It is written to give an agent with
repository read access enough context to reason about and operate the product
without any other source.

## What this system is

Lemon Squeezy's Next.js Billing App — GitHub sign-in through Auth.js with
database sessions, plans synced from a Lemon Squeezy store, checkout,
subscriptions kept current by signed webhooks — on Cloudflare Workers, with its Postgres a Supabase project reached through
Cloudflare Hyperdrive, expressed as an Orun component-native desired-state
repo. Seven components:

- **`infra/terraform/supabase`** (`supabase`) — one Supabase project per
  environment. Its apply publishes `SUPABASE_PROJECT_REF`,
  `SUPABASE_DB_PASSWORD` and `SUPABASE_DB_URL` onto the environment's secret
  rung.
- **`infra/terraform/cloudflare-hyperdrive`** (`cloudflare-hyperdrive`) — one
  Hyperdrive config per environment over that database. Its apply publishes
  `WIRING_CLOUDFLARE_HYPERDRIVE` (the config's id and name).
- **`infra/db-migrate`** (`db-migrate`) — applies `packages/db`'s migrations
  to the environment's database through Supabase's Management API. Each
  migration is recorded with its checksum in `_migrations.applied`; only the
  missing ones apply.
- **`packages/db`** (`db`) — the migrations and their runner.
- **`apps/web`** (`web`) — the app: Next.js built by `@opennextjs/cloudflare`
  into one Worker plus Static Assets. It reaches Postgres through its
  `HYPERDRIVE` binding, one client per call (`getDb()`, `src/db/index.ts`).
- **`tests/web`**, **`tests/db`** — vitest suites, verified on the `dev` rung.

Environments: **`stage`** and **`prod`** are deployed; **`dev` is
verify-only by design** — lanes build and test, nothing deploys.

## Identity and tenancy

Every remote operation runs against ONE Orun workspace, declared in
`intent.yaml` under `execution.state.workspace` — committed, enforced, and
what CI uses. Do not remove it; headless credentials depend on it. If it
reads `ws_SET_ME`, the bootstrap had no workspace to write: set the real one
before anything else.

## How deployment works

1. Merge (or push) to `main`.
2. CI (`.github/workflows/ci.yml`) runs `orun plan --changed` — only
   components whose files changed are planned — then runs each planned lane
   with `orun run --remote-state`, authenticated by GitHub OIDC (the
   exchange resolves this repository's linked workspace server-side).
3. Per environment, in this order — each edge `mode: enforced` on a push to
   main, advisory on a pull request (which deploys nothing):
   **`supabase` → `cloudflare-hyperdrive` → `db-migrate` → `web`.** A job
   resolves its secrets when it starts, so each one reads what the apply
   before it published. The app's deploy re-renders `apps/web/wrangler.jsonc`
   from `WIRING_CLOUDFLARE_HYPERDRIVE` before it builds, deploys
   `lemonsqueezy-billing-web-<env>` — pushing first the optional secrets the
   environment has (below) to it as Worker secrets — and smoke-tests it: the
   sign-in page, and
   `/api/health`, which answers 200 only when the database is reachable
   through Hyperdrive and migrated.
4. `prod` deploys after `stage` has converged on the same commit
   (`environments.prod.promotion` in intent.yaml).
5. **The convergence run is the deployment.** A green run means every
   planned lane applied. Failed lanes are retried with
   `gh run rerun --failed`, which resumes the same execution.

Caveats that matter:

- A push that touches no component files plans zero lanes — that run is
  green and deployed nothing. Never treat "latest run green" as "product
  converged"; probe the URLs instead.
- `apps/web/wrangler.jsonc` is committed as the render of
  `wrangler.template.jsonc` from `wiring.fixture.json` (a placeholder
  Hyperdrive id): edit the template and run `pnpm run wire:fixture`. The
  deploy lanes render the real one in their own job tree; never commit a
  real id.
- Every table in `public` has row-level security and no policy. Supabase's
  Data API serves `public` to the anon key, so this is what keeps `account`
  (every user's GitHub OAuth tokens) and `session` (every live session
  token) out of it; the app is unaffected because it connects as `postgres`,
  the tables' owner. Enable RLS on a new table in its migration; never
  `FORCE` it, and never add a policy for `anon` without meaning to publish
  that table.
- A migration is immutable once applied: its checksum is in
  `packages/db/src/manifest.ts` and in the database's ledger. Change the
  schema with a NEW migration in `packages/db/src/migrations`, and the
  matching change in `apps/web/src/db/schema.ts`: `tests/db` fails if the
  two disagree.

## Secrets model

- **Brokered provider secrets**, minted per run from the workspace's
  connections — no long-lived values at rest, nothing to rotate by hand:
  `CLOUDFLARE_API_TOKEN` (Workers deploy), `CLOUDFLARE_HYPERDRIVE_TOKEN`
  (Hyperdrive — the deploy token deliberately cannot touch it),
  `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_ACCESS_TOKEN` (project create and
  migrations) and `SUPABASE_ORG_ID`.
- **Published by the applies** onto the stage and prod rungs:
  `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL`,
  `WIRING_CLOUDFLARE_HYPERDRIVE`.
- **Optional secrets the owner stores**, because no platform brokers Lemon
  Squeezy or GitHub OAuth apps: `LEMONSQUEEZY_API_KEY`,
  `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET`, `AUTH_GITHUB_ID`,
  `AUTH_GITHUB_SECRET` (below) — this repository's Orun secrets, per
  environment. The web deploy resolves the ones that exist (`optionalSecretEnv`:
  a missing one is skipped, not a failure), keeps them out of the build
  (`env -u`) and sets them on the Worker as Worker secrets before it deploys.
  Until they exist the billing page shows sample plans, the dashboard says
  Lemon Squeezy is not connected, the webhook answers 503, and — with no
  GitHub app — the dashboard is open as a preview with no user.
- **Auth.js's key.** `AUTH_SECRET`, when stored as an optional secret, signs
  and encrypts the cookies. Unset, the key is the one the environment's
  database generated for itself (`app_private.secrets`, migration
  `020_app_secrets`) — so a fresh deployment needs no secret set by hand.
  Setting `AUTH_SECRET` rotates it: every existing session ends.
- Inspect by NAME only: `orun secrets list --org <ws> --project` and
  `--env stage|prod`. No tooling in this repository prints a secret value,
  and no document in `ai/context/` may contain one.

## Connect Lemon Squeezy and sign-in

Per environment (`stage`, `prod`):

1. **Lemon Squeezy** (test mode first): a store with one or more
   subscription products; an API key (Settings → API); the store's id
   (Settings → Stores); a webhook secret of your choosing.
2. **GitHub**: an OAuth app whose callback URL is
   `https://lemonsqueezy-billing-web-<env>.your-workers-subdomain.workers.dev/api/auth/callback/github`.
3. Store them, then redeploy the app (a secret reaches the Worker only when
   it deploys):

   ```bash
   orun secrets set LEMONSQUEEZY_API_KEY --env <env>
   orun secrets set LEMONSQUEEZY_STORE_ID --env <env>
   orun secrets set LEMONSQUEEZY_WEBHOOK_SECRET --env <env>
   orun secrets set AUTH_GITHUB_ID --env <env>
   orun secrets set AUTH_GITHUB_SECRET --env <env>
   ```

4. Sign in and press **Setup Webhook** on the dashboard: it registers
   `https://lemonsqueezy-billing-web-<env>.your-workers-subdomain.workers.dev/api/webhook`
   in the store for the subscription events, signed with your secret. The
   billing page syncs the store's plans on its first view.

`/api/health` says, per environment, whether each is connected (by whether
the keys are set; never what they are). Re-running the bootstrap's
`02-docs` phase records the change in [deployment.md](deployment.md).

## Verifying the system

```bash
# the app and its database path on each environment (also recorded, probed, in deployment.md)
curl -s -o /dev/null -w '%{http_code}\n' https://lemonsqueezy-billing-web-stage.your-workers-subdomain.workers.dev/
curl -s https://lemonsqueezy-billing-web-prod.your-workers-subdomain.workers.dev/api/health

# workspace readiness (integrations + repository link)
orun integrations list --org <ws> --json && orun cloud check --org <ws>
```

## Common operations

| task | how |
|---|---|
| deploy a change | merge to `main`; watch the run; failed lanes → `gh run rerun --failed` |
| deploy by hand | Orunbase's Deploy button, or `gh workflow run ci.yml --ref main -f environment=<env> [-f component=<a,b>]` — the named components (blank: every one) run in that environment as a merge runs them; started off `main` it is refused |
| change the schema | change `apps/web/src/db/schema.ts`, and write the same change as a new `packages/db/src/migrations/<nnn>_<name>/up.sql` (idempotent, RLS enabled on a new table) in the manifest (`pnpm --filter @saas/db run manifest:fix` for its checksum), merge — db-migrate applies it before the app deploys. `pnpm test` fails on a table in `public` without row-level security, or on a schema the migrations do not match |
| redeploy without a change | edit the last line of the component's `component.yaml` (`# orun: redeploy <reason> <stamp>`) and merge — it is a deploy trigger, nothing reads it |
| connect Lemon Squeezy or sign-in | above |
| rotate Auth.js's key | `orun secrets set AUTH_SECRET --env <env>` (32+ random bytes), then redeploy the app; every session ends |
| serve a custom domain | attach it to the Worker in Cloudflare (README, "Custom domain"), change `APP_URL` in `apps/web/wrangler.template.jsonc` (checkouts return to it, the webhook is registered under it), add its callback URL to the GitHub OAuth app, and replace the placeholder `lemonsqueezy-billing.example.com` in `intent.yaml`'s `BASE_DOMAIN` with it (a record; nothing builds a URL from it) |
| headless credentials | `ORUN_TOKEN` (workspace-scoped) + `GITHUB_TOKEN` |

The deployment record is the bootstrap's `02-docs` phase. Re-running it (the
Orun console's Retry on that phase, or `orun new … --phase 02-docs`)
re-probes the URLs and re-renders [deployment.md](deployment.md); it is
idempotent.

## Evolution

Structural changes (a second Worker, a queue, another data store) follow the
same contract that deployed the product: add a component under `apps/`,
`infra/` or `packages/` with a `component.yaml` — declaring `dependsOn` on
any infrastructure whose published secrets it reads, enforced on main — land
it as a pull request, and the convergence run applies it.
