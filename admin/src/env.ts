export interface Env {
  DB: D1Database;
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD_HASH: string;
  ADMIN_PASSWORD_SALT: string;
  ADMIN_SESSION_SECRET: string;
  // Where published games live, for "view live" links (https://kidprompt.ai).
  PUBLIC_ORIGIN: string;
}
