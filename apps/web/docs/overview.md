# web

Lemon Squeezy's Next.js billing portal — Auth.js with GitHub sign-in, plans and subscriptions over Lemon Squeezy, Drizzle on Postgres (Next.js on Cloudflare Workers + Static Assets via @opennextjs/cloudflare, per environment)

A Cloudflare Worker with Static Assets (server rendering plus static files), deployed per environment by its CI lane.

|              |                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| Type         | `cloudflare-workers-assets-turbo`                                                                                  |
| Source       | `apps/web`                                                                                                         |
| Package      | `@app/web`                                                                                                         |
| Environments | `dev`: `verify` · `stage`: `verify`, `deploy` on a push to `main` · `prod`: `verify`, `deploy` on a push to `main` |

## Depends on

- **cloudflare-hyperdrive** — Provisions Cloudflare Hyperdrive resources for stage and prod Supabase Postgres databases
- **db-migrate** — Applies database migrations to stage and prod Supabase instances

## Depended on by

- (none)
