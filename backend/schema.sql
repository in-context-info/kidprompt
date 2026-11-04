-- kidprompt-db — the one source of truth for both backend/ and admin/
-- (same database_id in both wrangler.jsonc files). Every statement is
-- idempotent so this file can be re-applied to local and remote at any time:
--   npx wrangler d1 execute kidprompt-db --local  --file=./schema.sql
--   npx wrangler d1 execute kidprompt-db --remote --file=./schema.sql
-- Never put a semicolon inside a string literal here: the test harness and
-- wrangler both split this file on it.

-- Grown-up accounts (a parent, aunt, uncle, family friend). Kids never get
-- their own login or email — they are creator profiles under an adult.
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  password_changed_at INTEGER,
  -- 'active' | 'suspended' (set from the admin portal)
  status TEXT NOT NULL DEFAULT 'active'
);

-- Signup waits here until the emailed 6-digit code is confirmed, so no email
-- is ever claimed by someone who has not proven they own it.
CREATE TABLE IF NOT EXISTS pending_signups (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- A kid's creator profile: a nickname and an emoji, nothing that identifies
-- them. The nickname is what shows as "made by" on a published game.
CREATE TABLE IF NOT EXISTS creators (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL REFERENCES users(email),
  nickname TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🦄',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_creators_owner ON creators(owner_email);

-- A game or app. html is the whole thing as one self-contained file.
-- status: draft -> submitted -> published (or rejected -> edit -> submitted).
-- Only the admin portal moves a project to published or rejected.
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL REFERENCES users(email),
  creator_id TEXT REFERENCES creators(id),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'game',
  emoji TEXT NOT NULL DEFAULT '🎮',
  html TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  review_note TEXT,
  -- The html that is live. Kept apart from html so editing a published game
  -- never changes what players see until it is reviewed again.
  published_html TEXT,
  plays INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  submitted_at INTEGER,
  published_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_email);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status, published_at);

-- Every AI build step: the kid's prompt and the html it produced, so the
-- editor can undo and the admin can see how a game was made.
CREATE TABLE IF NOT EXISTS project_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id),
  prompt TEXT NOT NULL,
  html TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_versions_project ON project_versions(project_id, id);

-- One row per successful Claude call — the daily build budget counts these,
-- and the admin portal prices them.
CREATE TABLE IF NOT EXISTS token_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  project_id TEXT,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_token_usage_email ON token_usage(email, created_at);

-- Failed or refused Claude calls, captured at the event (a failure otherwise
-- leaves no trace).
CREATE TABLE IF NOT EXISTS claude_call_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  project_id TEXT,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
