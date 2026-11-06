import { api, type Me } from "../api";
import { Link, navigate } from "../router";
import { C, FONT_DISPLAY, button } from "../theme";

export function Header({ me, onLoggedOut }: { me: Me | null | undefined; onLoggedOut: () => void }) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "14px 20px",
        maxWidth: 1180,
        width: "100%",
        margin: "0 auto",
      }}
    >
      <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img src="/favicon.svg" alt="" width={34} height={34} />
        <span className="kp-brand-text" style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 24, color: C.ink }}>
          Kid<span style={{ color: C.coral }}>Prompt</span>
        </span>
      </Link>
      <nav className="kp-nav" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Link to="/" className="kp-nav-play" style={{ padding: "8px 12px", fontWeight: 600, color: C.sub }}>
          Play
        </Link>
        {me ? (
          <>
            <Link to="/studio" style={{ ...button("primary"), display: "inline-block" }}>
              My Studio
            </Link>
            <button
              style={button("ghost")}
              onClick={async () => {
                await api("logout", { method: "POST" }).catch(() => {});
                onLoggedOut();
                navigate("/");
              }}
            >
              Log out
            </button>
          </>
        ) : me === null ? (
          <>
            <Link to="/login" style={{ padding: "8px 12px", fontWeight: 600, color: C.sub }}>
              Log in
            </Link>
            <Link to="/try" style={{ ...button("primary"), display: "inline-block" }}>
              Try it free
            </Link>
          </>
        ) : null}
      </nav>
    </header>
  );
}
