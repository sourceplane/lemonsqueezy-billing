# web-tests

The app's tests (the webhook signature, route and processing on a real migrated Postgres, Lemon Squeezy and GitHub before and after they are connected, who may open which page, the Auth.js key, the health check, the committed wrangler config)

The test suite for **web**. It deploys nothing: its lane installs, builds and runs the tests.

|              |                      |
| ------------ | -------------------- |
| Type         | `turbo-package`      |
| Source       | `tests/web`          |
| Package      | `@app/web-tests`     |
| Environments | `dev`: `quick-check` |

## Depends on

- (none)

## Depended on by

- (none)
