import { C, SANS } from "./kit.js";

// The owner's switch between the page's options, shown only with
// `?compare=1`: a small fixed card, each letter a link to the same URL with
// that one parameter changed (compare=1 kept), the current one in accent
// with a 4px square under it.

const GROUPS = [
  { name: "hero", label: "Hero", values: ["a", "b", "c"] },
  { name: "features", label: "Features", values: ["a", "b", "c"] },
  { name: "close", label: "Close", values: ["a", "b"] },
];

function hrefFor(current, name, value) {
  const params = new URLSearchParams();
  for (const g of GROUPS) params.set(g.name, g.name === name ? value : current[g.name]);
  params.set("compare", "1");
  return `${window.location.pathname}?${params.toString()}`;
}

export default function OptionsBar({ hero = "a", features = "a", close = "a" }) {
  const current = { hero, features, close };
  return (
    <div role="navigation" aria-label="Page options" style={{ position: "fixed", left: 16, bottom: 16, zIndex: 120, background: "#ffffff",
      border: `1px solid ${C.line}`, borderRadius: 12, padding: "8px 14px", display: "flex", alignItems: "center", gap: "4px 18px",
      flexWrap: "wrap", maxWidth: "calc(100vw - 32px)", boxSizing: "border-box",
      fontFamily: SANS, fontSize: "0.9rem", fontWeight: 700, color: C.ink }}>
      {GROUPS.map((g) => (
        <span key={g.name} style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <span>{g.label}</span>
          {g.values.map((v) => {
            const on = current[g.name] === v;
            return (
              <a key={v} href={hrefFor(current, g.name, v)} aria-current={on ? "true" : undefined}
                style={{ position: "relative", color: on ? C.accent : C.mid, textDecoration: "none", padding: "6px 4px 10px", lineHeight: 1 }}>
                {v}
                {on && <span aria-hidden="true" style={{ position: "absolute", left: "50%", bottom: 3, width: 4, height: 4, marginLeft: -2, background: C.accent }} />}
              </a>
            );
          })}
        </span>
      ))}
    </div>
  );
}
