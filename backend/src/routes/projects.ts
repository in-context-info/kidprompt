import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { Env } from "../env";
import { requireSession } from "./auth";
import { randomId, slugFor } from "../lib/ids";
import { buildProject, MAX_HTML_BYTES } from "../lib/claude";
import { buildsLeftToday } from "../lib/budget";
import { BuildRequest, CreateProjectRequest, RestoreRequest, UpdateProjectRequest } from "../contracts/projects.contract";

export const projects = new Hono<{ Bindings: Env }>();

const badBody = (r: { success: boolean }, c: Context) => {
  if (!r.success) return c.json({ error: "Invalid request body." }, 400);
};

const MAX_PROMPT_CHARS = 2000;
const MAX_VERSIONS_KEPT = 30;

export interface ProjectRow {
  id: string;
  owner_email: string;
  creator_id: string | null;
  slug: string;
  title: string;
  description: string;
  kind: "game" | "app";
  emoji: string;
  html: string;
  status: "draft" | "submitted" | "published" | "rejected";
  review_note: string | null;
  published_html: string | null;
  plays: number;
  updated_at: number;
}

const SUMMARY_COLUMNS = `id, owner_email, creator_id, slug, title, description, kind, emoji, status, review_note,
  plays, updated_at, published_html IS NOT NULL AS is_live,
  (published_html IS NOT NULL AND published_html != html) AS has_changes`;

function summaryFromRow(row: Omit<ProjectRow, "html" | "published_html"> & { is_live: number; has_changes: number }) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    kind: row.kind,
    emoji: row.emoji,
    status: row.status,
    reviewNote: row.review_note,
    creatorId: row.creator_id,
    isLive: !!row.is_live,
    hasUnpublishedChanges: !!row.has_changes,
    plays: row.plays,
    updatedAt: row.updated_at,
  };
}

async function ownedProject(c: Context<{ Bindings: Env }>, email: string) {
  return c.env.DB.prepare(`SELECT ${SUMMARY_COLUMNS}, html FROM projects WHERE id = ? AND owner_email = ?`)
    .bind(c.req.param("id"), email)
    .first<ProjectRow & { is_live: number; has_changes: number }>();
}

async function creatorBelongsTo(env: Env, creatorId: string, email: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT id FROM creators WHERE id = ? AND owner_email = ?").bind(creatorId, email).first();
  return !!row;
}

// Any edit to a submitted or rejected project sends it back to draft: what the
// reviewer looked at is no longer what would go live.
const EDITED_STATUS_SQL = `CASE WHEN status IN ('submitted', 'rejected') THEN 'draft' ELSE status END`;

projects.get("/projects", async (c) => {
  const email = await requireSession(c);
  if (!email) return c.json({ error: "Not logged in." }, 401);
  const rows = await c.env.DB.prepare(
    `SELECT ${SUMMARY_COLUMNS} FROM projects WHERE owner_email = ? ORDER BY updated_at DESC`,
  )
    .bind(email)
    .all<Omit<ProjectRow, "html" | "published_html"> & { is_live: number; has_changes: number }>();
  return c.json({ projects: rows.results.map(summaryFromRow) });
});

projects.post("/projects", zValidator("json", CreateProjectRequest, badBody), async (c) => {
  const email = await requireSession(c);
  if (!email) return c.json({ error: "Not logged in." }, 401);
  const body = c.req.valid("json");
  const title = body.title.trim();
  if (!title || title.length > 60) return c.json({ error: "Give it a name (up to 60 characters)." }, 400);
  if (body.creatorId && !(await creatorBelongsTo(c.env, body.creatorId, email))) {
    return c.json({ error: "Unknown kid profile." }, 400);
  }
  const id = randomId();
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO projects (id, owner_email, creator_id, slug, title, kind, emoji, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, email, body.creatorId ?? null, slugFor(title), title, body.kind ?? "game", (body.emoji || "🎮").slice(0, 8), now, now)
    .run();
  return c.json({ id });
});

projects.get("/projects/:id", async (c) => {
  const email = await requireSession(c);
  if (!email) return c.json({ error: "Not logged in." }, 401);
  const row = await ownedProject(c, email);
  if (!row) return c.json({ error: "Project not found." }, 404);
  const versions = await c.env.DB.prepare(
    "SELECT id, prompt, created_at FROM project_versions WHERE project_id = ? ORDER BY id DESC LIMIT ?",
  )
    .bind(row.id, MAX_VERSIONS_KEPT)
    .all<{ id: number; prompt: string; created_at: number }>();
  return c.json({
    ...summaryFromRow(row),
    html: row.html,
    versions: versions.results.map((v) => ({ id: v.id, prompt: v.prompt, createdAt: v.created_at })),
  });
});

projects.patch("/projects/:id", zValidator("json", UpdateProjectRequest, badBody), async (c) => {
  const email = await requireSession(c);
  if (!email) return c.json({ error: "Not logged in." }, 401);
  const row = await ownedProject(c, email);
  if (!row) return c.json({ error: "Project not found." }, 404);
  const body = c.req.valid("json");

  const title = body.title !== undefined ? body.title.trim() : row.title;
  if (!title || title.length > 60) return c.json({ error: "Give it a name (up to 60 characters)." }, 400);
  const description = body.description !== undefined ? body.description.trim().slice(0, 280) : row.description;
  if (body.creatorId && !(await creatorBelongsTo(c.env, body.creatorId, email))) {
    return c.json({ error: "Unknown kid profile." }, 400);
  }
  const creatorId = body.creatorId !== undefined ? body.creatorId : row.creator_id;
  const html = body.html !== undefined ? body.html : row.html;
  if (new TextEncoder().encode(html).length > MAX_HTML_BYTES) return c.json({ error: "That code is too big (400 KB max)." }, 400);

  const htmlChanged = html !== row.html;
  const statements = [
    c.env.DB.prepare(
      `UPDATE projects SET title = ?, description = ?, creator_id = ?, kind = ?, emoji = ?, html = ?, updated_at = ?,
         status = ${htmlChanged ? EDITED_STATUS_SQL : "status"}
       WHERE id = ?`,
    ).bind(title, description, creatorId, body.kind ?? row.kind, (body.emoji ?? row.emoji).slice(0, 8), html, Date.now(), row.id),
  ];
  if (htmlChanged) {
    statements.push(
      c.env.DB.prepare("INSERT INTO project_versions (project_id, prompt, html, created_at) VALUES (?, ?, ?, ?)").bind(
        row.id,
        "✏️ Edited the code by hand",
        html,
        Date.now(),
      ),
    );
  }
  await c.env.DB.batch(statements);
  return c.json({ ok: true });
});

projects.post("/projects/:id/build", zValidator("json", BuildRequest, badBody), async (c) => {
  const email = await requireSession(c);
  if (!email) return c.json({ error: "Not logged in." }, 401);
  const row = await ownedProject(c, email);
  if (!row) return c.json({ error: "Project not found." }, 404);
  const prompt = c.req.valid("json").prompt.trim();
  if (!prompt) return c.json({ error: "Tell me what to build!" }, 400);
  if (prompt.length > MAX_PROMPT_CHARS) return c.json({ error: "That's a lot of words! Try a shorter idea." }, 400);
  if ((await buildsLeftToday(c.env, email)) <= 0) {
    return c.json({ error: "You've used all of today's builds. Come back tomorrow!" }, 429);
  }

  const recent = await c.env.DB.prepare(
    "SELECT prompt FROM project_versions WHERE project_id = ? ORDER BY id DESC LIMIT 10",
  )
    .bind(row.id)
    .all<{ prompt: string }>();

  const result = await buildProject(c.env, {
    prompt,
    currentHtml: row.html,
    title: row.title,
    recentPrompts: recent.results.map((r) => r.prompt).reverse(),
  });

  const now = Date.now();
  if (!result.ok) {
    await c.env.DB.prepare("INSERT INTO claude_call_failures (email, project_id, reason, created_at) VALUES (?, ?, ?, ?)")
      .bind(email, row.id, result.reason, now)
      .run();
    return c.json({ error: result.kidMessage }, 502);
  }

  const inserted = await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE projects SET html = ?, updated_at = ?, status = ${EDITED_STATUS_SQL} WHERE id = ?`).bind(
      result.html,
      now,
      row.id,
    ),
    c.env.DB.prepare("INSERT INTO project_versions (project_id, prompt, html, created_at) VALUES (?, ?, ?, ?)").bind(
      row.id,
      prompt,
      result.html,
      now,
    ),
    c.env.DB.prepare(
      `INSERT INTO token_usage (email, project_id, model, input_tokens, output_tokens, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(email, row.id, result.model, result.inputTokens, result.outputTokens, result.durationMs, now),
  ]);
  // Keep only the newest versions so a long-lived project doesn't grow D1 forever.
  c.executionCtx.waitUntil(
    c.env.DB.prepare(
      `DELETE FROM project_versions WHERE project_id = ? AND id NOT IN
         (SELECT id FROM project_versions WHERE project_id = ? ORDER BY id DESC LIMIT ?)`,
    )
      .bind(row.id, row.id, MAX_VERSIONS_KEPT)
      .run(),
  );

  return c.json({
    html: result.html,
    message: result.message,
    versionId: inserted[1].meta.last_row_id,
    buildsLeftToday: await buildsLeftToday(c.env, email),
  });
});

projects.post("/projects/:id/restore", zValidator("json", RestoreRequest, badBody), async (c) => {
  const email = await requireSession(c);
  if (!email) return c.json({ error: "Not logged in." }, 401);
  const row = await ownedProject(c, email);
  if (!row) return c.json({ error: "Project not found." }, 404);
  const version = await c.env.DB.prepare("SELECT html, prompt FROM project_versions WHERE id = ? AND project_id = ?")
    .bind(c.req.valid("json").versionId, row.id)
    .first<{ html: string; prompt: string }>();
  if (!version) return c.json({ error: "Version not found." }, 404);
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE projects SET html = ?, updated_at = ?, status = ${EDITED_STATUS_SQL} WHERE id = ?`).bind(
      version.html,
      now,
      row.id,
    ),
    c.env.DB.prepare("INSERT INTO project_versions (project_id, prompt, html, created_at) VALUES (?, ?, ?, ?)").bind(
      row.id,
      `↩️ Went back to: ${version.prompt}`.slice(0, MAX_PROMPT_CHARS),
      version.html,
      now,
    ),
  ]);
  return c.json({ html: version.html });
});

// Ask the grown-up who runs kidprompt.ai to review and host it.
projects.post("/projects/:id/submit", async (c) => {
  const email = await requireSession(c);
  if (!email) return c.json({ error: "Not logged in." }, 401);
  const row = await ownedProject(c, email);
  if (!row) return c.json({ error: "Project not found." }, 404);
  if (!row.html.trim()) return c.json({ error: "Build something first!" }, 400);
  if (!row.creator_id) return c.json({ error: "Pick which kid made this before sharing it." }, 400);
  if (row.is_live && !row.has_changes) return c.json({ error: "This version is already live." }, 400);
  await c.env.DB.prepare("UPDATE projects SET status = 'submitted', submitted_at = ?, review_note = NULL WHERE id = ?")
    .bind(Date.now(), row.id)
    .run();
  return c.json({ ok: true });
});

projects.delete("/projects/:id", async (c) => {
  const email = await requireSession(c);
  if (!email) return c.json({ error: "Not logged in." }, 401);
  const row = await ownedProject(c, email);
  if (!row) return c.json({ error: "Project not found." }, 404);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM project_versions WHERE project_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(row.id),
  ]);
  return c.json({ ok: true });
});
