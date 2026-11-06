import type { Env } from "../env";
import { getCookie, hmac } from "./auth";
import { randomId, slugFor } from "./ids";

// "Try it" without an account. A guest is a random id in an HMAC-signed
// cookie — nothing about the person. Three limits keep anonymous AI spend
// bounded: builds per guest, guest builds per IP per 24h (an HMAC of the IP,
// never the raw address, so clearing cookies doesn't reset it), and all guest
// builds per 24h, which is the hard ceiling on what strangers can cost.

const DAY_MS = 24 * 60 * 60 * 1000;
const GUEST_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30;

export interface GuestVersion {
  prompt: string;
  html: string;
  createdAt: number;
}

export interface GuestProjectRow {
  id: string;
  guest_id: string;
  ip_hash: string;
  title: string;
  html: string;
  versions: string;
  claimed_at: number | null;
}

// Domain-separated from the session token so one can never pass as the other.
async function sign(env: Env, guestId: string): Promise<string> {
  return hmac(env.SESSION_SECRET, `guest:${guestId}`);
}

export async function readGuestId(env: Env, request: Request): Promise<string | null> {
  const raw = getCookie(request, "guest");
  if (!raw || !raw.includes(".")) return null;
  const [id, sig] = raw.split(".");
  return (await sign(env, id)) === sig ? id : null;
}

export async function newGuestCookie(env: Env): Promise<{ id: string; header: string }> {
  const id = randomId(16);
  const value = `${id}.${await sign(env, id)}`;
  return { id, header: `guest=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${GUEST_COOKIE_MAX_AGE_SEC}` };
}

export const clearGuestCookieHeader = "guest=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";

export async function ipHash(env: Env, request: Request): Promise<string> {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  return (await hmac(env.SESSION_SECRET, `ip:${ip}`)).slice(0, 32);
}

export function guestEmail(guestId: string): string {
  return `guest:${guestId}`;
}

export async function guestProject(env: Env, guestId: string): Promise<GuestProjectRow | null> {
  return env.DB.prepare("SELECT * FROM guest_projects WHERE guest_id = ?").bind(guestId).first<GuestProjectRow>();
}

export function guestBuildLimit(env: Env): number {
  return Number(env.GUEST_BUILD_LIMIT) || 3;
}

export async function guestBuildsUsed(env: Env, guestId: string): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM token_usage WHERE email = ?")
    .bind(guestEmail(guestId))
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export type GuestBlock = "guest_limit" | "ip_limit" | "global_limit";

// Which limit (if any) stops this guest building right now. Counts successful
// builds only (token_usage), so a failed build never uses up a try.
export async function guestBlockReason(env: Env, guestId: string, ip: string): Promise<GuestBlock | null> {
  if ((await guestBuildsUsed(env, guestId)) >= guestBuildLimit(env)) return "guest_limit";
  const since = Date.now() - DAY_MS;
  const [perIp, global] = await env.DB.batch<{ n: number }>([
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM token_usage t JOIN guest_projects g ON g.id = t.project_id
       WHERE g.ip_hash = ? AND t.email LIKE 'guest:%' AND t.created_at > ?`,
    ).bind(ip, since),
    env.DB.prepare("SELECT COUNT(*) AS n FROM token_usage WHERE email LIKE 'guest:%' AND created_at > ?").bind(since),
  ]);
  if ((perIp.results[0]?.n ?? 0) >= (Number(env.GUEST_IP_DAILY_LIMIT) || 6)) return "ip_limit";
  if ((global.results[0]?.n ?? 0) >= (Number(env.GUEST_GLOBAL_DAILY_LIMIT) || 60)) return "global_limit";
  return null;
}

export const GUEST_BLOCK_MESSAGES: Record<GuestBlock, string> = {
  guest_limit: "That's all the free tries! Make a free family account to keep building.",
  ip_limit: "That's all the free tries for today. Make a free family account to keep building.",
  global_limit: "Lots of kids are trying KidPrompt today! Make a free family account to keep building.",
};

// Moves the guest's game into the account that just signed up or logged in,
// so "Save & share" never loses what a kid made. Returns the new project id,
// or null when there is nothing to claim. The guest cookie is cleared either
// way by the caller. Safe to call twice: the claimed_at check makes the
// second call a no-op.
export async function claimGuestProject(env: Env, request: Request, email: string): Promise<string | null> {
  const guestId = await readGuestId(env, request);
  if (!guestId) return null;
  const guest = await guestProject(env, guestId);
  if (!guest || guest.claimed_at || !guest.html) return null;

  const versions = JSON.parse(guest.versions) as GuestVersion[];
  const projectId = randomId();
  const now = Date.now();
  const claim = await env.DB.prepare(
    `UPDATE guest_projects SET claimed_by_email = ?, claimed_project_id = ?, claimed_at = ?
     WHERE id = ? AND claimed_at IS NULL`,
  )
    .bind(email, projectId, now, guest.id)
    .run();
  if (!claim.meta.changes) return null;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO projects (id, owner_email, creator_id, slug, title, kind, emoji, html, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, 'game', '🎮', ?, ?, ?)`,
    ).bind(projectId, email, slugFor(guest.title), guest.title, guest.html, now, now),
    ...versions.map((v) =>
      env.DB.prepare("INSERT INTO project_versions (project_id, prompt, html, created_at) VALUES (?, ?, ?, ?)").bind(
        projectId,
        v.prompt,
        v.html,
        v.createdAt,
      ),
    ),
  ]);
  return projectId;
}
