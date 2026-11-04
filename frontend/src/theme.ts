// The single source of truth for KidPrompt's look. Same approach as Echolify:
// Fraunces (display) + Figtree (body), inline style objects, no CSS framework.
// Brighter, warmer colors because the audience is kids.
export const C = {
  bg: "#FFF8EF",
  card: "#FFFFFF",
  ink: "#2A2235",
  sub: "#6E6578",
  line: "#F0E4D4",
  coral: "#FF7A59",
  sun: "#FFB627",
  sky: "#3FA7F5",
  grape: "#8B5CF6",
  mint: "#22B07D",
  danger: "#D8433B",
  soft: "#FFF1E0",
};

export const FONT_DISPLAY = '"Fraunces", Georgia, serif';

export const card: React.CSSProperties = {
  background: C.card,
  borderRadius: 20,
  border: `1px solid ${C.line}`,
  boxShadow: "0 2px 10px rgba(42, 34, 53, 0.05)",
};

export function button(kind: "primary" | "ghost" | "danger" = "primary"): React.CSSProperties {
  const base: React.CSSProperties = {
    border: "none",
    borderRadius: 999,
    padding: "11px 20px",
    fontWeight: 700,
    fontSize: 15,
    transition: "transform 0.1s",
  };
  if (kind === "ghost") return { ...base, background: C.soft, color: C.ink };
  if (kind === "danger") return { ...base, background: "transparent", color: C.danger, padding: "11px 12px" };
  return { ...base, background: `linear-gradient(135deg, ${C.coral}, ${C.sun})`, color: "#fff" };
}

export const input: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 14,
  border: `1.5px solid ${C.line}`,
  background: "#fff",
  color: C.ink,
  outline: "none",
};

export const label: React.CSSProperties = {
  display: "block",
  fontWeight: 600,
  fontSize: 14,
  marginBottom: 6,
};

export const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  draft: { text: "Draft", color: C.sub },
  submitted: { text: "Waiting for review", color: C.sky },
  published: { text: "Live!", color: C.mint },
  rejected: { text: "Needs changes", color: C.danger },
};
