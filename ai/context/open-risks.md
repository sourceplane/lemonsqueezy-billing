# lemonsqueezy-billing — open risks

What is not yet proven or not yet decided. The full write-up of every risk,
including the accepted and resolved ones, is
`specs/epics/lemonsqueezy-billing/risks-and-open-questions.md`; this page lists only
what is still live, so it should be short.

| ID | Risk | State | What closes it |
|---|---|---|---|
| LS-M | No bootstrap has been timed (the card's eighteen minutes is summed from estimates); neither Terraform root has been applied from this repository and db-migrate has not run against a real project — so whether `postgres` owns the tables there, which migration `030`'s guard checks before it enables RLS (LS-L), is also unobserved | OPEN | One bootstrap from a tag against a workspace with Cloudflare and Supabase connected |
| LS-N | No GitHub OAuth round trip and no Lemon Squeezy API call has been made from a deployed Worker: the e2e stops at GitHub's authorize redirect and at a webhook signed with a fake secret, and `tests/web` mocks the SDK (its API origin is fixed) | OPEN | A deployed product connected to a Lemon Squeezy test store and a GitHub OAuth app: sign in, check out with the test card, see the subscription arrive by webhook |

Accepted, and worth knowing before you change them: LS-A (a `postgres`
client per call), LS-B (the dashboard is open as a preview until sign-in is
connected), LS-D (Wedges declares a React 18 peer; it builds and renders on
React 19), LS-E (migrations through the Management API, autocommit), LS-G
(local development needs a Postgres on 54322).
