import type { Env } from "../env";

const DAY_MS = 24 * 60 * 60 * 1000;

// Rolling 24h count of successful AI builds for one grown-up account (all of
// their kids share it). This is the only thing standing between a runaway
// browser tab and the Anthropic bill, so it counts token_usage rows — written
// only after a build succeeds — rather than anything client-supplied.
export async function buildsLeftToday(env: Env, email: string): Promise<number> {
  const limit = Number(env.DAILY_BUILD_LIMIT) || 25;
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM token_usage WHERE email = ? AND created_at > ?")
    .bind(email, Date.now() - DAY_MS)
    .first<{ n: number }>();
  return Math.max(0, limit - (row?.n ?? 0));
}
