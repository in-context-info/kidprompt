const encoder = new TextEncoder();

export function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

export function b64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(str: string): string {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return atob(str);
}

export function randomSaltHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return toHex(bytes.buffer);
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

export async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toHex(sig);
}

const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

export async function createSessionToken(email: string, secret: string): Promise<string> {
  const payload = JSON.stringify({ email, exp: Date.now() + SESSION_MAX_AGE_SEC * 1000 });
  const encodedPayload = b64urlEncode(payload);
  const sig = await hmac(secret, encodedPayload);
  return `${encodedPayload}.${sig}`;
}

// Tokens are minted with a fixed max age, so exp - SESSION_MAX_AGE_MS is the
// issue time. requireSession compares it to password_changed_at so a password
// change logs out every older session. Only createSessionToken mints tokens.
export const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SEC * 1000;

export interface VerifiedSession {
  email: string;
  issuedAt: number;
}

export async function verifySession(token: string | null, secret: string): Promise<VerifiedSession | null> {
  if (!token || !token.includes(".")) return null;
  const [encodedPayload, sig] = token.split(".");
  const expectedSig = await hmac(secret, encodedPayload);
  if (expectedSig !== sig) return null;
  try {
    const payload = JSON.parse(b64urlDecode(encodedPayload));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return { email: payload.email, issuedAt: payload.exp - SESSION_MAX_AGE_MS };
  } catch {
    return null;
  }
}

export async function verifySessionToken(token: string | null, secret: string): Promise<string | null> {
  return (await verifySession(token, secret))?.email ?? null;
}

export function sessionCookieHeader(token: string): string {
  return `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SEC}`;
}

export const clearSessionCookieHeader = "session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie") || "";
  const match = header
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return match ? match.slice(name.length + 1) : null;
}

export function validEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}
