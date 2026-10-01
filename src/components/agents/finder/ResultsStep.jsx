import { useState } from "react";
import { MascotSays } from "../SpeechBubble.jsx";
import { PixelArrow } from "../PixelIcons.jsx";
import { BORDER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE } from "../agentUi.js";
import { Button } from "../outreach/flowUi.jsx";
import { TALON_LINES } from "../../../lib/agents/registry.js";
import ListingCard from "./ListingCard.jsx";
import { TALON } from "./finderUi.js";

// The end of a find: what Talon kept, as cards the student can Save or
// Dismiss right here (both are free, and both are already on the board as
// New finds), how many were already on the board, and a "Left out"
// disclosure naming everything Talon dropped and why, so nothing is quietly
// hidden.

/**
 * outcome: { items, dropped: [{ title, reason, message }], already }.
 * pending: a Set of item ids being saved. onSave(item), onDismiss(item).
 * onBoard(): to the board. onMore(): another find, or null when none is left.
 * moreNote: why "Find more" is missing, or null.
 */
export default function ResultsStep({ outcome, today, pending, onSave, onDismiss, onBoard, onMore, moreNote }) {
  const [open, setOpen] = useState(false);
  const items = outcome.items || [];
  const dropped = outcome.dropped || [];
  const already = outcome.already || 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <MascotSays agent={TALON} state="celebrating" size={88} layout="auto">
        {TALON_LINES.results(items.length)}
      </MascotSays>

      <div style={{ fontFamily: SANS, fontSize: "0.98rem", fontWeight: 600, color: TEXT_MID, lineHeight: 1.55 }}>
        <p style={{ margin: 0 }}>
          They're all on your board under New finds. Save the ones worth a closer look, and dismiss the rest so they never
          come back.
        </p>
        {already > 0 && (
          <p style={{ margin: "6px 0 0" }}>
            {already} {already === 1 ? "was" : "were"} already on your board, so Talon left {already === 1 ? "it" : "them"} out.
          </p>
        )}
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12,
        gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))" }}>
        {items.map((item) => (
          <li key={item.id} style={{ minWidth: 0 }}>
            <ListingCard item={item} today={today} busy={pending.has(item.id)} onSave={onSave} onDismiss={onDismiss} />
          </li>
        ))}
      </ul>

      {dropped.length > 0 && (
        <section style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card }}>
          <h3 style={{ margin: 0 }}>
            <button type="button" className={FOCUS_CLASS} aria-expanded={open} aria-controls="tf-dropped"
              onClick={() => setOpen((o) => !o)}
              style={{ width: "100%", minHeight: 52, padding: "12px 16px", display: "flex", alignItems: "center",
                justifyContent: "space-between", gap: 12, border: "none", background: "none", cursor: "pointer",
                borderRadius: RADIUS.card, textAlign: "left", fontFamily: SANS, fontSize: "1.05rem", fontWeight: 800,
                color: TEXT }}>
              Left out ({dropped.length})
              <span aria-hidden="true" style={{ display: "inline-flex", color: TEXT_MID, transform: open ? "rotate(90deg)" : "none" }}>
                <PixelArrow size={16} />
              </span>
            </button>
          </h3>
          {open && (
            <div id="tf-dropped" style={{ padding: "0 16px 16px" }}>
              <p style={{ margin: "0 0 10px", fontFamily: SANS, fontSize: "0.98rem", fontWeight: 600, color: TEXT_MID, lineHeight: 1.55 }}>
                {TALON_LINES.droppedIntro}
              </p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {dropped.map((d, i) => (
                  <li key={`${i}-${d.title}`} style={{ padding: "10px 12px", background: SURFACE, border: `1px solid ${BORDER}`,
                    borderRadius: RADIUS.control, fontFamily: SANS, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                    <span style={{ display: "block", fontSize: "1rem", fontWeight: 700, color: TEXT }}>{d.title || "A listing"}</span>
                    <span style={{ display: "block", marginTop: 2, fontSize: "0.95rem", fontWeight: 500, color: TEXT_MUTED }}>
                      {d.message}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <Button kind="primary" onClick={onBoard}>
          See your board
          <PixelArrow size={16} />
        </Button>
        {onMore && <Button kind="secondary" onClick={onMore}>Find more</Button>}
        {!onMore && moreNote && (
          <span style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED }}>{moreNote}</span>
        )}
      </div>
    </div>
  );
}
