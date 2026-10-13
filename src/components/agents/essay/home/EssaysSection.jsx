import { PixelStamp } from "../../../ui/PixelIcons.jsx";
import {
  AMBER_TEXT, BORDER, FOCUS_CLASS, PRESS_CLASS, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../../../ui/tokens.js";
import { SR_ONLY } from "../../../ui/kit.jsx";
import { QUILL_LINES } from "../../../../lib/agents/registry.js";
import { ESSAYS_MAX } from "../../../../lib/essay.js";
import { QuillLine } from "./homeParts.jsx";
import { budgetOf } from "./homeUi.js";
import EssayCard from "./EssayCard.jsx";

// The essays tab of Quill's night desk: the essays other than the one being
// resumed above, as sheets of paper, and the way to start another. A student
// keeps at most 8; at 8 the button stays in place and says why it is off.

/** The New essay button. At the limit it stays, says it is off, and says why. */
export function NewEssayButton({ full, limit, onNew, id = "eq-essays-full" }) {
  const ink = useAgentInk();
  return (
    <>
      <button type="button" className={`${FOCUS_CLASS} ${full ? "" : PRESS_CLASS}`}
        aria-disabled={full || undefined} aria-describedby={full ? id : undefined}
        onClick={() => { if (!full) onNew?.(); }}
        style={{ minHeight: 48, padding: "0 22px", display: "inline-flex", alignItems: "center", gap: 9,
          borderRadius: RADIUS.control, border: full ? `1.5px solid ${BORDER}` : "none",
          background: full ? "#e9e6e1" : ink.button.bg, color: full ? TEXT_MUTED : ink.button.fg,
          fontFamily: SANS, fontSize: "1.05rem", fontWeight: 800, cursor: full ? "not-allowed" : "pointer" }}>
        <PixelStamp kind="sparkle" size={16} />
        New essay
      </button>
      {full && (
        <span id={id} style={{ flex: "1 1 220px", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700,
          color: AMBER_TEXT, lineHeight: 1.45 }}>
          You have {limit} essays, the most Quill keeps. Open one and delete it to start another.
        </span>
      )}
    </>
  );
}

/**
 * essays: rows without their text (loadHome), newest work first.
 * skip: the id of the essay the desk is resuming above, left out here.
 * status: agentsApi.essayStatus(), or null while unknown.
 * onNew(): open the new-essay sheet. onOpen(essay): go to its page.
 */
export default function EssaysSection({ essays, skip = null, status, today = new Date(), onNew, onOpen }) {
  const budget = budgetOf(status?.essays);
  const limit = budget?.limit || ESSAYS_MAX;
  const full = essays.length >= limit || (!!budget && budget.left <= 0);
  const others = essays.filter((e) => e.id !== skip);

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

      {essays.length === 0 ? (
        // The desk's invitation above already offers the ways in.
        <p style={{ margin: "14px 0 0", padding: "1rem 1.2rem", background: WHITE, border: `1px dashed ${BORDER}`,
          borderRadius: RADIUS.card, boxSizing: "border-box", fontFamily: SANS, fontSize: "1rem", fontWeight: 600,
          lineHeight: 1.6, color: TEXT_MID }}>
          Essays you start will be kept here.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: "16px 0 0", padding: 0, display: "grid", gap: 16,
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))" }}>
          {others.map((essay) => (
            <li key={essay.id} style={{ minWidth: 0, display: "grid" }}>
              <EssayCard essay={essay} today={today} onOpen={onOpen} look="sheet" />
            </li>
          ))}
          {/* A blank page: the way to the next essay, unless the desk is full. */}
          {!full && (
            <li style={{ minWidth: 0, display: "grid" }}>
              <button type="button" className={FOCUS_CLASS} onClick={() => onNew?.()}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
                  minHeight: 200, padding: 16, boxSizing: "border-box", textAlign: "center", cursor: "pointer",
                  border: "1.5px dashed #b9b3aa", borderRadius: 12, background: "transparent", color: TEXT_MID,
                  fontFamily: SANS }}>
                <PixelStamp kind="sparkle" size={24} />
                <span style={{ fontSize: "1.05rem", fontWeight: 800 }}>A blank page</span>
                <span style={{ fontSize: "0.95rem", fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.5, maxWidth: "24ch" }}>
                  A rough first draft is plenty for me to read.
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
