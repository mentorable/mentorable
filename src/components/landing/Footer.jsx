import { FOCUS_CLASS } from "../ui/tokens.js";
import { C, CONTAINER, GUTTER, SANS, go } from "./kit.js";

// Today's footer, kept: the brand blue, white text, the wordmark, the four
// links with their routes, and the copyright line. A plain edge (the agents
// band is the page's one stepped edge).

const LINKS = [
  { label: "Privacy Policy", to: "/privacy" },
  { label: "Terms of Service", to: "/terms" },
  { label: "X", href: "https://x.com/MentorableAI" },
  { label: "Instagram", href: "https://www.instagram.com/mentorable.ai/" },
];

const FOOT_CSS = `
.lp-foot-link:hover { text-decoration: underline; text-underline-offset: 4px; }
.lp-foot-link:focus-visible { outline: 3px solid #ffffff; outline-offset: 2px; }
@media (max-width: 480px) {
  .lp-foot-links { display: grid !important; grid-template-columns: 1fr 1fr; width: 100%; gap: 12px 24px !important; }
}
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-lp-foot]")) {
  const el = document.createElement("style");
  el.dataset.lpFoot = "";
  el.textContent = FOOT_CSS;
  document.head.appendChild(el);
}

export default function Footer() {
  const linkStyle = { fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: "#ffffff", background: "none", border: "none",
    cursor: "pointer", padding: "8px 0", textDecoration: "none", whiteSpace: "nowrap", minHeight: 44, display: "inline-flex",
    alignItems: "center", borderRadius: 4 };
  return (
    <footer style={{ background: C.accent, color: "#ffffff", padding: `56px ${GUTTER} 32px` }}>
      <div style={{ maxWidth: CONTAINER, margin: "0 auto" }}>
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.15rem", letterSpacing: "-0.04em" }}>mentorable</span>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: "#ffffff", marginBottom: 1 }} />
          </div>
          <p style={{ fontFamily: SANS, fontWeight: 500, fontSize: "0.95rem", color: "#ffffff", lineHeight: 1.6, maxWidth: 360, margin: 0 }}>
            College application help for high school students in the U.S.
          </p>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px 32px",
          paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.3)" }}>
          <div style={{ fontFamily: SANS, fontSize: "0.9rem", fontWeight: 500, color: "#ffffff" }}>© 2026 Mentorable Inc. All rights reserved.</div>
          <div className="lp-foot-links" style={{ display: "flex", flexWrap: "wrap", gap: "8px 24px" }}>
            {LINKS.map((l) => (l.to
              ? <a key={l.label} href={l.to} className={`${FOCUS_CLASS} lp-foot-link`} onClick={(e) => { e.preventDefault(); go(l.to); }} style={linkStyle}>{l.label}</a>
              : <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className={`${FOCUS_CLASS} lp-foot-link`} style={linkStyle}>{l.label}</a>))}
          </div>
        </div>
      </div>
    </footer>
  );
}
