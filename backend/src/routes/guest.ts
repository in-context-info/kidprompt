import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { Env } from "../env";
import { buildProject } from "../lib/claude";
import { randomId } from "../lib/ids";
import {
  GUEST_BLOCK_MESSAGES,
  guestBlockReason,
  guestBuildLimit,
  guestBuildsUsed,
  guestEmail,
  guestProject,
  ipHash,
  newGuestCookie,
  readGuestId,
  type GuestVersion,
} from "../lib/guest";
import { GuestBuildRequest } from "../contracts/guest.contract";

export const guest = new Hono<{ Bindings: Env }>();

const MAX_PROMPT_CHARS = 2000;

guest.get("/guest", async (c) => {
  const guestId = await readGuestId(c.env, c.req.raw);
  const limit = guestBuildLimit(c.env);
  if (!guestId) return c.json({ project: null, buildsLeft: limit });
  const row = await guestProject(c.env, guestId);
  const used = await guestBuildsUsed(c.env, guestId);
  const project =
    row && !row.claimed_at
      ? {
          title: row.title,
          hasHtml: !!row.html,
          prompts: (JSON.parse(row.versions) as GuestVersion[]).map((v) => v.prompt),
        }
      : null;
  return c.json({ project, buildsLeft: Math.max(0, limit - used) });
});

guest.post(
  "/guest/build",
  zValidator("json", GuestBuildRequest, (r, c) => {
    if (!r.success) return c.json({ error: "Invalid request body." }, 400);
  }),
  async (c) => {
    const body = c.req.valid("json");
    const prompt = body.prompt.trim();
    if (!prompt) return c.json({ error: "Tell me what to build!" }, 400);
    if (prompt.length > MAX_PROMPT_CHARS) return c.json({ error: "That's a lot of words! Try a shorter idea." }, 400);

    let guestId = await readGuestId(c.env, c.req.raw);
    if (!guestId) {
      const cookie = await newGuestCookie(c.env);
      guestId = cookie.id;
      c.header("Set-Cookie", cookie.header);
    }
    const ip = await ipHash(c.env, c.req.raw);
    const now = Date.now();

    const blocked = await guestBlockReason(c.env, guestId, ip);
    if (blocked) {
      await c.env.DB.prepare("INSERT INTO guest_blocks (reason, ip_hash, created_at) VALUES (?, ?, ?)")
        .bind(blocked, ip, now)
        .run();
      return c.json({ error: GUEST_BLOCK_MESSAGES[blocked], code: "signup_required" }, 429);
    }

    let row = await guestProject(c.env, guestId);
    if (row?.claimed_at) return c.json({ error: "This game was saved to an account. Log in to keep building.", code: "signup_required" }, 409);
    if (!row) {
      const title = (body.title || "").trim().slice(0, 60) || "My first game";
      await c.env.DB.prepare(
        "INSERT INTO guest_projects (id, guest_id, ip_hash, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind(randomId(), guestId, ip, title, now, now)
        .run();
      row = (await guestProject(c.env, guestId))!;
    }

    const versions = JSON.parse(row.versions) as GuestVersion[];
    const result = await buildProject(c.env, {
      prompt,
      currentHtml: row.html,
      title: row.title,
      recentPrompts: versions.map((v) => v.prompt),
    });

    if (!result.ok) {
      await c.env.DB.prepare("INSERT INTO claude_call_failures (email, project_id, reason, created_at) VALUES (?, ?, ?, ?)")
        .bind(guestEmail(guestId), row.id, result.reason, now)
        .run();
      return c.json({ error: result.kidMessage }, 502);
    }

    const done = Date.now();
    versions.push({ prompt, html: result.html, createdAt: done });
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE guest_projects SET html = ?, versions = ?, updated_at = ? WHERE id = ?").bind(
        result.html,
        JSON.stringify(versions),
        done,
        row.id,
      ),
      c.env.DB.prepare(
        `INSERT INTO token_usage (email, project_id, model, input_tokens, output_tokens, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(guestEmail(guestId), row.id, result.model, result.inputTokens, result.outputTokens, result.durationMs, done),
    ]);

    return c.json({
      message: result.message,
      buildsLeft: Math.max(0, guestBuildLimit(c.env) - (await guestBuildsUsed(c.env, guestId))),
    });
  },
);
