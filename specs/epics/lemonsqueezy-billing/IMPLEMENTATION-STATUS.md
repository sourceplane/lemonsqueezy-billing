# Implementation status — lemonsqueezy-billing

| Milestone | Status | Shipped in |
|---|---|---|
| LS0 — the spec | ✅ Shipped | [#1](https://github.com/sourceplane/lemonsqueezy-billing/pull/1) |
| LS1 — the billing portal on Workers | ✅ Shipped | [#2](https://github.com/sourceplane/lemonsqueezy-billing/pull/2) |
| LS2 — Supabase and Hyperdrive from Terraform, the schema through db-migrate | In progress | this pull request |
| LS3 — ready to instantiate | Planned | |
| LS4 — an Orun baseline | Planned | |

LS1 landed `apps/web` — the template on Next.js 16 and OpenNext, its Drizzle
client per call over the `HYPERDRIVE` binding, Auth.js configured per
request, the webhook signature in WebCrypto and the unconnected mode — and
`tests/web`.

LS2 lands the data plane: the `supabase` and `cloudflare-hyperdrive`
Terraform roots (saas-starter's), `packages/db` with upstream's Drizzle
tables as migrations (`010_billing_schema`), the generated Auth.js key
(`020_app_secrets`) and row-level security (`030_row_level_security`),
`infra/db-migrate`, and `tests/db`, which holds the migrated tables to the
app's Drizzle schema column for column. `tests/web` gains the webhook
processing on a real migrated Postgres. The full record of what is proven
and every departure from upstream lands with LS3.
