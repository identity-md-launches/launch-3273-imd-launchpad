import { useEffect, useState } from "react";

/** Hash routing: a static export has no server to rewrite paths. */
export function parseHash() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, q = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  return { path, parts, query: new URLSearchParams(q) };
}
export function useRoute() {
  const [r, setR] = useState(parseHash);
  useEffect(() => {
    const f = () => { setR(parseHash()); window.scrollTo(0, 0); };
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  return r;
}
