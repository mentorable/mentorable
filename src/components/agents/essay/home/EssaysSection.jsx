import { PixelStamp } from "../../../ui/PixelIcons.jsx";
import {
  AMBER_TEXT, BORDER, FOCUS_CLASS, PRESS_CLASS, RADIUS, SANS, TEXT, TEXT_MUTED, WHITE, useAgentInk,
} from "../../../ui/tokens.js";
import { SR_ONLY } from "../../../ui/kit.jsx";
import { QUILL_LINES } from "../../../../lib/agents/registry.js";
import { ESSAYS_MAX } from "../../../../lib/essay.js";
import { QuillLine } from "./homeParts.jsx";
import { budgetOf } from "./homeUi.js";
import EssayCard from "./EssayCard.jsx";

// The essays half of Quill's desk: a card for each essay, the one last
// worked on first, and the way to start another. A student keeps at most 8;
// at 8 the button stays in place and says why it is off.

/**
 * essays: rows without their text (loadHome), newest work first.
 * status: agentsApi.essayStatus(), or null while unknown.
 * oneColumn: the cards stack (the desk's narrow column); otherwise they sit
 * side by side where there is room.
 * onNew(): open the new-essay sheet. onOpen(essay): go to its page.
 */
export default function EssaysSection({ essays, status, oneColumn = false, today = new Date(), onNew, onOpen }) {
  const ink = useAgentInk();
  const budget = budgetOf(status?.essays);
  const limit = budget?.limit || ESSAYS_MAX;
  const full = essays.length >= limit || (!!budget && budget.left <= 0);

  return (
    <section aria-labelledby="eq-essays-title" style={{ minWidth: 0 }}>
      <h2 id="eq-essays-title"
        style={{ margin: 0, display: "flex", alignItems: "baseline", gap: 10, fontFamily: SANS, fontSize: "1.45rem",
          fontWeight: 800, color: TEXT, letterSpacing: "-0.01em", lineHeight: 1.3 }}>
        Your essays
        <span style={{ fontSize: "1.05rem", fontWeight: 600, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
          <span style={SR_ONLY}>, </span>
          {essays.length} of {limit}
        </span>
      </h2>

      {essays.length > 0 && <QuillLine style={{ marginTop: 6 }}>{QUILL_LINES.essaysIntro}</QuillLine>}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 14px", marginTop: 14 }}>
        <button type="button" className={`${FOCUS_CLASS} ${full ? "" : PRESS_CLASS}`}
          aria-disabled={full || undefined} aria-describedby={full ? "eq-essays-full" : undefined}
          onClick={() => { if (!full) onNew?.(); }}
          style={{ minHeight: 48, padding: "0 22px", display: "inline-flex", alignItems: "center", gap: 9,
            borderRadius: RADIUS.control, border: full ? `1.5px solid ${BORDER}` : "none",
            background: full ? "#e9e6e1" : ink.button.bg, color: full ? TEXT_MUTED : ink.button.fg,
            fontFamily: SANS, fontSize: "1.05rem", fontWeight: 800, cursor: full ? "not-allowed" : "pointer" }}>
          <PixelStamp kind="sparkle" size={16} />
          New essay
        </button>
        {full && (
          <span id="eq-essays-full" style={{ flex: "1 1 220px", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700,
            color: AMBER_TEXT, lineHeight: 1.45 }}>
            You have {limit} essays, the most Quill keeps. Open one and delete it to start another.
          </span>
        )}
      </div>

      {essays.length === 0 ? (
        <div style={{ marginTop: 14, background: WHITE, border: `1px dashed ${BORDER}`, borderRadius: RADIUS.card,
          padding: "1.2rem", boxSizing: "border-box" }}>
          <QuillLine style={{ fontWeight: 600, color: TEXT }}>{QUILL_LINES.essaysEmpty}</QuillLine>
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: "16px 0 0", padding: 0, display: "grid", gap: 14,
          gridTemplateColumns: oneColumn ? "minmax(0, 1fr)" : "repeat(auto-fill, minmax(min(100%, 300px), 1fr))" }}>
          {essays.map((essay) => (
            <li key={essay.id} style={{ minWidth: 0 }}>
              <EssayCard essay={essay} today={today} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
