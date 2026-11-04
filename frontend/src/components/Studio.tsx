import { useEffect, useState } from "react";
import { api, type Me, type ProjectSummary } from "../api";
import { Link, navigate } from "../router";
import { C, FONT_DISPLAY, STATUS_LABELS, button, card, input } from "../theme";

const KID_EMOJIS = ["🦄", "🐉", "🦊", "🐼", "🐸", "🦖", "🐙", "🚀", "🌈", "⚡"];
const PROJECT_EMOJIS = ["🎮", "🕹️", "🐱", "🚀", "🧩", "🎨", "🏎️", "🐠", "🌋", "🎵", "🧮", "👾"];

export function Studio({ me, onMeChange }: { me: Me; onMeChange: () => Promise<void> }) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ projects: ProjectSummary[] }>("projects")
      .then((r) => setProjects(r.projects))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "8px 20px" }}>
      <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 36, margin: "8px 0 4px" }}>{me.user.name.split(" ")[0]}'s family studio</h1>
      <p style={{ color: C.sub, margin: "0 0 24px" }}>
        {me.buildsLeftToday} AI builds left today · games go live after a quick review
      </p>
      {error && <p style={{ color: C.danger }}>{error}</p>}

      <Kids me={me} onMeChange={onMeChange} />

      {me.creators.length > 0 && <NewProject me={me} />}

      <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 24, margin: "32px 0 12px" }}>Projects</h2>
      {projects === null ? (
        <p style={{ color: C.sub }}>Loading…</p>
      ) : projects.length === 0 ? (
        <p style={{ color: C.sub }}>No projects yet.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {projects.map((p) => {
            const kid = me.creators.find((c) => c.id === p.creatorId);
            const status = STATUS_LABELS[p.status];
            return (
              <Link key={p.id} to={`/studio/${p.id}`} className="kp-card-link" style={{ ...card, padding: 18, color: C.ink, display: "block", transition: "transform 0.15s" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ fontSize: 36 }}>{p.emoji}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 17, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.title}
                    </div>
                    <div style={{ fontSize: 13, color: C.sub }}>{kid ? `${kid.emoji} ${kid.nickname}` : "No kid picked"}</div>
                  </div>
                </div>
                <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ color: status.color }}>● {status.text}</span>
                  {p.isLive && p.status !== "published" && <span style={{ color: C.mint }}>● Older version live</span>}
                  {p.isLive && <span style={{ color: C.sub, fontWeight: 500 }}>{p.plays} plays</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Kids({ me, onMeChange }: { me: Me; onMeChange: () => Promise<void> }) {
  const [nickname, setNickname] = useState("");
  const [emoji, setEmoji] = useState(KID_EMOJIS[0]);
  const [error, setError] = useState("");

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api("creators", { method: "POST", body: { nickname, emoji } });
      setNickname("");
      await onMeChange();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section style={{ ...card, padding: 20 }}>
      <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 22, margin: "0 0 4px" }}>Creators</h2>
      <p style={{ color: C.sub, margin: "0 0 14px", fontSize: 14 }}>
        Add each kid with a nickname. It shows as “made by” on their games, so skip last names.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {me.creators.map((k) => (
          <span key={k.id} style={{ background: C.soft, borderRadius: 999, padding: "8px 14px", fontWeight: 600 }}>
            {k.emoji} {k.nickname}
          </span>
        ))}
      </div>
      <form onSubmit={add} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={emoji} onChange={(e) => setEmoji(e.target.value)} style={{ ...input, width: 70, fontSize: 20, padding: "8px" }}>
          {KID_EMOJIS.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
        <input style={{ ...input, flex: "1 1 180px", width: "auto" }} placeholder="Nickname, e.g. Mia or Captain Z" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={24} required />
        <button type="submit" style={button(me.creators.length ? "ghost" : "primary")}>
          + Add kid
        </button>
      </form>
      {error && <p style={{ color: C.danger, margin: "10px 0 0" }}>{error}</p>}
    </section>
  );
}

function NewProject({ me }: { me: Me }) {
  const [title, setTitle] = useState("");
  const [creatorId, setCreatorId] = useState(me.creators[0]?.id ?? "");
  const [emoji, setEmoji] = useState(PROJECT_EMOJIS[0]);
  const [kind, setKind] = useState<"game" | "app">("game");
  const [error, setError] = useState("");

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const { id } = await api<{ id: string }>("projects", { method: "POST", body: { title, creatorId, emoji, kind } });
      navigate(`/studio/${id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section style={{ ...card, padding: 20, marginTop: 16, background: `linear-gradient(135deg, #FFF1E0, #FFF8D6)` }}>
      <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 22, margin: "0 0 12px" }}>✨ Make something new</h2>
      <form onSubmit={create} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={emoji} onChange={(e) => setEmoji(e.target.value)} style={{ ...input, width: 70, fontSize: 20, padding: 8 }}>
          {PROJECT_EMOJIS.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
        <input style={{ ...input, flex: "2 1 200px", width: "auto" }} placeholder="Name it! e.g. Space Cat Jumper" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} required />
        <select value={kind} onChange={(e) => setKind(e.target.value as "game" | "app")} style={{ ...input, width: "auto" }}>
          <option value="game">Game</option>
          <option value="app">App</option>
        </select>
        <select value={creatorId} onChange={(e) => setCreatorId(e.target.value)} style={{ ...input, width: "auto" }}>
          {me.creators.map((k) => (
            <option key={k.id} value={k.id}>
              {k.emoji} {k.nickname}
            </option>
          ))}
        </select>
        <button type="submit" style={button("primary")}>
          Create
        </button>
      </form>
      {error && <p style={{ color: C.danger, margin: "10px 0 0" }}>{error}</p>}
    </section>
  );
}
