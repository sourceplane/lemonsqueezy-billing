# Implementation status — lemonsqueezy-billing

| Milestone | Status | Shipped in |
|---|---|---|
| LS0 — the spec | ✅ Shipped | [#1](https://github.com/sourceplane/lemonsqueezy-billing/pull/1) |
| LS1 — the billing portal on Workers | In progress | this pull request |
| LS2 — Supabase and Hyperdrive from Terraform, the schema through db-migrate | Planned | |
| LS3 — ready to instantiate | Planned | |
| LS4 — an Orun baseline | Planned | |

LS1 lands `apps/web` — the template on Next.js 16 and OpenNext, its Drizzle
client per call over the `HYPERDRIVE` binding, Auth.js configured per
request, the webhook signature in WebCrypto and the unconnected mode — and
`tests/web`. Its component already names the `cloudflare-hyperdrive` and
`db-migrate` components LS2 lands (`ci.yml` plans nothing while the
workspace is the placeholder). The full record of what is proven and every
departure from upstream lands with LS3.
