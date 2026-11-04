import { Hono } from "hono";
import type { Env } from "../env";

export const publicRoutes = new Hono<{ Bindings: Env }>();

interface GalleryRow {
  slug: string;
  title: string;
  description: string;
  kind: "game" | "app";
  emoji: string;
  nickname: string | null;
  creator_emoji: string | null;
  plays: number;
  published_at: number;
}

const GALLERY_SQL = `SELECT p.slug, p.title, p.description, p.kind, p.emoji, p.plays, p.published_at,
    c.nickname, c.emoji AS creator_emoji
  FROM projects p LEFT JOIN creators c ON c.id = p.creator_id
  WHERE p.published_html IS NOT NULL`;

function galleryItem(row: GalleryRow) {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    kind: row.kind,
    emoji: row.emoji,
    creatorNickname: row.nickname ?? "a KidPrompt maker",
    creatorEmoji: row.creator_emoji ?? "⭐",
    plays: row.plays,
    publishedAt: row.published_at,
  };
}

publicRoutes.get("/gallery", async (c) => {
  const sort = c.req.query("sort") === "popular" ? "p.plays DESC" : "p.published_at DESC";
  const rows = await c.env.DB.prepare(`${GALLERY_SQL} ORDER BY ${sort} LIMIT 60`).all<GalleryRow>();
  return c.json({ items: rows.results.map(galleryItem) });
});

publicRoutes.get("/games/:slug", async (c) => {
  const row = await c.env.DB.prepare(`${GALLERY_SQL} AND p.slug = ?`).bind(c.req.param("slug")).first<GalleryRow>();
  if (!row) return c.json({ error: "Game not found." }, 404);
  return c.json(galleryItem(row));
});

// A play counter, not analytics: no visitor id, no cookie, nothing about the
// player is stored.
publicRoutes.post("/games/:slug/play", async (c) => {
  await c.env.DB.prepare("UPDATE projects SET plays = plays + 1 WHERE slug = ? AND published_html IS NOT NULL")
    .bind(c.req.param("slug"))
    .run();
  return c.json({ ok: true });
});
