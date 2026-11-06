# CLAUDE.md

Guidance for Claude Code in this repo. Setup, commands and deploy steps are in `README.md`.

## Architecture (mirrors Echolify's MyEcho)

- npm workspaces: `backend/`, `frontend/`, `admin/`. Run `npm install` at the root only.
- `backend/` is the only deployable that matters for the app: Hono API under `/api/*`, sandboxed game pages under `/play/*` (`run_worker_first`), and everything else is the built SPA from `frontend/dist` (SPA fallback). `deploy:backend` rebuilds the frontend first via `predeploy`.
- `admin/` is a separate Worker on its own subdomain with its own single env-configured identity and session secret, so a kidprompt.ai session is worthless there. It reads and writes the same D1 (`kidprompt-db`, same `database_id` in both `wrangler.jsonc` files).
- No shared code between Workers. Duplicated on purpose, keep in step: the `/play` CSP (`backend/src/routes/play.ts` and `admin/src/routes/review.ts`), and the auth helpers.
- `backend/schema.sql` is the one schema for both Workers. Every statement is idempotent. No semicolons inside string literals. A new column on an existing table needs an explicit `ALTER TABLE` run against local and remote, since `CREATE TABLE IF NOT EXISTS` won't add it.
- Request bodies are zod-validated against `backend/src/contracts/*.ts`. Change the contract with the route.

## Product rules that the code depends on

- Only adults have accounts. Kids are `creators` (nickname + emoji). Never add a field that collects a kid's personal details.
- `projects.html` is the working draft. `projects.published_html` is what players see, copied from `html` only when the admin approves. `status` is the review state of the draft (`draft` → `submitted` → `published` or `rejected`). Any edit to a submitted or rejected draft sends it back to `draft`.
- A game is public if and only if `published_html IS NOT NULL`.
- Kid-made html is untrusted. It is only ever served with the `/play` CSP (sandbox, no network). Never render it inline in the SPA, via `srcdoc`, or from any route without that header.
- "Try it" without an account (`backend/src/lib/guest.ts`, `routes/guest.ts`, `frontend/src/components/TryIt.tsx`): a guest is a random id in an HMAC-signed `guest` cookie. One `guest_projects` row per guest, builds recorded in `token_usage` as `email = 'guest:<id>'`. Three limits from `wrangler.jsonc` vars, counting successful builds only: per guest, per IP-hash per 24h (never store a raw IP), and all guests per 24h (the spend ceiling). Turn-aways go to `guest_blocks`. Signup confirm and login call `claimGuestProject`, which copies the game and its versions into `projects` and sets `claimed_*`. Guest games are never public: only a claimed project can be submitted. The admin `/guests` page reads all of this.
- `DEV_FAKE_BUILDS=true` in `backend/.dev.vars` returns a canned game instead of calling Claude, for local testing. Never set it in production.
- AI builds: `backend/src/lib/claude.ts`, `claude-opus-5-5` in code, but production runs `claude-sonnet-5-5` via the `CLAUDE_MODEL` var in `backend/wrangler.jsonc` (faster, half the cost), adaptive thinking, server-side refusal fallback. The daily budget counts `token_usage` rows (successes only). Failures go to `claude_call_failures`.

## Design language

Same as Echolify: Fraunces (display) + Figtree (body) from Google Fonts, inline `style` objects, no CSS framework. Colors and shared styles live in `frontend/src/theme.ts`. The admin portal is plain server-rendered HTML (`admin/src/lib/layout.ts`); escape every database string with `escapeHtml()`.

## Verify

`npm run verify` (typecheck for all workspaces), and `scripts/smoke.sh` plus `scripts/smoke-guest.sh` against local dev servers (fresh local DB for the guest one, since its per-network limit carries over). `@cloudflare/vitest-pool-workers` currently fails to install in this workspace with npm 10.9 (`Cannot read properties of null (reading 'edgesOut')`), which is why there's no vitest suite yet.

Never deploy before merge: deploy only from a clean, up-to-date `main`.
