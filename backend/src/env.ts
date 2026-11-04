export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  EMAIL: SendEmail;
  SESSION_SECRET: string;
  ANTHROPIC_API_KEY: string;
  DAILY_BUILD_LIMIT: string;
  // Optional override of the build model (defaults to lib/claude.ts DEFAULT_MODEL).
  CLAUDE_MODEL?: string;
  // "true" only in local dev: signup codes go to the console, not email.
  DEV_LOG_CODES?: string;
}
