# KidPrompt — kidprompt.ai

Kids describe a game or app in their own words, an AI builder (Claude) turns it into a real single-file HTML program, and a grown-up reviews it before it goes live on kidprompt.ai for family and friends to play.

Built on the same architecture as Echolify's MyEcho: an npm-workspaces monorepo of independently deployed Cloudflare Workers sharing one D1 database.

| Workspace   | What it is | Deployed as | Domain |
|-------------|------------|-------------|--------|
| `backend/`  | Hono API + D1. Also serves the built SPA (Workers Static Assets) and the sandboxed `/play/*` game pages | `kidprompt-backend` | `kidprompt.ai` |
| `frontend/` | Vite + React SPA (Arcade, play page, family studio, game builder). No deployment of its own; bundled into backend | — | — |
| `admin/`    | Server-rendered review portal: approve/reject games, take games down, families, usage and AI cost | `kidprompt-admin` | `admin.kidprompt.ai` |

## How it works

1. A **grown-up** signs up (email + password, confirmed with an emailed 6-digit code). Kids never get a login. They're **creators** with a nickname and an emoji.
2. In the **studio**, a kid creates a project and chats with the builder ("a cat that jumps over clouds", then "make it purple"). Every build is saved as a version, so they can go back. Grown-ups can also paste or hand-edit code.
3. **Share it** sends the project to the review queue at `admin.kidprompt.ai`. You approve it (it goes live in the Arcade at `kidprompt.ai/g/<slug>`) or send it back with a note.
4. Editing a live game never changes what players see. The live copy (`published_html`) only changes when an update is approved.

### Safety model

- Games run at `/play/<slug>` behind a **CSP sandbox**: an opaque origin (no cookies, no storage, no access to kidprompt.ai or its API) and `connect-src 'none'`, so a game can't reach the network or load outside content, whatever its code does. The iframe also has a `sandbox` attribute.
- The builder's system prompt (`backend/src/lib/claude.ts`) keeps output kid-appropriate and original, and never asks for personal details. The kid's words are passed as content, not instructions.
- Every game is human-reviewed before it's public. The review page flags code that tries to use the network, load outside files, or show forms.
- Each family gets a daily AI build budget (`DAILY_BUILD_LIMIT`, default 25 builds per rolling 24 hours). Failed builds don't count against it.

## Local development

```bash
npm install
cp backend/.dev.vars.example backend/.dev.vars        # add a real ANTHROPIC_API_KEY to test AI builds
cp admin/.dev.vars.example admin/.dev.vars
node admin/scripts/generate-credentials.mjs "a password"  # paste the hash + salt into admin/.dev.vars
npm run db:local                                       # schema into the shared local D1
npm run build:frontend                                 # backend serves frontend/dist
```

Then, in three terminals:

```bash
npm run dev:backend    # :8787  API + /play
npm run dev:frontend   # :5173  open this one; proxies /api and /play to :8787
npm run dev:admin      # :8789  review portal
```

With `DEV_LOG_CODES=true`, signup codes print to the backend terminal instead of being emailed. Backend and admin share one local D1 (`--persist-to .wrangler/shared-state`), so games you submit locally show up in the local admin queue.

End-to-end smoke test (servers running, backend output logged to a file):

```bash
scripts/smoke.sh <backend-log-file> <admin-email> <admin-password>
```

## First deploy

Already done on the `in-context.info` Cloudflare account: the `kidprompt-db` D1 database (its id is in both `wrangler.jsonc` files), the schema applied remotely, and Email Sending enabled for `kidprompt.ai` with its SPF/DKIM/DMARC records live.

Secrets go up with the first deploy from two gitignored files, so neither Worker is ever live without them:

1. `backend/.prod.secrets` already has a generated `SESSION_SECRET`. Add your `ANTHROPIC_API_KEY`.
2. `admin/.prod.secrets` already has `ADMIN_EMAIL` and a generated `ADMIN_SESSION_SECRET`. Run `node admin/scripts/generate-credentials.mjs "your admin password"` and paste its `ADMIN_PASSWORD_HASH` and `ADMIN_PASSWORD_SALT` lines in.
3. Merge to `main`, then from an up-to-date, clean `main`:
   ```bash
   npm run deploy:backend -- --secrets-file .prod.secrets
   npm run deploy:admin -- --secrets-file .prod.secrets
   ```
   Later deploys are just `npm run deploy:backend` and `npm run deploy:admin`, since secrets persist across deploys. To rotate one: `npx wrangler secret put <NAME>` from that workspace.

Schema changes: `npm run db:remote` (idempotent).

Deploys refuse to run from anything but a clean `main` that matches `origin/main` (`scripts/require-main.mjs`). For an emergency, put `ALLOW_NON_MAIN_DEPLOY="<reason>"` inline on the one command.
