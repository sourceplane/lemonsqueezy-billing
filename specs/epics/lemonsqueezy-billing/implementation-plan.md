# Implementation plan — lemonsqueezy-billing

| Milestone | Task | What lands | Done when |
|---|---|---|---|
| LS0 — the spec | LS-1 | intent (`ws_CHANGE_ME`), `ci.yml` (turso-starter's, byte for byte but for the provider-credential comment), shared tooling, the spec index, this doc set, the task contracts | merged; CI's plan job green |
| LS1 — the billing portal on Workers | LS-2 | `apps/web` — the template on Next.js 16 and OpenNext, `getDb()` over Hyperdrive, Auth.js per request, WebCrypto signatures, the unconnected mode, `/api/health`; `tests/web` | typecheck, lint, test and build green; under `wrangler dev` every page renders unconnected, and with fake keys the dashboard is guarded, sign-in goes to GitHub's authorize page, a database session opens the dashboard and a signed webhook is stored |
| LS2 — Supabase and Hyperdrive from Terraform, the schema through db-migrate | LS-3 | `infra/terraform/supabase`, `infra/terraform/cloudflare-hyperdrive`, `packages/db` (`@saas/db`), `infra/db-migrate`, `tests/db`; the web component's enforced edges and live wiring | the roots validate; the migrations apply into a real Postgres and match the Drizzle schema; the plan orders roots → migrations → Worker |
| LS3 — ready to instantiate | LS-4 | the README, the as-built status | a reader can run, test, preview, deploy and connect it |
| LS4 — an Orun baseline | LS-5 | `blueprint.yaml`, `repo-blueprint.yaml`, `.baseline/`, the rename and bootstrap tooling, the context pack, the component docs, `testing/`, `baseline.yml`, `tag.yml` | Baseline CI green; `baseline-v1` cut by `tag.yml` |
