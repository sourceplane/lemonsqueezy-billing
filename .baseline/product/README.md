# lemonsqueezy-billing

Lemon Squeezy's [Next.js Billing App](https://github.com/lmsqueezy/nextjs-billing)
— GitHub sign-in through Auth.js, plans synced from a Lemon Squeezy store,
checkout in Lemon.js's overlay, subscriptions kept current by signed webhooks
and paused, resumed, cancelled or changed from the dashboard, Drizzle over
Postgres — on **Cloudflare Workers + Static Assets** through
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare), with its
Postgres a **Supabase** project's database reached through **Cloudflare
Hyperdrive**. Terraform provisions both per environment and Orun's
`db-migrate` applies the schema, all on every merge to `main`.

## Live deployment

<!-- 02-docs:begin -->
Not recorded yet. The bootstrap's last phase writes the live URLs, the
workspace, whether Lemon Squeezy and sign-in are connected and the secrets the
product uses into [ai/context/deployment.md](ai/context/deployment.md); how the
product deploys and how to operate it is in
[ai/context/operations.md](ai/context/operations.md).
<!-- 02-docs:end -->

## What is here

| Surface | Where |
|---|---|
| The product's name | `apps/web/src/lib/site.ts` |
| The sign-in page, the dashboard, billing and plan changes | `apps/web/src/app`, `apps/web/src/components` |
| The server actions (checkout, webhook setup, plan sync, cancel, pause, resume, change plan) | `apps/web/src/app/actions.ts` |
| Lemon Squeezy's webhook: the signature check, storage and processing | `apps/web/src/app/api/webhook/route.ts`, `apps/web/src/lib/signature.ts`, `apps/web/src/lib/webhook.ts` |
| Auth.js (GitHub, database sessions), its key, the proxy that guards `/dashboard` | `apps/web/src/auth.ts`, `apps/web/src/lib/auth-secret.ts`, `apps/web/src/proxy.ts` |
| What is connected, and what the app shows until it is | `apps/web/src/lib/connections.ts`, `apps/web/src/lib/sample-plans.ts` |
| Drizzle schema and the per-request client | `apps/web/src/db` (`getDb()`) |
| The database check the deploy smoke-tests | `apps/web/src/app/api/health/route.ts` |
| Workers build and deploy contract | `apps/web/next.config.ts`, `open-next.config.ts`, `wrangler.template.jsonc` → `wrangler.jsonc`, `component.yaml` |
| The schema as migrations, and their runner | `packages/db` (`@saas/db`) |
| The Supabase project, the Hyperdrive config, the migration step | `infra/terraform/supabase`, `infra/terraform/cloudflare-hyperdrive`, `infra/db-migrate` |
| Tests | `tests/web`, `tests/db` (vitest) |

## Getting started

```bash
pnpm install
pnpm run wire:fixture   # re-render apps/web/wrangler.jsonc from its template (it is committed)
pnpm typecheck
pnpm lint
pnpm test
pnpm build              # next build + opennextjs-cloudflare build → apps/web/.open-next
```

The build needs no database, no Lemon Squeezy store and no GitHub OAuth app:
nothing pre-renders against any of them.

## Running it locally

You need a Postgres on `localhost:54322` — the Supabase CLI's default
(`supabase start`) — or any Postgres whose URL you put in `POSTGRES_URL`.

1. **Schema.** The migrations CI applies are plain, idempotent SQL; apply
   them in order:

   ```bash
   export POSTGRES_URL=postgres://postgres:postgres@localhost:54322/postgres
   for f in packages/db/src/migrations/*/up.sql; do psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -q -f "$f" || break; done
   ```

2. **Secrets.** Copy `apps/web/.dev.vars.example` to `apps/web/.dev.vars`.
   Every key is optional: without them the app runs unconnected (below).

3. **Run.** Either Next's dev server, which gets the Worker's bindings
   through `getCloudflareContext()` (the `HYPERDRIVE` binding points at
   `localhost:54322` through `wrangler.jsonc`'s `localConnectionString`):

   ```bash
   pnpm --filter @app/web dev          # http://localhost:3000
   ```

   or the built Worker under `wrangler dev`:

   ```bash
   pnpm build
   pnpm --filter @app/web preview      # http://localhost:8787
   ```

4. **Webhooks.** Lemon Squeezy must reach the app to deliver them: point
   `WEBHOOK_URL` in `.dev.vars` at a tunnel to it (`ngrok http 3000`, say),
   then press **Setup Webhook** on the dashboard, which registers
   `<WEBHOOK_URL>/api/webhook` in your store (test mode).

## Connect Lemon Squeezy

Lemon Squeezy is a third party no platform brokers, so the product deploys
without it: the billing page shows two **sample plans** with their sign-up
buttons disabled, the dashboard says **"Lemon Squeezy is not connected"** and
names the keys it needs, and `/api/webhook` answers 503. To start selling, per
environment:

1. **In Lemon Squeezy** (test mode first): create a store, and in it one or
   more subscription products. Then Settings → API → a new API key, and note
   the store's id (Settings → Stores). Choose a webhook secret: any string.
2. **Give the app its keys.** They are this repository's Orun secrets, and
   stage and prod can each use their own:

   ```bash
   orun secrets set LEMONSQUEEZY_API_KEY --env stage          # prompts for the value
   orun secrets set LEMONSQUEEZY_STORE_ID --env stage
   orun secrets set LEMONSQUEEZY_WEBHOOK_SECRET --env stage
   ```

   The build never sees them; the deploy hands them to the Worker as Worker
   secrets (`wrangler secret bulk`), so they are in no bundle, no build cache
   and no log.
3. **Redeploy the app**: a secret reaches the Worker when the app deploys,
   and setting one deploys nothing. Use **Deploy by hand** below, or change
   the stamp on the last line of `apps/web/component.yaml`
   (`# orun: redeploy …`) and merge.
4. **Register the webhook**: sign in, open the dashboard and press **Setup
   Webhook**. It creates the store's webhook at
   `https://lemonsqueezy-billing-web-<env>.your-workers-subdomain.workers.dev/api/webhook`
   for `subscription_created`, `subscription_updated` and
   `subscription_expired`, signed with your secret. The billing page then
   lists the store's subscription products (synced on first view).

Test checkout with card `4242 4242 4242 4242`, any future date, any CVC.

## Connect sign-in

Until a GitHub OAuth app is connected nobody can sign in, so the dashboard is
open as a **preview**: it has no user, shows no one's data and changes
nothing (every action that would needs a session). The sign-in page says what
to connect. To turn sign-in on, per environment:

1. **Create an OAuth app** — GitHub → Settings → Developer settings → OAuth
   Apps → New. Its **callback URL** is the app's own:
   `https://lemonsqueezy-billing-web-<env>.your-workers-subdomain.workers.dev/api/auth/callback/github`
   (or your domain's). One app per environment, or one app per callback.
2. **Give the app its keys**:

   ```bash
   orun secrets set AUTH_GITHUB_ID --env stage       # the OAuth app's client id
   orun secrets set AUTH_GITHUB_SECRET --env stage   # one of its client secrets
   ```

   Both are needed: with one of the pair, sign-in stays off.
3. **Redeploy the app**, as above. From that deploy on, **Sign in with
   GitHub** works and the dashboard needs a session again.

Auth.js signs its cookies with a key you do not have to set: unless you
store an `AUTH_SECRET` Orun secret, it is the one the environment's database
generated for itself when the migrations first ran (`app_private.secrets`).
Setting `AUTH_SECRET` rotates it (every existing session ends).

## How it deploys

Merges to `main` converge through [Orun](https://github.com/sourceplane/orun):
`.github/workflows/ci.yml` plans the changed components and runs each lane
against the workspace in `intent.yaml`. Per environment the order is
enforced — **the Supabase project, then the Hyperdrive config over its
database, then the migrations, then the Worker** — because each reads what
the one before it published: the project's ref and password, the Hyperdrive
id the Worker binds, the schema the app queries. `stage` deploys first and
`prod` once stage has converged on the same commit; `dev` only verifies.
Every deploy is smoke-tested over HTTP, `/api/health` included, which
answers only when the Worker reaches a migrated database.

The pipeline holds one credential, GitHub's own `GITHUB_TOKEN`. The
Cloudflare tokens and account id and the Supabase access token and org id
are brokered per run from the workspace's connections; the Supabase
project's credentials and the Hyperdrive id are published by the Terraform
applies as orun secrets; Lemon Squeezy's keys and the GitHub OAuth app are
the product's own optional Orun secrets (above). Nothing provider-shaped is
stored in the repository or in GitHub.

**Deploy by hand.** Orunbase's **Deploy** button on a component, or **Run
workflow** on the CI workflow in GitHub's Actions tab (on `main`), runs
`ci.yml` for the environment and components you pick, and each one deploys
exactly as a merge would deploy it. Leave the component blank to redeploy
every component in that environment, with nothing changed: after storing a
secret, say. A component with nothing to run in that environment (a test
suite in `prod`) is left out with a notice.

## Custom domain

The app answers on workers.dev from its first deploy. To serve it on your
own domain, attach the domain to the Worker in Cloudflare (Workers & Pages →
`lemonsqueezy-billing-web-prod` → Settings → Domains & Routes), then set `APP_URL`
in `apps/web/wrangler.template.jsonc` to it — Lemon Squeezy's checkout sends
the browser back there, the dashboard registers the webhook under it, and
the cookies' `__Secure-` prefix follows its scheme — run
`pnpm run wire:fixture`, and merge. Add the domain's callback URL to the
GitHub OAuth app, and press **Setup Webhook** again for the new URL.

The repository also names the domain in one place, `BASE_DOMAIN` under each
environment's `env:` in `intent.yaml`, which the product was born with as the
reserved placeholder `lemonsqueezy-billing.example.com`. Nothing builds a URL
from it — the app follows `APP_URL` — so replacing it moves nothing by
itself; it records the domain. Replace it with yours in the same pull
request as `APP_URL`.

## CI

| Workflow | What it runs |
|---|---|
| `ci.yml` | the Orun pipeline, and the only workflow: `orun plan --changed`, then one job per lane. A pull request runs the verify lanes — the app built and dry-deployed for each environment, both Terraform roots checked and planned, the migrations planned and their checksums verified — with nothing applied or deployed (typecheck, lint and the tests are `pnpm` scripts you run, above); a merge applies, migrates and deploys stage → prod |

## Licence

The app is Lemon Squeezy's Next.js Billing App, MIT © 2023 Lemon Squeezy, LLC
(`apps/web/LICENSE`).
