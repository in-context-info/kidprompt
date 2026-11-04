import type { Env } from "../env";
import { toHex } from "./auth";

export const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_ATTEMPTS = 5;

export function generateVerificationCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1000000).padStart(6, "0");
}

export async function hashVerificationCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return toHex(digest);
}

export async function sendCodeEmail(
  env: Env,
  email: string,
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (env.DEV_LOG_CODES === "true") {
    console.log(`[dev] signup code for ${email}: ${code}`);
    return { ok: true };
  }
  try {
    await env.EMAIL.send({
      to: email,
      from: { email: "verify@kidprompt.ai", name: "KidPrompt" },
      subject: "Your KidPrompt code",
      text: `Your KidPrompt code is ${code}. It expires in 10 minutes.`,
      html: `<p>Your KidPrompt code is <strong>${code}</strong>. It expires in 10 minutes.</p>`,
    });
  } catch (err) {
    console.error("Failed to send verification email", err);
    return { ok: false, error: "We couldn't send a code to that email address." };
  }
  return { ok: true };
}
