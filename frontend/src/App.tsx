import { useCallback, useEffect, useState } from "react";
import { api, type Me } from "./api";
import { usePath } from "./router";
import { Header } from "./components/Header";
import { Home } from "./components/Home";
import { PlayPage } from "./components/PlayPage";
import { AuthScreen } from "./components/AuthScreen";
import { Studio } from "./components/Studio";
import { Editor } from "./components/Editor";
import { About } from "./components/About";
import { TryIt } from "./components/TryIt";

export function App() {
  const path = usePath();
  // undefined = still checking, null = logged out
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  const refreshMe = useCallback(async () => {
    try {
      setMe(await api<Me>("me"));
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  let screen: React.ReactNode;
  if (path.startsWith("/g/")) screen = <PlayPage slug={decodeURIComponent(path.slice(3))} />;
  else if (path === "/login" || path === "/signup")
    screen = <AuthScreen mode={path === "/signup" ? "signup" : "login"} onAuthed={refreshMe} />;
  else if (path === "/about") screen = <About />;
  else if (path === "/try") screen = me ? <Studio me={me} onMeChange={refreshMe} /> : me === null ? <TryIt /> : null;
  else if (path === "/studio" || path.startsWith("/studio/")) {
    if (me === undefined) screen = null;
    else if (me === null) screen = <AuthScreen mode="login" onAuthed={refreshMe} />;
    else if (path === "/studio") screen = <Studio me={me} onMeChange={refreshMe} />;
    else screen = <Editor id={path.slice("/studio/".length)} me={me} onMeChange={refreshMe} />;
  } else screen = <Home me={me} />;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Header me={me} onLoggedOut={() => setMe(null)} />
      <main style={{ flex: 1, animation: "screenIn 0.25s ease" }} key={path}>
        {screen}
      </main>
      <footer style={{ textAlign: "center", padding: "28px 16px", fontSize: 13, color: "#6E6578" }}>
        Made with ❤️ for kids, family, and friends · <a href="/about">How it works & safety</a>
      </footer>
    </div>
  );
}
