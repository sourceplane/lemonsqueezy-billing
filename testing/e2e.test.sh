#!/usr/bin/env bash
# TIER 2 — the product a bootstrap produces builds, migrates, deploys (dry),
# serves, and lets a user in, with no Lemon Squeezy key, no GitHub OAuth app
# and no AUTH_SECRET — and then with them.
#
# placement.test.sh proves the tree a bootstrap ends with is the right tree,
# and that its own plan converges in the right order. This proves it WORKS,
# by doing to it what its own pipelines will:
#
#   1. at the 01-product landing (the commit its PR merges), install with the
#      lockfile the product ships, render the wrangler fixture (which must
#      change nothing: the render is committed), typecheck, lint, test, build.
#      The landing itself is checked in the build box with `orun validate`
#      and `orun plan` alone (`checks: local`), and its PR runs `plan` alone
#      (an `orun/BASE-*` branch), so THIS is where a product those steps
#      refuse is caught: before the tag, not after a build has merged it;
#   2. a Postgres of its own on a random port, with Supabase's roles — the
#      database a Supabase project would be: `postgres` a login role WITHOUT
#      superuser or BYPASSRLS, `anon` and `authenticated` with the Data API's
#      default grants (testing/lib/local-postgres.sh) — and a stand-in for the
#      ONE Supabase Management API endpoint the migration runner calls
#      (testing/lib/fake-supabase-api.py), connected as `postgres`;
#   3. the db-migrate lane's own steps, rendered by `orun plan` for a push to
#      main and run IN THE TREE THE RUNNER STAGES for the job: install, build
#      @saas/db, apply — every migration, the Auth.js key the database
#      generates for itself and row-level security on every table in `public`
#      included — then apply again, which must apply nothing, and the
#      pull-request profile's offline plan;
#   4. the web lane's own steps for stage, rendered for a pull request (the
#      verify profile carries deploy-dry-run; the deploy profile does not) and
#      run in its staged job tree: install, `verify-app-structure` (the
#      committed wrangler.jsonc must exist BEFORE the build, in a tree with no
#      build output), `build-app` — which re-renders the config from the
#      stage wiring document it is handed, as the deploy does — then
#      `verify-build-output` and `deploy-dry-run`;
#   5. the built Worker under `wrangler dev`, its HYPERDRIVE binding pointed at
#      that Postgres, with NO .dev.vars and no secret — what a fresh
#      deployment is — and the component's OWN `smokeCommand` against it,
#      verbatim; then every page: the product's name on them, the sign-in
#      page saying what to connect, the dashboard open as a preview with the
#      sample plans and what Lemon Squeezy needs, `/api/health` (answered
#      only by the Worker, over Hyperdrive) and the webhook saying Lemon
#      Squeezy is not connected (a 503, nothing stored);
#   6. the same Worker with the optional secrets a product stores — a GitHub
#      OAuth app's id and secret and the webhook secret (fake values: GitHub
#      and Lemon Squeezy are not reachable from here) — where the dashboard is
#      guarded again, signing in sends the visitor to GitHub's authorize page
#      with this deployment's callback, a session Auth.js finds in the
#      database opens the dashboard with the user's subscription on it, and
#      a webhook is refused unless signed with the secret, and stored when it
#      is, recording that the API key is still missing;
#   7. the Data API's view of the same database: every table in `public` has
#      row-level security, and `anon` and `authenticated` — granted everything
#      Supabase grants them — read none of the rows the app wrote (OAuth
#      tokens and session tokens among them) and can write none, while the
#      app, as the tables' owner and nothing more, just did both.
#
# What it cannot do is the platform's half and the third parties': create the
# repository, mint the brokered tokens, create a real Supabase project and
# Hyperdrive config (Terraform is validated, not applied, in this
# repository), deploy for real and probe workers.dev, complete a GitHub
# OAuth round trip, or call Lemon Squeezy's API (its SDK has a fixed origin;
# tests/web mocks it). That is a bootstrap against a workspace (BOOTSTRAP.md)
# and an owner's own keys; everything short of it is here.
#
# Needs: orun, node, pnpm, python3 (+PyYAML), git, curl, psql, openssl and a
# PostgreSQL server install (initdb, pg_ctl), and the network for
# `pnpm install` (or a warm store). A few minutes: three installs, two builds.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
# shellcheck source=lib/bootstrap.sh
source "$here/lib/bootstrap.sh"
# shellcheck source=lib/local-postgres.sh
source "$here/lib/local-postgres.sh"

for bin in orun node pnpm python3 git curl psql openssl; do
  command -v "$bin" >/dev/null || { echo "e2e.test.sh needs $bin on PATH" >&2; exit 1; }
done
pg_bin >/dev/null || { echo "e2e.test.sh needs a PostgreSQL server install (initdb, pg_ctl)" >&2; exit 1; }

scratch="$(mktemp -d)"
pgdir="$(mktemp -d)"
dev_pid=""
api_pid=""
# wrangler dev runs under pnpm, node and two workerd processes; a TERM to the
# first does not reach the rest, and waiting on it then never returns. So each
# server is started as its own process group (setsid) and the group stopped.
stop_group() {
  local pid="$1"
  [ -n "$pid" ] || return 0
  kill -TERM -- "-$pid" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 -- "-$pid" 2>/dev/null || break; sleep 0.5; done
  kill -KILL -- "-$pid" 2>/dev/null || true
}
cleanup() {
  stop_group "$dev_pid"
  stop_group "$api_pid"
  pg_down "$pgdir"
  [ -n "$pgdir" ] && [ -d "$pgdir" ] && rm -rf "$pgdir"
  [ -n "$scratch" ] && [ -d "$scratch" ] && rm -rf "$scratch"
}
trap cleanup EXIT
free_port() { python3 -c "import socket;s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1]);s.close()"; }
values="$here/fixtures/acme.json"
repo="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['reponame'])" "$values")"
export CI=1 WRANGLER_SEND_METRICS=false NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1

# The landing's own checks, step for step — what the product's Checks
# workflow ran on a pull request before the product carried ci.yml alone —
# run here at once on the whole tree.
LANDING_CHECKS=(
  "pnpm install --frozen-lockfile"
  "pnpm run wire:fixture"
  "pnpm typecheck"
  "pnpm lint"
  "pnpm test"
  "pnpm build"
)
checks() { # DIR LOG
  local dir="$1" log="$2" cmd
  for cmd in "${LANDING_CHECKS[@]}"; do
    echo "   \$ $cmd" | tee -a "$log"
    if ! (cd "$dir" && bash -c "$cmd") >> "$log" 2>&1; then
      echo "FAIL: \`$cmd\` failed in $dir" >&2; tail -40 "$log" >&2; return 1
    fi
  done
}

# One job of a plan, written out as the runner would run it: each `run:` step
# (the `use:` actions are setup-node and setup-pnpm, which this machine has)
# as a numbered script, the job's env, and the component path the steps run
# in. Steps are picked BY ID when given, else every `run:` step in order.
extract_job() { # PLAN JOB-ID OUT-DIR [STEP-ID…]
  python3 - "$@" <<'PY'
import json, pathlib, sys
plan, jid, out, *want = sys.argv[1:]
job = next((j for j in json.load(open(plan))["jobs"] if j["id"] == jid), None)
if job is None:
    sys.exit(f"the plan has no job {jid}")
out = pathlib.Path(out); out.mkdir(parents=True)
steps = [s for s in job["steps"] if s.get("run")]
if want:
    by = {s["id"]: s for s in steps}
    missing = [w for w in want if w not in by]
    if missing:
        sys.exit(f"{jid} has no step(s) {missing}")
    steps = [by[w] for w in want]
for i, s in enumerate(steps):
    (out / f"{i:02d}.sh").write_text(s["run"])
    (out / f"{i:02d}.id").write_text(s["id"])
(out / "path").write_text(job.get("path") or ".")
with (out / "env").open("w") as f:
    for k, v in (job.get("env") or {}).items():
        f.write(f"export {k}={json.dumps(v)}\n")
PY
}
run_job() { # STEPS-DIR WORK-TREE ENV LOG-PREFIX
  local steps="$1" work="$2" envname="$3" logp="$4" s id
  for s in "$steps"/[0-9][0-9].sh; do
    id="$(cat "${s%.sh}.id")"
    echo "   ▸ $id"
    if ! (cd "$work/$(cat "$steps/path")" && source "$steps/env" && export ORUN_ENVIRONMENT="$envname" \
          && bash -e "$s") > "$logp-$id.log" 2>&1; then
      echo "FAIL: the lane's $id step" >&2; tail -40 "$logp-$id.log" >&2; return 1
    fi
  done
}

echo "── the offline bootstrap (testing/lib/bootstrap.sh)"
tree="$scratch/$repo"
bootstrap_offline "$root" "$tree" "$values" "$scratch/logs" > "$scratch/bootstrap.log" 2>&1 || {
  echo "FAIL: the offline bootstrap stopped" >&2; tail -40 "$scratch/bootstrap.log" >&2; exit 1; }
echo "   2 phases placed and landed"

# ── 1. the product's own pull request ──────────────────────────────────────
echo "── 01-product's landing: install, the fixture render, typecheck, lint, test, build"
s01="$(git -C "$tree" rev-parse HEAD~1)"
at01="$scratch/at-01/$repo"
git -C "$tree" worktree add -q "$at01" "$s01"
checks "$at01" "$scratch/checks.log"
dirty="$(git -C "$at01" status --porcelain)"
[ -z "$dirty" ] || { echo "FAIL: the checks changed tracked files — the committed wrangler.jsonc is not the fixture render:" >&2; echo "$dirty" >&2; exit 1; }
echo "   the checks left the tree as committed (wire:fixture rendered the committed wrangler.jsonc)"

# ── 2. a database, and the one API the migration runner calls ──────────────
echo "── a local Postgres and the Supabase Management API stand-in"
pgurl="$(pg_up "$pgdir" "$(free_port)")" || { echo "FAIL: Postgres did not start" >&2; exit 1; }
api_port="$(free_port)"
ref="localproject"
setsid python3 "$here/lib/fake-supabase-api.py" "$api_port" "$pgurl" --ref "$ref" > "$scratch/api.log" 2>&1 < /dev/null &
api_pid=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$api_port/" && break; sleep 0.3; done
echo "   $pgurl; the API on :$api_port"

# The two plans the lanes below run from, each in the product's own tree: a
# push to main at the 01-product commit (the db-migrate lane's APPLY profile),
# and a pull request over the finished product against an empty base (the web
# lane's VERIFY profile, which carries deploy-dry-run, and db-migrate's PLAN).
(cd "$at01" && orun plan --intent intent.yaml --trigger github-push-main --env stage --output "$scratch/plan-main.json") > "$scratch/plan-main.log" 2>&1 \
  || { echo "FAIL: orun plan (push to main)" >&2; tail -15 "$scratch/plan-main.log" >&2; exit 1; }
git -C "$tree" worktree remove --force "$at01"
mkdir -p "$scratch/pr"
git clone -q "$tree" "$scratch/pr/$repo"
prtree="$scratch/pr/$repo"
git -C "$prtree" checkout -q --orphan empty
git -C "$prtree" rm -rqf .
git -C "$prtree" -c user.email=t@example.invalid -c user.name=t commit -qm empty --allow-empty
git -C "$prtree" checkout -q main
(cd "$prtree" && orun plan --intent intent.yaml --trigger github-pull-request --base empty --head HEAD --env stage \
   --output "$scratch/plan-pr.json") > "$scratch/plan-pr.log" 2>&1 \
  || { echo "FAIL: orun plan (pull request)" >&2; tail -15 "$scratch/plan-pr.log" >&2; exit 1; }
# This tier runs the bootstrap floor, newer than the orun the product's CI
# pins, and both read the per-edge `modeRules`: on a pull request — which
# applies and deploys nothing — the infrastructure edges that order a push to
# main are advisory, so no lane waits on another. (placement.test.sh checks
# the push to main's order.)
python3 - "$scratch/plan-pr.json" <<'PY'
import json, sys
jobs = {j["component"]: j for j in json.load(open(sys.argv[1]))["jobs"] if j["environment"] == "stage"}
chain = ["supabase", "cloudflare-hyperdrive", "db-migrate", "web"]
for a, b in zip(chain, chain[1:]):
    ja, jb = jobs[a], jobs[b]
    if ja["id"] in (jb.get("dependsOn") or []) or ja["id"] not in (jb.get("advisoryDependsOn") or []):
        sys.exit(f"FAIL: on a pull request {b}@stage must name {a}@stage as advisory, not wait on it")
print("   pull request: " + " → ".join(chain) + ", every edge advisory")
PY

# ── 3. the db-migrate lane, in its staged job tree ─────────────────────────
echo "── the stage db-migrate lane: install, build @saas/db, apply — then apply again, and the PR's plan"
extract_job "$scratch/plan-main.json" db-migrate.stage.migrate "$scratch/steps-migrate" \
  install-dependencies build-db-package "Migration Apply"
extract_job "$scratch/plan-main.json" db-migrate.stage.migrate "$scratch/steps-migrate-again" "Migration Apply"
extract_job "$scratch/plan-pr.json" db-migrate.stage.migrate "$scratch/steps-migrate-plan" "Migration Plan"
# Staged from the fresh clone (a CI checkout: no build output, no
# node_modules); its migrations are the 01-product commit's, byte for byte.
mwork="$prtree/.orun/runs/e2e/db-migrate.stage.migrate/work"
python3 "$here/lib/stage-job.py" "$prtree" "$mwork"
# The component's secretEnv, as the lane resolves it: the supabase apply's
# published credentials and the brokered access token. SUPABASE_API_URL is
# the one value no lane has — it points the runner at the stand-in.
export SUPABASE_ACCESS_TOKEN=e2e-token SUPABASE_PROJECT_REF="$ref" SUPABASE_DB_PASSWORD=postgres \
       SUPABASE_DB_URL="$pgurl" SUPABASE_API_URL="http://127.0.0.1:$api_port"
run_job "$scratch/steps-migrate" "$mwork" stage "$scratch/migrate"
applied() { python3 -c "import json,sys;t=open(sys.argv[1]).read();print(' '.join(json.loads(t[t.index('{'):t.rindex('}')+1])['applied']))" "$1"; }
want="000_control_baseline 010_billing_schema 020_app_secrets 030_row_level_security"
[ "$(applied "$scratch/migrate-Migration Apply.log")" = "$want" ] \
  || { echo "FAIL: the first apply applied '$(applied "$scratch/migrate-Migration Apply.log")', not '$want'" >&2; exit 1; }
echo "   applied $want"
run_job "$scratch/steps-migrate-again" "$mwork" stage "$scratch/migrate-again"
[ -z "$(applied "$scratch/migrate-again-Migration Apply.log")" ] \
  || { echo "FAIL: a second apply applied '$(applied "$scratch/migrate-again-Migration Apply.log")'" >&2; exit 1; }
echo "   a second apply applied nothing (the ledger holds $(psql "$pgurl" -XAtc 'select count(*) from _migrations.applied') migrations)"
key_len="$(psql "$pgurl" -XAtc "select length(value) from app_private.secrets where name = 'auth_secret'")"
[ "$key_len" = 64 ] || { echo "FAIL: the database generated no 64-character Auth.js key (got '$key_len')" >&2; exit 1; }
echo "   the database generated its own Auth.js key (64 hex characters)"
run_job "$scratch/steps-migrate-plan" "$mwork" stage "$scratch/migrate-plan"
[ "$(applied "$scratch/migrate-plan-Migration Plan.log")" = "$want" ] \
  || { echo "FAIL: the pull request's offline plan did not verify every migration" >&2; exit 1; }
echo "   the pull request's plan step verifies every migration's checksum offline"
unset SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF SUPABASE_DB_PASSWORD SUPABASE_DB_URL SUPABASE_API_URL
rm -rf "$mwork"

# ── 4. the web lane's steps, for stage ─────────────────────────────────────
echo "── the stage web lane: install, verify-app-structure, build-app, verify-build-output, deploy-dry-run"
extract_job "$scratch/plan-pr.json" web.stage.verify-deploy "$scratch/steps-web" \
  install-workspace-dependencies verify-app-structure build-app verify-build-output deploy-dry-run
work="$prtree/.orun/runs/e2e/web.stage.verify-deploy/work"
# The job's private tree, staged as orun stages it — no build output, no
# node_modules: under stack-tectonic 0.19.0 the job installs inside it.
python3 "$here/lib/stage-job.py" "$prtree" "$work"
[ ! -e "$work/apps/web/.open-next" ] && [ -f "$work/apps/web/wrangler.jsonc" ] \
  || { echo "FAIL: the staged tree is not a fresh checkout with the committed wrangler.jsonc" >&2; exit 1; }
echo "   staged: $(realpath --relative-to="$prtree" "$work") — no build output, the committed wrangler.jsonc"
# The stage wiring document, as the cloudflare-hyperdrive apply publishes it
# and the lane resolves it (secretEnv WIRING_CLOUDFLARE_HYPERDRIVE_STAGE).
hd_id="e2e0000000000000000000000000c0de"
export WIRING_CLOUDFLARE_HYPERDRIVE_STAGE="{\"hyperdrive_id\":\"$hd_id\",\"hyperdrive_name\":\"stg-$repo-stage\"}"
run_job "$scratch/steps-web" "$work" stage "$scratch/web"
unset WIRING_CLOUDFLARE_HYPERDRIVE_STAGE
build_log="$(ls "$scratch"/web-build-app.log)"
grep -q '(Turbopack)' "$build_log" \
  || { echo "FAIL: the staged build did not run on Turbopack" >&2; grep -m3 'Next.js' "$build_log" >&2; exit 1; }
grep -q "\"id\": \"$hd_id\"" "$work/apps/web/wrangler.jsonc" \
  || { echo "FAIL: build-app did not re-render wrangler.jsonc from the stage wiring document" >&2; exit 1; }
[ "$(node -e 'const fs=require("fs");process.stdout.write(String(fs.readdirSync(process.argv[1]).length))' "$work/node_modules")" -gt 0 ] && [ ! -L "$work/node_modules" ] \
  || { echo "FAIL: the job's install did not land inside its own tree" >&2; exit 1; }
echo "   the staged build ran on Turbopack, inside its own tree, bound to the stage Hyperdrive id it was handed"


# ── 5 and 6: serve it — first as a fresh deployment, then connected ────────
[ ! -e "$work/apps/web/.dev.vars" ] || { echo "FAIL: the staged tree carries a .dev.vars" >&2; exit 1; }
url=""
serve() { # LOG [wrangler --var KEY:VALUE …]
  local log="$1"; shift
  stop_group "$dev_pid"
  local port; port="$(free_port)"
  (cd "$work/apps/web" && CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="$pgurl" \
     exec setsid pnpm exec wrangler dev --config wrangler.jsonc --ip 127.0.0.1 --port "$port" \
     --name "$repo-web-stage" --show-interactive-dev-session=false "$@") > "$log" 2>&1 < /dev/null &
  dev_pid=$!
  url="http://127.0.0.1:$port"
  for _ in $(seq 1 90); do
    curl -s -o /dev/null "$url/" && return 0
    kill -0 "$dev_pid" 2>/dev/null || { echo "FAIL: wrangler dev exited" >&2; tail -30 "$log" >&2; exit 1; }
    sleep 1
  done
  echo "FAIL: wrangler dev never answered" >&2; tail -30 "$log" >&2; exit 1
}

# What both runs share: the requests, and the checks on a page.
export SCRATCH="$scratch"
cat > "$scratch/routes.py" <<'PY'
import html, http.client, json, re, subprocess, sys, time, urllib.error, urllib.parse, urllib.request
base, values, pgurl = sys.argv[1], json.load(open(sys.argv[2])), sys.argv[3]
name, repo, subdomain = values["productname"], values["reponame"], values["subdomain"]
problems = []
def bad(m): problems.append(m)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
opener = urllib.request.build_opener(NoRedirect)
def req(path, data=None, headers=None, method=None):
    # A GET whose CONNECTION drops (not one that answers an error) is asked
    # again, twice at most, and says so: `wrangler dev` on a loaded machine
    # has dropped one. A POST is never repeated — it would submit twice.
    for attempt in range(3):
        r = urllib.request.Request(base + path, data=data, headers=headers or {}, method=method)
        try:
            with opener.open(r, timeout=60) as resp:
                return resp.status, headers_of(resp.headers), resp.read().decode()
        except urllib.error.HTTPError as e:
            return e.code, headers_of(e.headers), e.read().decode()
        except (http.client.RemoteDisconnected, ConnectionResetError) as e:
            if data is not None or attempt == 2:
                raise
            print(f"   (GET {path}: the connection dropped ({e.__class__.__name__}) — asking again)")
            time.sleep(1)
def headers_of(msg):
    # Every Set-Cookie, one per line (Auth.js sets several at once).
    h = {k.lower(): v for k, v in msg.items()}
    h["set-cookie"] = "\n".join(msg.get_all("set-cookie") or [])
    return h
def location(h):
    return urllib.parse.urlparse(h.get("location", "")).path
def text(fragment):
    return html.unescape(re.sub(r"<[^>]+>", "", fragment)).strip()
def title(page):
    m = re.search(r"<title>(.*?)</title>", page, re.S)
    return m and html.unescape(m.group(1))
def h1(page):
    m = re.search(r"<h1[^>]*>(.*?)</h1>", page, re.S)
    return m and re.sub(r"\s+", " ", text(m.group(1)))
def buttons(page, label):
    # The opening tag of every <button> whose content reads `label`.
    return re.findall(rf"(<button[^>]*>)(?:(?!</button>).)*?{re.escape(label)}", page, re.S)
def disabled(tag):
    # The attribute, not Tailwind's `disabled:` variants in its class.
    return re.search(r'\sdisabled(?:=""|\s|>|/)', tag) is not None
def psql(sql):
    return subprocess.run(["psql", pgurl, "-XAtc", sql], capture_output=True, text=True, check=True).stdout.strip()
def done(summary):
    if problems:
        for p in problems:
            print(f"  ✕ {p}", file=sys.stderr)
        sys.exit(1)
    print(summary)
PY

echo "── 5. wrangler dev over the built Worker, its HYPERDRIVE binding on the local Postgres, NO secret"
serve "$scratch/dev.log"
echo "   ▸ the component's own smokeCommand, DEPLOYED_URL=$url"
smoke="$(python3 -c "import yaml,sys;print(yaml.safe_load(open(sys.argv[1]))['spec']['parameters']['smokeCommand'])" "$tree/apps/web/component.yaml")"
DEPLOYED_URL="$url" bash -c "$smoke" || { echo "FAIL: the deploy's smoke refused the product" >&2; tail -20 "$scratch/dev.log" >&2; exit 1; }

echo "   ▸ every page, unconnected: what to connect, the preview, the sample plans"
python3 - "$url" "$values" "$pgurl" <<'PY' || { echo "FAIL: the unconnected routes; wrangler dev said:" >&2; tail -40 "$scratch/dev.log" >&2; exit 1; }
import os, sys
exec(open(os.path.join(os.environ["SCRATCH"], "routes.py")).read())

# ── the sign-in page, under the product's own name ────────────────────────
s, _, home = req("/")
if s != 200:
    bad(f"/ answered {s}")
if title(home) != name:
    bad(f"the home page's <title> is {title(home)!r}, not {name!r}")
if h1(home) != f"Sign in to {name}":
    bad(f"the home page's heading is {h1(home)!r}")
if "Lemon Stand" in home:
    bad("the home page still carries the baseline's name")
if 'href="https://github.com/lmsqueezy/nextjs-billing"' not in home:
    bad("the sign-in page's upstream link is gone")
if "Sign-in is not connected" not in home or "AUTH_GITHUB_ID" not in home or "AUTH_GITHUB_SECRET" not in home:
    bad("the sign-in page does not say which GitHub secrets to store")
callback = f"https://{repo}-web-stage.{subdomain}.workers.dev/api/auth/callback/github"
if callback not in home:
    bad(f"the sign-in page does not name the OAuth app's callback URL {callback}")
found = buttons(home, "Sign in with GitHub")
if len(found) != 1 or not disabled(found[0]):
    bad(f"the GitHub sign-in button is not disabled: {found}")

# ── the dashboard: a preview while nobody can sign in ─────────────────────
s, _, dash = req("/dashboard")
if s != 200:
    bad(f"/dashboard answered {s} — the preview must render while sign-in is not connected")
if title(dash) != f"Dashboard | {name}":
    bad(f"the dashboard's <title> is {title(dash)!r}")
for key in ("LEMONSQUEEZY_API_KEY", "LEMONSQUEEZY_STORE_ID", "LEMONSQUEEZY_WEBHOOK_SECRET"):
    if key not in dash:
        bad(f"the dashboard does not name {key}")
if "Lemon Squeezy is not connected" not in dash:
    bad("the dashboard does not say Lemon Squeezy is not connected")
hook = f"https://{repo}-web-stage.{subdomain}.workers.dev/api/webhook"
if hook not in dash:
    bad(f"the dashboard does not name the webhook URL {hook}")
if "Preview: sign-in is not connected" not in dash:
    bad("the dashboard's sidebar does not say it is a preview")

s, _, billing = req("/dashboard/billing")
if s != 200:
    bad(f"/dashboard/billing answered {s}")
# React marks where one expression meets the next text (`<!-- -->`), so what
# a reader sees is read off the page's text, not its markup.
seen = text(billing)
if "Sample product (Monthly)" not in seen or "Sample product (Yearly)" not in seen:
    bad("the billing page does not show the sample plans")
signups = buttons(billing, "Sign up")
if len(signups) != 2 or not all(disabled(b) for b in signups):
    bad(f"the billing page's two sample sign-up buttons are not both disabled: {signups}")
if "It appears that you do not have any subscriptions" not in billing:
    bad("the billing page does not say the visitor has no subscriptions")
# The preview has no subscription, so there is no plan to change: the page
# calls notFound(). It streams behind its loading boundary, so the status is
# already sent (200) and the not-found page is what arrives in it.
s, _, page = req("/dashboard/billing/change-plans/1")
if s not in (200, 404) or "This page could not be found" not in page:
    bad(f"changing plans in the preview answered {s} without the not-found page")

# ── what only the Worker answers ──────────────────────────────────────────
s, _, body = req("/api/health")
if s != 200 or json.loads(body) != {"ok": True, "database": "reachable", "schema": "migrated",
                                    "connected": {"lemonSqueezy": False, "github": False}}:
    bad(f"/api/health answered {s} {body}")
s, _, body = req("/api/auth/session")
if s != 200 or body.strip() != "null":
    bad(f"/api/auth/session signed out answered {s} {body[:80]}")
s, _, body = req("/api/webhook", b'{"meta":{}}', {"x-signature": "00"}, "POST")
if s != 503 or json.loads(body) != {"error": "Lemon Squeezy is not connected."}:
    bad(f"the webhook answered {s} {body[:80]}, not 503 'Lemon Squeezy is not connected.'")
if psql('select count(*) from "webhookEvent"') != "0":
    bad("the unconnected webhook stored an event")
s, _, _ = req("/no-such-page")
if s != 404:
    bad(f"/no-such-page answered {s}")

done(f"   /, /dashboard, /dashboard/billing (sample plans), a 404 — as {name!r}; "
     "/api/health; the webhook 503, nothing stored")
PY

echo "── 6. the same Worker with the optional secrets: GitHub sign-in and the webhook secret"
serve "$scratch/dev-connected.log" --var AUTH_GITHUB_ID:e2e-client-id --var AUTH_GITHUB_SECRET:e2e-client-secret \
  --var LEMONSQUEEZY_WEBHOOK_SECRET:e2e-webhook-secret
python3 - "$url" "$values" "$pgurl" <<'PY' || { echo "FAIL: the connected routes; wrangler dev said:" >&2; tail -40 "$scratch/dev-connected.log" >&2; exit 1; }
import hashlib, hmac, os, secrets, sys
exec(open(os.path.join(os.environ["SCRATCH"], "routes.py")).read())

s, _, body = req("/api/health")
if s != 200 or json.loads(body).get("connected") != {"lemonSqueezy": False, "github": True}:
    bad(f"/api/health connected answered {s} {body}")
s, _, home = req("/")
if s != 200 or "Sign-in is not connected" in home:
    bad(f"/ answered {s}, still saying sign-in is not connected")
found = buttons(home, "Sign in with GitHub")
if len(found) != 1 or disabled(found[0]):
    bad(f"the GitHub sign-in button is not enabled: {found}")
s, h, _ = req("/dashboard")
if s != 307 or location(h) != "/":
    bad(f"/dashboard signed out answered {s} → {h.get('location')}, not 307 → the sign-in page")

# ── signing in goes to GitHub, back to this deployment ────────────────────
s, h, body = req("/api/auth/csrf")
csrf = json.loads(body)["csrfToken"]
jar = "; ".join(c.split(";")[0] for c in h["set-cookie"].split("\n") if "authjs" in c)
s, h, _ = req("/api/auth/signin/github", urllib.parse.urlencode({"csrfToken": csrf, "callbackUrl": base + "/dashboard"}).encode(),
              {"content-type": "application/x-www-form-urlencoded", "cookie": jar}, "POST")
authorize = urllib.parse.urlparse(h.get("location", ""))
q = urllib.parse.parse_qs(authorize.query)
port = urllib.parse.urlparse(base).port
if s != 302 or authorize.netloc != "github.com" or authorize.path != "/login/oauth/authorize":
    bad(f"signing in answered {s} → {h.get('location')}, not GitHub's authorize page")
elif q.get("client_id") != ["e2e-client-id"] or not q.get("redirect_uri", [""])[0].endswith(f":{port}/api/auth/callback/github"):
    bad(f"GitHub's authorize page was asked for the wrong app or callback: {q}")

# ── a session Auth.js finds in the database: what a GitHub sign-in leaves ─
# (a user, their account, a session row; the cookie carries the session's
# token). The cookie's `__Secure-` name is the deployment's: APP_URL is https.
token = secrets.token_hex(32)
psql(f"""insert into "user" (id, name, email) values ('e2e-user', 'Sam Tester', 'sam@lemons.example');
insert into account ("userId", type, provider, "providerAccountId", access_token)
  values ('e2e-user', 'oauth', 'github', '4242', 'gho_e2e_token');
insert into session ("sessionToken", "userId", expires) values ('{token}', 'e2e-user', now() + interval '1 day');
insert into plan ("productId", "productName", "variantId", name, price, interval)
  values (1, 'Lemonade', 555, 'Monthly', '900', 'month');
insert into subscription ("lemonSqueezyId", "orderId", name, email, status, "statusFormatted", price,
  "userId", "planId") select 'sub_e2e', 1, 'Sam Tester', 'sam@lemons.example', 'active', 'Active', '900',
  'e2e-user', id from plan where "variantId" = 555;""")
cookie = f"__Secure-authjs.session-token={token}"
s, h, _ = req("/", headers={"cookie": cookie})
if s not in (302, 307) or location(h) != "/dashboard":
    bad(f"/ signed in answered {s} → {h.get('location')}, not → /dashboard")
s, _, body = req("/api/auth/session", headers={"cookie": cookie})
if s != 200 or (json.loads(body) or {}).get("user", {}).get("email") != "sam@lemons.example":
    bad(f"/api/auth/session signed in answered {s} {body[:80]}")
s, _, billing = req("/dashboard/billing", headers={"cookie": cookie})
if s != 200:
    bad(f"/dashboard/billing signed in answered {s}")
if "Sam Tester" not in billing or "Preview: sign-in is not connected" in billing:
    bad("the billing page does not show the signed-in user")
if "Lemonade (Monthly)" not in text(billing):
    bad("the billing page does not list the user's subscription from the database")
if "Lemon Squeezy is not connected" not in billing:
    bad("the billing page does not say Lemon Squeezy is not connected")

# ── the webhook: signed or refused ────────────────────────────────────────
event = json.dumps({"meta": {"event_name": "subscription_created", "custom_data": {"user_id": "e2e-user"}},
                    "data": {"id": "sub_e2e", "attributes": {"variant_id": 555,
                             "first_subscription_item": {"id": 1, "price_id": 1, "is_usage_based": False}}}}).encode()
sign = lambda body, key=b"e2e-webhook-secret": hmac.new(key, body, hashlib.sha256).hexdigest()
for label, sig, body in (("no signature", None, event), ("another secret's", sign(event, b"wrong"), event),
                         ("a changed body's", sign(event), event + b" ")):
    s, _, _ = req("/api/webhook", body, {} if sig is None else {"x-signature": sig}, "POST")
    if s != 400:
        bad(f"a webhook with {label} signature answered {s}, not 400")
if psql('select count(*) from "webhookEvent"') != "0":
    bad("a refused webhook stored an event")
s, _, body = req("/api/webhook", event, {"x-signature": sign(event)}, "POST")
if s != 200 or body != "OK":
    bad(f"a signed webhook answered {s} {body[:80]}")
row = psql('select "eventName" || \'|\' || processed || \'|\' || coalesce("processingError", \'\') from "webhookEvent"')
if not row.startswith("subscription_created|true|Lemon Squeezy is not connected: store LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID"):
    bad(f"the signed webhook was stored as {row!r}")

done("   /dashboard guarded; sign-in → GitHub's authorize page with this deployment's callback; "
     "a database session → the dashboard, the user's subscription; the webhook: 3 refused, 1 stored "
     "(the API key still missing, recorded)")
PY
stop_group "$dev_pid"; dev_pid=""

# ── 7. what Supabase's Data API would see ──────────────────────────────────
echo "── 7. the Data API's roles (anon, authenticated) against the same database"
psql "$pgurl" -X -q -v ON_ERROR_STOP=1 -At > "$scratch/rls.out" 2> "$scratch/rls.err" <<'SQL' \
  || { echo "FAIL: the row-level security checks" >&2; cat "$scratch/rls.err" >&2; exit 1; }
SELECT 'app role: superuser=' || rolsuper || ' bypassrls=' || rolbypassrls FROM pg_roles WHERE rolname = current_user;
SELECT 'public tables without RLS: ' || count(*) FILTER (WHERE NOT c.relrowsecurity) || ' of ' || count(*)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');
SELECT 'not owned by the app: ' || count(*) FILTER (WHERE pg_get_userbyid(c.relowner) <> current_user)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');
SELECT 'app sees accounts: ' || count(*) FROM account;
SET ROLE anon;
SELECT 'anon sees users: ' || count(*) FROM "user";
SELECT 'anon sees accounts: ' || count(*) FROM account;
SELECT 'anon sees sessions: ' || count(*) FROM session;
SELECT 'anon sees subscriptions: ' || count(*) FROM subscription;
RESET ROLE;
SET ROLE authenticated;
SELECT 'authenticated sees accounts: ' || count(*) FROM account;
SELECT 'authenticated sees sessions: ' || count(*) FROM session;
RESET ROLE;
SQL
sed 's/^/   /' "$scratch/rls.out"
grep -qx "app role: superuser=false bypassrls=false" "$scratch/rls.out" \
  && grep -qE "^public tables without RLS: 0 of [1-9][0-9]*$" "$scratch/rls.out" \
  && grep -qx "not owned by the app: 0" "$scratch/rls.out" \
  || { echo "FAIL: the app's role, the tables' owner or their row-level security is not what Supabase's would be" >&2; exit 1; }
app_accounts="$(sed -n 's/^app sees accounts: //p' "$scratch/rls.out")"
[ "${app_accounts:-0}" -ge 1 ] || { echo "FAIL: the app sees no account row" >&2; exit 1; }
for line in "anon sees users: 0" "anon sees accounts: 0" "anon sees sessions: 0" "anon sees subscriptions: 0" \
            "authenticated sees accounts: 0" "authenticated sees sessions: 0"; do
  grep -qx "$line" "$scratch/rls.out" || { echo "FAIL: expected '$line'" >&2; exit 1; }
done
# A write through the Data API's role is refused by row-level security, and
# app_private (the Auth.js key) is not theirs to read at all.
for role in anon authenticated; do
  if psql "$pgurl" -X -q -At -c "SET ROLE $role; INSERT INTO \"user\" (id, email) VALUES ('$role', '$role@example.invalid')" > "$scratch/rls-write.log" 2>&1; then
    echo "FAIL: $role wrote a user through row-level security" >&2; exit 1
  fi
  grep -q "row-level security" "$scratch/rls-write.log" \
    || { echo "FAIL: $role's write was refused for another reason:" >&2; cat "$scratch/rls-write.log" >&2; exit 1; }
  if psql "$pgurl" -X -q -At -c "SET ROLE $role; SELECT value FROM app_private.secrets" > "$scratch/rls-secret.log" 2>&1; then
    echo "FAIL: $role read app_private.secrets" >&2; exit 1
  fi
  grep -q "permission denied" "$scratch/rls-secret.log" \
    || { echo "FAIL: $role's read of app_private was refused for another reason" >&2; cat "$scratch/rls-secret.log" >&2; exit 1; }
done
echo "   anon and authenticated, granted what Supabase grants them, read the $app_accounts OAuth account(s) and every session as 0 and write none; app_private is closed to them"

echo "e2e.test.sh: ok"
