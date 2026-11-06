import { useEffect, useRef, useState } from "react";
import { api, type Me, type ProjectDetail } from "../api";
import { Link, navigate } from "../router";
import { C, FONT_DISPLAY, STATUS_LABELS, button, card, input } from "../theme";

const STARTERS = [
  "A game where a cat jumps over clouds and collects stars",
  "A quiz about dinosaurs with 10 questions",
  "A drawing app with rainbow brushes and stickers",
  "A racing game with a snail and a turtle",
];

const BUILDING_LINES = ["Mixing the pixels…", "Teaching the buttons to click…", "Painting the background…", "Adding a sprinkle of fun…", "Almost there…"];

interface ChatLine {
  who: "kid" | "builder";
  text: string;
}

export function Editor({ id, me, onMeChange }: { id: string; me: Me; onMeChange: () => Promise<void> }) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [building, setBuilding] = useState(false);
  const [buildLine, setBuildLine] = useState(0);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [tab, setTab] = useState<"preview" | "code" | "history">("preview");
  const [code, setCode] = useState("");
  const [previewKey, setPreviewKey] = useState(0);
  const [notice, setNotice] = useState("");
  const chatEnd = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const p = await api<ProjectDetail>(`projects/${id}`);
      setProject(p);
      setCode(p.html);
      setPreviewKey((k) => k + 1);
      return p;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  };

  useEffect(() => {
    load().then((p) => {
      if (p) setChat(p.versions.slice().reverse().map((v) => ({ who: "kid" as const, text: v.prompt })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, building]);

  useEffect(() => {
    if (!building) return;
    const t = setInterval(() => setBuildLine((n) => (n + 1) % BUILDING_LINES.length), 3500);
    return () => clearInterval(t);
  }, [building]);

  if (error && !project) return <p style={{ textAlign: "center", color: C.danger }}>{error}</p>;
  if (!project) return <p style={{ textAlign: "center", color: C.sub }}>Loading…</p>;

  const build = async (text: string) => {
    const words = text.trim();
    if (!words || building) return;
    setPrompt("");
    setError("");
    setChat((c) => [...c, { who: "kid", text: words }]);
    setBuilding(true);
    try {
      const r = await api<{ html: string; message: string }>(`projects/${id}/build`, {
        method: "POST",
        body: { prompt: words },
        timeoutMs: 5 * 60 * 1000,
      });
      setChat((c) => [...c, { who: "builder", text: r.message }]);
      await load();
      setTab("preview");
      onMeChange();
    } catch (e) {
      setChat((c) => [...c, { who: "builder", text: (e as Error).message }]);
    } finally {
      setBuilding(false);
    }
  };

  const save = async (fields: Partial<Pick<ProjectDetail, "title" | "description" | "html" | "creatorId">>) => {
    setError("");
    try {
      await api(`projects/${id}`, { method: "PATCH", body: fields });
      await load();
      setNotice("Saved!");
      setTimeout(() => setNotice(""), 1800);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const submit = async () => {
    setError("");
    try {
      await api(`projects/${id}/submit`, { method: "POST" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const restore = async (versionId: number) => {
    try {
      await api(`projects/${id}/restore`, { method: "POST", body: { versionId } });
      await load();
      setTab("preview");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete “${project.title}” for good?`)) return;
    await api(`projects/${id}`, { method: "DELETE" });
    navigate("/studio");
  };

  const status = STATUS_LABELS[project.status];
  const canSubmit = !!project.html && project.status !== "submitted" && (!project.isLive || project.hasUnpublishedChanges);

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "4px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <Link to="/studio" style={{ color: C.sub, fontWeight: 600 }}>
          ← Studio
        </Link>
        <span style={{ fontSize: 30 }}>{project.emoji}</span>
        <input
          defaultValue={project.title}
          key={project.title}
          onBlur={(e) => e.target.value.trim() !== project.title && save({ title: e.target.value })}
          style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 700, border: "none", background: "transparent", color: C.ink, flex: "1 1 200px", minWidth: 0, outline: "none" }}
        />
        <select
          value={project.creatorId ?? ""}
          onChange={(e) => save({ creatorId: e.target.value || null })}
          style={{ ...input, width: "auto", padding: "8px 10px" }}
        >
          <option value="">Who made it?</option>
          {me.creators.map((k) => (
            <option key={k.id} value={k.id}>
              {k.emoji} {k.nickname}
            </option>
          ))}
        </select>
        <span style={{ color: status.color, fontWeight: 700, fontSize: 14 }}>● {status.text}</span>
        {project.isLive && (
          <Link to={`/g/${project.slug}`} style={button("ghost")}>
            View live
          </Link>
        )}
        <button style={button("primary")} disabled={!canSubmit} onClick={submit} title="Send to the KidPrompt grown-up to host it">
          {project.isLive ? "🚀 Publish update" : "🚀 Share it"}
        </button>
      </div>

      {me.creators.length === 0 && (
        <div style={{ ...card, padding: 14, marginBottom: 14, background: "#EEF7FF", borderColor: "#CDE6FB" }}>
          👋 Welcome! To share this game, first <Link to="/studio" style={{ color: C.sky, fontWeight: 700 }}>add your kid in the Studio</Link>, then
          pick them under “Who made it?”.
        </div>
      )}
      {project.status === "rejected" && project.reviewNote && (
        <div style={{ ...card, padding: 14, marginBottom: 14, borderColor: "#F5C2BE", background: "#FFF4F3" }}>
          <b>Reviewer note:</b> {project.reviewNote}
        </div>
      )}
      {project.status === "submitted" && (
        <div style={{ ...card, padding: 14, marginBottom: 14, background: "#EEF7FF", borderColor: "#CDE6FB" }}>
          🕐 Sent for review! It'll show up in the Arcade once it's approved. Changing it now sends it back to draft.
        </div>
      )}
      {error && <p style={{ color: C.danger, margin: "0 0 12px" }}>{error}</p>}

      <div className="kp-editor" style={{ display: "grid", gridTemplateColumns: "minmax(300px, 380px) 1fr", gap: 16 }}>
        {/* Builder chat */}
        <section style={{ ...card, display: "flex", flexDirection: "column", height: "min(74vh, 760px)", minHeight: 420 }}>
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {chat.length === 0 && (
              <div>
                <p style={{ fontWeight: 700, margin: "0 0 10px" }}>What should we build? Try one:</p>
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setPrompt(s)}
                    style={{ ...button("ghost"), display: "block", width: "100%", textAlign: "left", borderRadius: 14, marginBottom: 8, fontWeight: 500 }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {chat.map((line, i) => (
              <div key={i} style={{ display: "flex", justifyContent: line.who === "kid" ? "flex-end" : "flex-start", marginBottom: 10 }}>
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "10px 14px",
                    borderRadius: 18,
                    background: line.who === "kid" ? `linear-gradient(135deg, ${C.coral}, ${C.sun})` : C.soft,
                    color: line.who === "kid" ? "#fff" : C.ink,
                    lineHeight: 1.4,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {line.who === "builder" && "🪄 "}
                  {line.text}
                </div>
              </div>
            ))}
            {building && (
              <div style={{ padding: "10px 14px", borderRadius: 18, background: C.soft, display: "inline-block" }}>
                <span style={{ display: "inline-block", animation: "wiggle 1s ease-in-out infinite" }}>🪄</span> {BUILDING_LINES[buildLine]}
              </div>
            )}
            <div ref={chatEnd} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              build(prompt);
            }}
            style={{ borderTop: `1px solid ${C.line}`, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}
          >
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  build(prompt);
                }
              }}
              placeholder={project.html ? "What should change? e.g. make the cat purple" : "Describe your game or app…"}
              rows={3}
              maxLength={2000}
              style={{ ...input, resize: "none" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: C.sub }}>{me.buildsLeftToday} builds left today</span>
              <button type="submit" disabled={building || !prompt.trim() || me.buildsLeftToday <= 0} style={button("primary")}>
                {building ? "Building…" : project.html ? "Change it ✨" : "Build it ✨"}
              </button>
            </div>
          </form>
        </section>

        {/* Preview / code / history */}
        <section style={{ ...card, display: "flex", flexDirection: "column", height: "min(74vh, 760px)", minHeight: 420, overflow: "hidden" }}>
          <div style={{ display: "flex", gap: 6, padding: 10, borderBottom: `1px solid ${C.line}`, alignItems: "center" }}>
            {(["preview", "code", "history"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{ ...button(tab === t ? "primary" : "ghost"), padding: "7px 14px", fontSize: 14 }}>
                {t === "preview" ? "▶ Play" : t === "code" ? "</> Code" : "🕘 History"}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            {notice && <span style={{ color: C.mint, fontWeight: 600, fontSize: 14 }}>{notice}</span>}
            {tab === "preview" && (
              <button onClick={() => setPreviewKey((k) => k + 1)} style={{ ...button("ghost"), padding: "7px 12px", fontSize: 14 }}>
                ↻ Restart
              </button>
            )}
          </div>
          {tab === "preview" &&
            (project.html ? (
              <iframe
                key={previewKey}
                title="Preview"
                src={`/play/draft/${project.id}?v=${previewKey}`}
                sandbox="allow-scripts allow-pointer-lock allow-modals"
                style={{ flex: 1, border: "none", width: "100%", background: "#fff" }}
              />
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.sub, textAlign: "center", padding: 24 }}>
                <div>
                  <div style={{ fontSize: 54 }}>🧱</div>
                  Your game will appear here.
                  <br />
                  Describe it on the left and press <b>Build it</b>!
                </div>
              </div>
            ))}
          {tab === "code" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 10, gap: 8 }}>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                spellCheck={false}
                placeholder="Paste a single-file HTML game here, or let the builder write it."
                style={{ ...input, flex: 1, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12.5, resize: "none" }}
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button style={button("ghost")} disabled={code === project.html} onClick={() => setCode(project.html)}>
                  Undo changes
                </button>
                <button style={button("primary")} disabled={code === project.html} onClick={() => save({ html: code })}>
                  Save code
                </button>
              </div>
            </div>
          )}
          {tab === "history" && (
            <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
              {project.versions.length === 0 && <p style={{ color: C.sub }}>No versions yet.</p>}
              {project.versions.map((v, i) => (
                <div key={v.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 4px", borderBottom: `1px solid ${C.line}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.prompt}</div>
                    <div style={{ fontSize: 12, color: C.sub }}>{new Date(v.createdAt).toLocaleString()}</div>
                  </div>
                  {i === 0 ? (
                    <span style={{ fontSize: 13, color: C.mint, fontWeight: 700 }}>Current</span>
                  ) : (
                    <button style={{ ...button("ghost"), padding: "6px 12px", fontSize: 13 }} onClick={() => restore(v.id)}>
                      Go back to this
                    </button>
                  )}
                </div>
              ))}
              <div style={{ marginTop: 20, textAlign: "right" }}>
                <button style={button("danger")} onClick={remove}>
                  Delete project
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
