// Self-contained auth for the admin Worker — deliberately not shared with
// backend/src/lib/auth.ts (this monorepo's Workers are independently
// deployable with no shared code between them, same as marketing/). There is
// exactly one admin identity for now (env-configured, not a D1 users row),
// so this is much smaller than the main app's auth: no signup, no per-user
// storage, no password reset flow.

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function b64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): string {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return atob(str);
}

export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromHex(saltHex), iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return toHex(bits);
}

export async function verifyPassword(password: string, saltHex: string, expectedHashHex: string): Promise<boolean> {
  const actual = await hashPassword(password, saltHex);
  return actual === expectedHashHex;
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toHex(sig);
}

const SESSION_MAX_AGE_SEC = 60 * 60 * 12; // 12 hours — shorter-lived than the main app's session, re-auth is cheap for a single admin

export async function createAdminSessionToken(secret: string): Promise<string> {
  const payload = JSON.stringify({ sub: "admin", exp: Date.now() + SESSION_MAX_AGE_SEC * 1000 });
  const encodedPayload = b64urlEncode(payload);
  const sig = await hmac(secret, encodedPayload);
  return `${encodedPayload}.${sig}`;
}

export async function verifyAdminSessionToken(token: string | null, secret: string): Promise<boolean> {
  if (!token || !token.includes(".")) return false;
  const [encodedPayload, sig] = token.split(".");
  const expectedSig = await hmac(secret, encodedPayload);
  if (expectedSig !== sig) return false;
  try {
    const payload = JSON.parse(b64urlDecode(encodedPayload));
    return payload.sub === "admin" && typeof payload.exp === "number" && Date.now() <= payload.exp;
  } catch {
    return false;
  }
}

// Host-only cookie (no Domain attribute) — deliberately does NOT scope to
// .kidprompt.ai, so this session can never be read by any other subdomain
// (myecho.kidprompt.ai, echolify.ai). That isolation is the whole point of
// putting the admin portal on its own subdomain in the first place.
export function adminSessionCookieHeader(token: string): string {
  return `admin_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SEC}`;
}

export const clearAdminSessionCookieHeader = "admin_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie") || "";
  const match = header
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return match ? match.slice(name.length + 1) : null;
}
