# apps/web — the app

Lemon Squeezy's [Next.js Billing App](https://github.com/lmsqueezy/nextjs-billing)
(MIT, see `LICENSE`), running on Cloudflare Workers + Static Assets:

- A sign-in page (`/`) with GitHub OAuth through Auth.js v5, database
  sessions through the Drizzle adapter
- A dashboard (`/dashboard`) guarded by `proxy.ts`, which sets up the Lemon
  Squeezy webhook for the store with one click
- A billing page (`/dashboard/billing`) listing the store's subscription
  plans (synced from Lemon Squeezy on first view), checkout in Lemon.js's
  overlay, and the user's subscriptions — paused, resumed, cancelled, their
  payment method updated, or changed to another plan
  (`/dashboard/billing/change-plans/[id]`)
- `/api/webhook`, which checks Lemon Squeezy's signature, stores each event
  and keeps the subscriptions current
- `/api/health`, which answers 200 only when the database is reachable
  through Hyperdrive and migrated, and says which third parties are
  connected

Nothing has to be connected for it to deploy: without Lemon Squeezy's keys
the billing page shows sample plans and the dashboard says which keys to
store; without a GitHub OAuth app the sign-in page says how to create one and
the dashboard is open as a preview (`src/lib/connections.ts`,
`src/lib/authorized.ts`).

The product's name is `src/lib/site.ts`. The database client is built per
call over the `HYPERDRIVE` binding (`src/db/index.ts`); Auth.js's key is
`AUTH_SECRET` or the one the database generated (`src/lib/auth-secret.ts`);
the webhook signature is WebCrypto's HMAC (`src/lib/signature.ts`). The
deploy contract is `component.yaml`, `wrangler.template.jsonc` →
`wrangler.jsonc` and `open-next.config.ts`; the repository's README says how
to run, test and deploy it.
