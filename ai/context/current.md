# lemonsqueezy-billing — where this repository stands

The entry page for anyone (or any agent) picking this repository up. It is
this repository's own state and does not ship to a product built from it;
the two pages that do are [operations.md](operations.md) and
[deployment.md](deployment.md).

## What it is

Lemon Squeezy's Next.js Billing App — GitHub sign-in through Auth.js with
database sessions, plans synced from a Lemon Squeezy store, checkout in
Lemon.js's overlay, subscriptions kept current by signed webhooks and paused,
resumed, cancelled or changed from the dashboard, Drizzle over Postgres — on
Cloudflare Workers + Static Assets (through `@opennextjs/cloudflare`), its
Postgres a Supabase project's database reached through Cloudflare Hyperdrive,
both from Terraform, and its schema applied by db-migrate. It is packaged as
an Orun baseline: `orun new --blueprint repo-blueprint.yaml` builds a new
product in its own repository and takes it to live on stage and prod in one
landing (`01-product`: the Supabase project, then Hyperdrive over its
database, then the migrations, then the app), then records what went live
(`02-docs`). Lemon Squeezy and the GitHub OAuth app are the owner's to
connect afterwards, as optional Orun secrets; without them the app deploys,
shows sample plans and opens the dashboard as a preview.

## Release

| | |
|---|---|
| Latest tag | `baseline-v1` (LS4 — the baseline) |
| Proven live | No. Everything short of the platform and the third parties is proven offline in Baseline CI: the e2e tier migrates a local Postgres with the product's own runner, builds in orun's staged job tree, serves the built Worker unconnected (sample plans, the preview, the webhook's 503) and connected with fake keys (the GitHub authorize redirect, a database session, signed and refused webhooks). No bootstrap from a tag has run against a workspace, no GitHub OAuth round trip and no Lemon Squeezy API call has been made from a deployment, and the card's eighteen minutes is unmeasured (LS-M) |

## Where to read

| Question | Page |
|---|---|
| What shipped, and every departure from upstream | `specs/epics/lemonsqueezy-billing/IMPLEMENTATION-STATUS.md` |
| Why it is built this way | [decisions.md](decisions.md), then `specs/epics/lemonsqueezy-billing/design.md` |
| What could still go wrong | [open-risks.md](open-risks.md), then `specs/epics/lemonsqueezy-billing/risks-and-open-questions.md` |
| How to instantiate it | `BOOTSTRAP.md`, `docs/phases/` |
| What each component is | `<component>/docs/` beside each `component.yaml` — `apps/web`, `packages/db`, `infra/db-migrate`, `infra/terraform/{supabase,cloudflare-hyperdrive}`, `tests/{web,db}` (generated; `python3 tooling/catalog/gen-component-docs.py`) |

## Next

1. Bootstrap one product from `baseline-v1` against a workspace with
   Cloudflare and Supabase connected, then connect a Lemon Squeezy test store
   and a GitHub OAuth app, and record the timings and a checkout's webhook
   (closes LS-M; settles LS-L's table-owner check on a real project).
