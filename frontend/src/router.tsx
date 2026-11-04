import { useEffect, useState } from "react";

// A tiny pushState router — the app has five screens, not enough to justify a
// routing library.
export function navigate(to: string) {
  window.history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

export function usePath(): string {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return path.replace(/\/+$/, "") || "/";
}

export function Link(props: { to: string; style?: React.CSSProperties; className?: string; children: React.ReactNode }) {
  return (
    <a
      href={props.to}
      className={props.className}
      style={{ textDecoration: "none", ...props.style }}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        navigate(props.to);
      }}
    >
      {props.children}
    </a>
  );
}
