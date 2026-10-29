# lemonsqueezy-billing — decisions

The choices that shape this repository, one line each, with where the full
reasoning lives. Superseded decisions stay listed, marked, so the history
reads in order.

| # | Decision | Why | Source |
|---|---|---|---|
| 1 | OpenNext on Workers + Static Assets (Next 16.4.3, React 19.2, `@opennextjs/cloudflare` 1.20.13); upstream's `middleware.ts` is `proxy.ts` | OpenNext needs a current Next (≥ 16.4.1 for 1.20); only what Next 16 and Workers force changes in the template | IMPLEMENTATION-STATUS (Versions) |
| 2 | Forked from subscription-payments' row, its data path from saas-starter's | The template queries Postgres through Drizzle, which is saas-starter's shape (Hyperdrive, a client per request, the app-secret migration, the e2e's Hyperdrive lane), not subscription-payments' supabase-js | IMPLEMENTATION-STATUS (Lineage) |
| 3 | Drizzle over a Postgres socket through Hyperdrive (`postgres-js`), in place of upstream's Neon HTTP driver | Hyperdrive gives the Worker the socket the code's queries need; Neon is not the database here | design.md §2 |
| 4 | A `postgres` client per call (`getDb()` in `src/db/index.ts`), never a module-level pool; Auth.js configured lazily per request | Workers refuse to reuse a socket another request opened; Hyperdrive is the pool | design.md §3, risk LS-A |
| 5 | The schema as `packages/db` migrations applied by db-migrate (upstream used `drizzle-kit push`); `tests/db` holds them to the Drizzle schema column for column | A push from a laptop is not a deploy step; a checked migration is | design.md §2, risk LS-E |
| 6 | Lemon Squeezy's three keys, the GitHub OAuth app and `AUTH_SECRET` are OPTIONAL Orun secrets, pushed to the Worker by the deploy (`env -u` for the build, then `wrangler secret bulk`) | No platform brokers them; a bootstrapped product is deployed by a convergence nobody attends | `apps/web/component.yaml`, risk LS-J |
| 7 | Unconnected, the app says what to connect: sample plans with disabled buttons, the dashboard open as a PREVIEW until sign-in is connected, the webhook a 503 | The unconnected app must be viewable; with no way to sign in, a guarded dashboard would be a wall | `src/lib/connections.ts`, `src/lib/authorized.ts`, risk LS-B |
| 8 | Auth.js's key defaults to one the database generates (`020_app_secrets`) unless `AUTH_SECRET` is set | No hand-set secret for a fresh product; stage and prod each have their own | risk LS-J |
| 9 | `useSecureCookies` is decided once, from `APP_URL` | Left to Auth.js, a route handler and the proxy disagreed on the cookie name over http (`wrangler dev`), and sign-in looped | `src/auth.ts`, risk LS-C |
| 10 | The webhook signature is checked with WebCrypto (`src/lib/signature.ts`), not `node:crypto` | Native in a Worker; `tests/web` holds it to node:crypto's answer | IMPLEMENTATION-STATUS |
| 11 | Row-level security with no policy on every table in `public`; migration `030` refuses to run if `postgres` would be locked out | Supabase's Data API serves `public` to the anon key, and `account` holds OAuth tokens, `session` live session tokens | risk LS-L |
| 12 | Infra before app on main: supabase → cloudflare-hyperdrive → db-migrate → web, enforced; advisory on a pull request | Each component reads what the one before it published | design.md §4 |
| 13 | One landing (`01-product`) then the record (`02-docs`), on the turso-starter v8 shape at orun v2.88.0; `ci.yml` plans nothing while `intent.yaml` names `ws_CHANGE_ME` | A landing has a fixed cost; the shape every recent baseline shares | `repo-blueprint.yaml` |
| 14 | stack-tectonic 0.19.0, not 0.20.0 | 0.20.0's lane-scoped install is refused by Turbopack | `intent.yaml` |
| 15 | Component docs are generated from the manifests and checked in CI | A hand-written copy of the dependency graph and bindings drifts silently | `tooling/catalog/gen-component-docs.py` |
| 16 | `subdomain` is read from the Cloudflare connection; the console asks for no domain | It has one right answer; nothing in the build needs a domain | `blueprint.yaml`, `repo-blueprint.yaml` |
