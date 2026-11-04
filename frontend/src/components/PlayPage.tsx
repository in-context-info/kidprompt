import { useEffect, useRef, useState } from "react";
import { api, type GalleryItem } from "../api";
import { Link } from "../router";
import { C, FONT_DISPLAY, button, card } from "../theme";

export function PlayPage({ slug }: { slug: string }) {
  const [game, setGame] = useState<GalleryItem | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    api<GalleryItem>(`games/${encodeURIComponent(slug)}`)
      .then((g) => {
        setGame(g);
        document.title = `${g.title} — KidPrompt`;
        api(`games/${encodeURIComponent(slug)}/play`, { method: "POST" }).catch(() => {});
      })
      .catch(() => setGame(null));
  }, [slug]);

  if (game === undefined) return <p style={{ textAlign: "center", color: C.sub }}>Loading…</p>;
  if (game === null)
    return (
      <div style={{ textAlign: "center", padding: 60 }}>
        <div style={{ fontSize: 48 }}>🙈</div>
        <p>We couldn't find that game.</p>
        <Link to="/" style={button("ghost")}>
          Back to the Arcade
        </Link>
      </div>
    );

  const share = async () => {
    const url = `${window.location.origin}/g/${game.slug}`;
    if (navigator.share) {
      await navigator.share({ title: game.title, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "8px 20px 20px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 34, margin: 0 }}>
            {game.emoji} {game.title}
          </h1>
          <div style={{ color: C.sub, marginTop: 4 }}>
            made by {game.creatorEmoji} {game.creatorNickname}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={button("ghost")} onClick={() => frameRef.current?.requestFullscreen?.()}>
            ⛶ Full screen
          </button>
          <button style={button("primary")} onClick={share}>
            {copied ? "Link copied!" : "🔗 Share"}
          </button>
        </div>
      </div>
      <div style={{ ...card, overflow: "hidden", height: "min(72vh, 720px)" }}>
        <iframe
          ref={frameRef}
          title={game.title}
          src={`/play/${encodeURIComponent(game.slug)}`}
          sandbox="allow-scripts allow-pointer-lock allow-modals"
          allow="fullscreen; autoplay"
          style={{ width: "100%", height: "100%", border: "none", display: "block", background: "#fff" }}
        />
      </div>
      {game.description && <p style={{ color: C.sub, fontSize: 16, lineHeight: 1.5 }}>{game.description}</p>}
    </div>
  );
}
