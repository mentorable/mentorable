import { interpolate } from "remotion";
import { BG, BORDER, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE } from "../../brand/brand.js";
import { KindTag, SourceLink, TrustBadge } from "./parts.jsx";
import { deadlineLabel } from "./data.js";

// One find opened from the board: agents/finder/ListingDrawer.jsx as a phone
// shows it, full screen. Trust and freshness first (whether Talon read the
// facts on the provider's own page, and when), the link to that page, then
// the facts, why it fits, who it's for and what to send.
//
// `p` (0..1) is the open: the app slides the panel up 32px and fades it in
// over 0.26 s, the backdrop over 0.18 s. Lay it over a screen as its
// `overlay`, so it covers the page under the status bar.

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };
const ESSAY_RE = /\b(essay|personal statement|statement of purpose|short answer|writing sample)\b/i;

function Section({ title, children }) {
  return (
    <section style={{ marginTop: 22 }}>
      <h3 style={{ margin: 0, fontFamily: SANS, fontSize: "1.05rem", fontWeight: 800, color: TEXT }}>{title}</h3>
      <div style={{ marginTop: 8 }}>{children}</div>
    </section>
  );
}

/**
 * item: a finder_items row (data.js asItems), plus optional `eligibility`
 * and `requirements` lists. p: how far open (0 closed, 1 open).
 */
export function ListingDrawer({ item, p = 1 }) {
  if (!item || p <= 0) return null;
  // The panel is opaque within the first third of the open (the app's ease
  // gets it most of the way there as fast), so the page under it never reads
  // as a crossfade for more than a frame; the slide finishes the move.
  const panel = interpolate(p, [0, 0.3], [0, 1], CLAMP);
  const text = { fontFamily: SANS, fontSize: "1rem", color: TEXT, lineHeight: 1.55, margin: 0, overflowWrap: "anywhere" };
  const facts = [
    { label: "Offered by", value: item.provider },
    { label: "Deadline", value: deadlineLabel(item) },
    { label: "Amount", value: item.amount_text || "Not listed on its page" },
  ];
  const requirements = item.requirements || [];
  const essay = requirements.some((r) => ESSAY_RE.test(r));
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 20, fontFamily: SANS, lineHeight: 1.5 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(20,20,19,0.42)",
        opacity: interpolate(p, [0, 0.7], [0, 1], CLAMP) }} />
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "100%", background: BG,
        boxShadow: "-12px 0 40px rgba(20,20,19,0.18)", display: "flex", flexDirection: "column", boxSizing: "border-box",
        opacity: panel, transform: `translateY(${(1 - p) * 32}px)` }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 12px 12px 20px", background: WHITE,
          borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
            <KindTag />
            <h2 style={{ margin: "8px 0 0", fontSize: "1.3rem", fontWeight: 800, color: TEXT, letterSpacing: "-0.01em",
              lineHeight: 1.25, overflowWrap: "anywhere" }}>
              {item.title}
            </h2>
          </div>
          <span style={{ flexShrink: 0, width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center",
            borderRadius: 10, background: "rgba(20,20,19,0.05)", color: TEXT_MID }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </span>
        </div>

        <div style={{ flex: 1, overflow: "hidden", padding: "16px 20px 24px" }}>
          <div data-badge-row style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px" }}>
            <TrustBadge verified={item.verified} />
            <span style={{ fontSize: "0.95rem", fontWeight: 700, color: TEXT_MUTED }}>{item.checked || "Not checked yet"}</span>
          </div>
          {!item.verified && (
            <p style={{ ...text, marginTop: 8, fontSize: "0.95rem", color: TEXT_MID }}>
              Talon read these details on a page that isn't the provider's own, so check the deadline and the rules
              with the provider before you apply.
            </p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0 16px", marginTop: 10 }}>
            <SourceLink>Open its page</SourceLink>
          </div>

          <div style={{ margin: "12px 0 0", background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.control,
            padding: "4px 14px" }}>
            {facts.map((f, i) => (
              <div key={f.label} style={{ display: "grid", gridTemplateColumns: "1fr", gap: 2, padding: "10px 0",
                borderTop: i ? `1px solid ${BORDER}` : "none" }}>
                <div style={{ fontSize: "0.92rem", fontWeight: 700, color: TEXT_MUTED }}>{f.label}</div>
                <div style={{ fontSize: "1rem", fontWeight: 600, lineHeight: 1.5, color: TEXT, fontVariantNumeric: "tabular-nums" }}>
                  {f.value}
                </div>
              </div>
            ))}
          </div>

          {item.fit_reason && (
            <Section title="Why it fits you"><p style={text}>{item.fit_reason}</p></Section>
          )}
          {item.eligibility?.length > 0 && (
            <Section title="Who it's for">
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {item.eligibility.map((e) => (
                  <li key={e} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: "0.98rem", fontWeight: 600,
                    color: TEXT_MID, lineHeight: 1.5 }}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16, height: 16,
                      marginTop: 3, flexShrink: 0 }}>
                      <span style={{ width: 6, height: 6, background: TEXT_MUTED }} />
                    </span>
                    <span>{e}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Section title="What to send">
            {requirements.length === 0 ? (
              <p style={{ ...text, color: TEXT_MID }}>Talon didn't find a list of requirements. Its page will have them.</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {requirements.map((req) => (
                  <li key={req} style={{ display: "flex", alignItems: "flex-start", gap: 12, background: WHITE,
                    border: `1px solid ${BORDER}`, borderRadius: RADIUS.control, padding: "10px 12px", minHeight: 44,
                    boxSizing: "border-box" }}>
                    <span style={{ flexShrink: 0, width: 22, height: 22, marginTop: 1, borderRadius: 6,
                      border: "2px solid #8a857c", background: WHITE, boxSizing: "border-box" }} />
                    <span style={{ fontSize: "0.98rem", fontWeight: 600, lineHeight: 1.5, color: TEXT_MID }}>{req}</span>
                  </li>
                ))}
              </ul>
            )}
            {essay && (
              <p style={{ ...text, marginTop: 10, fontSize: "0.95rem", color: TEXT_MID }}>
                Talon doesn't write essays. To brainstorm yours, talk it through in Chat.
              </p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
