import { useEffect, useState } from "react";
import { FOCUS_CLASS } from "../ui/tokens.js";
import { C, CONTAINER, GUTTER, NAV_H, SANS, go, scrollToId } from "./kit.js";
import { LpButton, TextLink } from "./frames.jsx";

// The fixed nav: transparent over the page at the top, solid with a hairline
// after 8px of scroll. The wordmark as the app's sidebar draws it, section
// anchors from 1100px up (the one in view turns accent with a 4px square
// under it), and Log in / Get started at the right. No blur, no shadow, no
// hamburger: a phone gets the wordmark and the two actions.

const NAV_CSS = `
.lp-nav-links { display: none; }
@media (min-width: 1100px) { .lp-nav-links { display: flex; } }
.lp-nav-link:hover { color: ${C.ink}; }
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-lp-nav]")) {
  const el = document.createElement("style");
  el.dataset.lpNav = "";
  el.textContent = NAV_CSS;
  document.head.appendChild(el);
}

const ANCHORS = [
  { id: "record", label: "Your record" },
  { id: "colleges", label: "College List" },
  { id: "quest", label: "Quest" },
  { id: "agents", label: "Agents" },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    const read = () => setScrolled(window.scrollY > 8);
    read();
    window.addEventListener("scroll", read, { passive: true });
    return () => window.removeEventListener("scroll", read);
  }, []);

  // The section in view: a 5% band in the middle of the viewport. The
  // sections are siblings mounted in the same commit, but a story section
  // that mounts a beat later (a layout query settling) is picked up by the
  // second pass.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const seen = new Map();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target.id, e.isIntersecting);
      const hit = ANCHORS.find((a) => seen.get(a.id));
      setCurrent(hit ? hit.id : null);
    }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });
    const watched = new Set();
    const observe = () => {
      for (const a of ANCHORS) {
        const el = document.getElementById(a.id);
        if (el && !watched.has(el)) { watched.add(el); io.observe(el); }
      }
    };
    observe();
    const again = setTimeout(observe, 800);
    return () => { clearTimeout(again); io.disconnect(); };
  }, []);

  return (
    <nav aria-label="Site" style={{ position: "fixed", top: 0, left: 0, right: 0, height: NAV_H, zIndex: 100,
      background: scrolled ? C.page : "transparent", borderBottom: `1px solid ${scrolled ? C.line : "transparent"}`,
      transition: "background 200ms ease, border-color 200ms ease", boxSizing: "border-box" }}>
      <div style={{ maxWidth: CONTAINER, margin: "0 auto", height: "100%", padding: `0 ${GUTTER}`, display: "flex",
        alignItems: "center", justifyContent: "space-between", gap: 16, boxSizing: "border-box" }}>
        <a href="/" className={FOCUS_CLASS} onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0 }); }}
          aria-label="Mentorable, top of page"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", minHeight: 44, borderRadius: 6 }}>
          <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.15rem", color: C.accent, letterSpacing: "-0.04em" }}>mentorable</span>
          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, marginBottom: 1 }} />
        </a>

        <div className="lp-nav-links" style={{ alignItems: "center", gap: 28, position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
          {ANCHORS.map((a) => {
            const on = current === a.id;
            return (
              <a key={a.id} href={`#${a.id}`} className={`${FOCUS_CLASS} lp-nav-link`} aria-current={on ? "location" : undefined}
                onClick={(e) => { e.preventDefault(); scrollToId(a.id); }}
                style={{ position: "relative", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: on ? C.accent : C.mid,
                  textDecoration: "none", whiteSpace: "nowrap", padding: "10px 2px", borderRadius: 6, transition: "color 200ms ease" }}>
                {a.label}
                {on && <span aria-hidden="true" style={{ position: "absolute", left: "50%", bottom: 2, width: 4, height: 4, marginLeft: -2, background: C.accent }} />}
              </a>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, whiteSpace: "nowrap" }}>
          <TextLink tone="ink" arrow={null} href="/auth" onClick={(e) => { e.preventDefault(); go("/auth"); }}
            style={{ padding: "0 4px" }}>
            Log in
          </TextLink>
          <LpButton size="sm" onClick={() => go("/auth")}>Get started</LpButton>
        </div>
      </div>
    </nav>
  );
}
