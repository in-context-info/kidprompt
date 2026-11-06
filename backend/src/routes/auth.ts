import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { Env } from "../env";
import {
  clearSessionCookieHeader,
  createSessionToken,
  getCookie,
  hashPassword,
  randomSaltHex,
  sessionCookieHeader,
  validEmail,
  verifyPassword,
  verifySession,
} from "../lib/auth";
import {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  generateVerificationCode,
  hashVerificationCode,
  sendCodeEmail,
} from "../lib/email";
import { buildsLeftToday } from "../lib/budget";
import { claimGuestProject, clearGuestCookieHeader } from "../lib/guest";
import { LoginRequest, SignupConfirmRequest, SignupRequest } from "../contracts/auth.contract";

export const auth = new Hono<{ Bindings: Env }>();

const badBody = (result: { success: boolean }, c: Context) => {
  if (!result.success) return c.json({ error: "Invalid request body." }, 400);
};

interface UserRow {
  email: string;
  name: string;
  password_hash: string;
  salt: string;
  password_changed_at: number | null;
  status: string;
}

// The shared guard for every authenticated route. Returns the account's email,
// or null when there is no valid session — including a session issued before
// the password last changed, and a suspended account.
export async function requireSession(c: Context<{ Bindings: Env }>): Promise<string | null> {
  const session = await verifySession(getCookie(c.req.raw, "session"), c.env.SESSION_SECRET);
  if (!session) return null;
  const user = await c.env.DB.prepare("SELECT password_changed_at, status FROM users WHERE email = ?")
    .bind(session.email)
    .first<Pick<UserRow, "password_changed_at" | "status">>();
  if (!user || user.status !== "active") return null;
  if (user.password_changed_at && session.issuedAt < user.password_changed_at) return null;
  return session.email;
}

// A "Try it" game made before signing up or logging in moves into the account.
async function claimGuest(c: Context<{ Bindings: Env }>, email: string): Promise<{ claimedProjectId?: string }> {
  const claimedProjectId = await claimGuestProject(c.env, c.req.raw, email);
  c.header("Set-Cookie", clearGuestCookieHeader, { append: true });
  return claimedProjectId ? { claimedProjectId } : {};
}

auth.post("/signup", zValidator("json", SignupRequest, badBody), async (c) => {
  const body = c.req.valid("json");
  const email = body.email.trim().toLowerCase();
  const name = body.name.trim();
  if (!validEmail(email)) return c.json({ error: "Please enter a valid email address." }, 400);
  if (!name || name.length > 60) return c.json({ error: "Please enter your name." }, 400);
  if (body.password.length < 8) return c.json({ error: "Password must be at least 8 characters." }, 400);

  const existing = await c.env.DB.prepare("SELECT email FROM users WHERE email = ?").bind(email).first();
  if (existing) return c.json({ error: "That email already has an account. Try logging in." }, 409);

  const pending = await c.env.DB.prepare("SELECT created_at FROM pending_signups WHERE email = ?")
    .bind(email)
    .first<{ created_at: number }>();
  const now = Date.now();
  if (pending && now - pending.created_at < RESEND_COOLDOWN_MS) {
    return c.json({ error: "We just sent a code. Please wait a minute before asking again." }, 429);
  }

  const salt = randomSaltHex();
  const passwordHash = await hashPassword(body.password, salt);
  const code = generateVerificationCode();
  const codeHash = await hashVerificationCode(code);

  const sent = await sendCodeEmail(c.env, email, code);
  if (!sent.ok) return c.json({ error: sent.error }, 502);

  await c.env.DB.prepare(
    `INSERT INTO pending_signups (email, name, password_hash, salt, code_hash, attempts, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(email) DO UPDATE SET name = excluded.name, password_hash = excluded.password_hash,
       salt = excluded.salt, code_hash = excluded.code_hash, attempts = 0,
       created_at = excluded.created_at, expires_at = excluded.expires_at`,
  )
    .bind(email, name, passwordHash, salt, codeHash, now, now + CODE_TTL_MS)
    .run();

  return c.json({ ok: true });
});

auth.post("/signup/confirm", zValidator("json", SignupConfirmRequest, badBody), async (c) => {
  const body = c.req.valid("json");
  const email = body.email.trim().toLowerCase();
  const row = await c.env.DB.prepare(
    "SELECT name, password_hash, salt, code_hash, attempts, expires_at FROM pending_signups WHERE email = ?",
  )
    .bind(email)
    .first<{ name: string; password_hash: string; salt: string; code_hash: string; attempts: number; expires_at: number }>();

  if (!row) return c.json({ error: "No signup is waiting for that email. Please start again." }, 400);
  if (Date.now() > row.expires_at) return c.json({ error: "That code expired. Please ask for a new one." }, 400);
  if (row.attempts >= MAX_ATTEMPTS) return c.json({ error: "Too many tries. Please ask for a new code." }, 429);

  if ((await hashVerificationCode(body.code.trim())) !== row.code_hash) {
    await c.env.DB.prepare("UPDATE pending_signups SET attempts = attempts + 1 WHERE email = ?").bind(email).run();
    return c.json({ error: "That code doesn't match. Check your email and try again." }, 400);
  }

  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO users (email, name, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(email, row.name, row.password_hash, row.salt, now),
    c.env.DB.prepare("DELETE FROM pending_signups WHERE email = ?").bind(email),
  ]);

  const token = await createSessionToken(email, c.env.SESSION_SECRET);
  c.header("Set-Cookie", sessionCookieHeader(token));
  return c.json({ ok: true, ...(await claimGuest(c, email)) });
});

auth.post("/login", zValidator("json", LoginRequest, badBody), async (c) => {
  const body = c.req.valid("json");
  const email = body.email.trim().toLowerCase();
  const user = await c.env.DB.prepare("SELECT email, password_hash, salt, status FROM users WHERE email = ?")
    .bind(email)
    .first<UserRow>();
  if (!user || !(await verifyPassword(body.password, user.salt, user.password_hash))) {
    return c.json({ error: "That email and password don't match." }, 401);
  }
  if (user.status !== "active") return c.json({ error: "This account is paused. Contact hello@kidprompt.ai." }, 403);

  const token = await createSessionToken(email, c.env.SESSION_SECRET);
  c.header("Set-Cookie", sessionCookieHeader(token));
  return c.json({ ok: true, ...(await claimGuest(c, email)) });
});

auth.post("/logout", (c) => {
  c.header("Set-Cookie", clearSessionCookieHeader);
  return c.json({ ok: true });
});

auth.get("/me", async (c) => {
  const email = await requireSession(c);
  if (!email) return c.json({ error: "Not logged in." }, 401);
  const user = await c.env.DB.prepare("SELECT email, name FROM users WHERE email = ?")
    .bind(email)
    .first<{ email: string; name: string }>();
  const creators = await c.env.DB.prepare(
    "SELECT id, nickname, emoji FROM creators WHERE owner_email = ? ORDER BY created_at",
  )
    .bind(email)
    .all<{ id: string; nickname: string; emoji: string }>();
  return c.json({
    user: { email: user!.email, name: user!.name },
    creators: creators.results,
    buildsLeftToday: await buildsLeftToday(c.env, email),
  });
});
