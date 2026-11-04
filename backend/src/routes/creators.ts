import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { Env } from "../env";
import { requireSession } from "./auth";
import { randomId } from "../lib/ids";
import { CreateCreatorRequest } from "../contracts/creators.contract";

export const creators = new Hono<{ Bindings: Env }>();

const MAX_CREATORS = 12;

creators.post(
  "/creators",
  zValidator("json", CreateCreatorRequest, (r, c) => {
    if (!r.success) return c.json({ error: "Invalid request body." }, 400);
  }),
  async (c) => {
    const email = await requireSession(c);
    if (!email) return c.json({ error: "Not logged in." }, 401);
    const body = c.req.valid("json");
    const nickname = body.nickname.trim();
    // A nickname shows publicly as "made by", so keep it short and nudge
    // families away from full names.
    if (!nickname || nickname.length > 24) return c.json({ error: "Nickname must be 1-24 characters." }, 400);
    const emoji = (body.emoji || "🦄").slice(0, 8);

    const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM creators WHERE owner_email = ?")
      .bind(email)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= MAX_CREATORS) return c.json({ error: `Up to ${MAX_CREATORS} kids per account.` }, 400);

    const id = randomId();
    await c.env.DB.prepare("INSERT INTO creators (id, owner_email, nickname, emoji, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(id, email, nickname, emoji, Date.now())
      .run();
    return c.json({ id, nickname, emoji });
  },
);

creators.delete("/creators/:id", async (c) => {
  const email = await requireSession(c);
  if (!email) return c.json({ error: "Not logged in." }, 401);
  const id = c.req.param("id");
  const used = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM projects WHERE creator_id = ? AND owner_email = ?")
    .bind(id, email)
    .first<{ n: number }>();
  if ((used?.n ?? 0) > 0) return c.json({ error: "Move or delete this kid's projects first." }, 400);
  await c.env.DB.prepare("DELETE FROM creators WHERE id = ? AND owner_email = ?").bind(id, email).run();
  return c.json({ ok: true });
});
