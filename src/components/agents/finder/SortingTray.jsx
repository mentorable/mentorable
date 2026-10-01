import { useId, useRef, useState } from "react";
import { PixelStamp } from "../PixelIcons.jsx";
import { AMBER_TEXT, BORDER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk } from "../agentUi.js";
import { KIND_LABELS, deadlineLabel, isSoon, moneyLine } from "../../../lib/finder.js";
import { ActionButton } from "./ListingCard.jsx";

// The sorting tray at the top of Talon's board: new finds wait here to be
// saved or dismissed. Each is a compact row (the name, who runs it, the
// deadline and the money, and Save and Dismiss), so the timeline below stays
// close; why it fits and the rest of what Talon read are in the drawer the
// name opens. A find Talon could not confirm on its own page says so in words.
// A saved find moves down to the timeline; a dismissed one leaves for good.
// Only the first few show; the rest are one press away, and each Save or
// Dismiss brings up the next.

function Chevron({ up }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false" shapeRendering="crispEdges"
      style={{ flexShrink: 0, transform: up ? "rotate(180deg)" : "none" }}>
      <path d="M2 4h2v2H2zM4 6h2v2H4zM6 6h2v2H6zM8 4h2v2H8z" fill="currentColor" />
    </svg>
  );
}

const small = { fontFamily: SANS, fontSize: "0.9rem", lineHeight: 1.4, overflowWrap: "anywhere" };

/** One new find. The name is the row's button (it opens the drawer); a click
 *  anywhere else on the text does the same for a mouse. Save and Dismiss sit
 *  beside it, or under it in a narrow column. */
function TrayRow({ item, today, busy, ink, onOpen, onSave, onDismiss }) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const titleRef = useRef(null);
  const soon = isSoon(item, today);
  const money = moneyLine(item);
  const sub = [KIND_LABELS[item.kind] || KIND_LABELS.other, item.provider].filter(Boolean).join(", ");

  const onTextClick = (e) => {
    if (!e.currentTarget.contains(e.target)) return;
    if (e.target.closest("button, a, input, select, textarea, label")) return;
    titleRef.current?.focus({ preventScroll: true });
    onOpen(item);
  };

  return (
    <li style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between",
      gap: "8px 14px", padding: "10px 0", borderTop: `1px solid ${BORDER}`, minWidth: 0 }}>
      <div onClick={onTextClick}
        style={{ flex: "1 1 16rem", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start",
          cursor: "pointer" }}>
        <button ref={titleRef} id={titleId} type="button" className={FOCUS_CLASS} data-title-for={item.id}
          aria-haspopup="dialog" onClick={() => onOpen(item)}
          style={{ padding: 0, margin: 0, border: "none", background: "none", textAlign: "left", cursor: "pointer",
            borderRadius: 4, fontFamily: SANS, fontSize: "1.05rem", fontWeight: 800, color: TEXT, lineHeight: 1.3,
            overflowWrap: "anywhere", maxWidth: "100%" }}>
          {item.title}
        </button>
        {sub && <span style={{ ...small, marginTop: 2, fontWeight: 500, color: TEXT_MUTED }}>{sub}</span>}
        {/* Amber only for a deadline that is close; the words say how close. */}
        <span style={{ ...small, marginTop: 2, fontWeight: 600, color: TEXT_MID, fontVariantNumeric: "tabular-nums" }}>
          <span style={soon ? { fontWeight: 700, color: AMBER_TEXT } : undefined}>{deadlineLabel(item, today)}</span>
          {money && `. ${money}`}
        </span>
        {!item.verified && (
          <span style={{ ...small, marginTop: 4, display: "flex", alignItems: "flex-start", gap: 6, fontWeight: 700,
            color: TEXT_MID }}>
            <span aria-hidden="true" style={{ display: "flex", marginTop: 2 }}><PixelStamp kind="question" size={16} /></span>
            <span>Unconfirmed: check the provider</span>
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <ActionButton primary ink={ink} off={busy} onClick={() => onSave(item)} describedBy={titleId}>Save</ActionButton>
        <ActionButton ink={ink} off={busy} onClick={() => onDismiss(item)} describedBy={titleId}>Dismiss</ActionButton>
      </div>
    </li>
  );
}

/**
 * items: new finds, in board order. pending: a Set of ids with a save in
 * flight. limit: how many show before "Show all". headingRef: the heading,
 * which takes focus when the last row in view leaves. emptyText: what to
 * say when there is nothing to sort. onOpen(item): the drawer. onSave(item),
 * onDismiss(item): the row's buttons.
 */
export default function SortingTray({
  items, today, pending, limit = 3, headingRef, emptyText, onOpen, onSave, onDismiss,
}) {
  const ink = useAgentInk();
  const listId = useId();
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, limit);

  return (
    <section aria-labelledby="tf-tray-title"
      style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card, padding: "12px 14px 14px",
        marginBottom: 30, maxWidth: 900, boxSizing: "border-box", minWidth: 0 }}>
      <h2 id="tf-tray-title" ref={headingRef} tabIndex={-1}
        style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontFamily: SANS, fontSize: "1.15rem",
          fontWeight: 800, color: TEXT, lineHeight: 1.3, outline: "none" }}>
        <span aria-hidden="true" style={{ display: "flex", color: ink.text }}><PixelStamp kind="sparkle" size={16} /></span>
        New finds to sort
        <span style={{ fontWeight: 600, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>{items.length}</span>
      </h2>

      {items.length === 0 ? (
        <p style={{ margin: "6px 0 0", fontFamily: SANS, fontSize: "0.98rem", fontWeight: 600, color: TEXT_MUTED,
          lineHeight: 1.5 }}>
          {emptyText}
        </p>
      ) : (
        <>
          <p style={{ margin: "4px 0 10px", fontFamily: SANS, fontSize: "0.98rem", fontWeight: 500, color: TEXT_MID,
            lineHeight: 1.5, maxWidth: "70ch" }}>
            Save the ones worth a closer look and they move to your timeline, under the month they're due.
            Dismissed ones won't come back.
          </p>
          <ul id={listId} style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {shown.map((item) => (
              <TrayRow key={item.id} item={item} today={today} busy={pending.has(item.id)} ink={ink}
                onOpen={onOpen} onSave={onSave} onDismiss={onDismiss} />
            ))}
          </ul>
          {items.length > limit && (
            <button type="button" className={FOCUS_CLASS} aria-expanded={all} aria-controls={listId}
              onClick={() => setAll((v) => !v)}
              style={{ marginTop: 4, minHeight: 44, padding: "0 16px", display: "inline-flex", alignItems: "center", gap: 8,
                borderRadius: RADIUS.control, border: `1.5px solid ${BORDER}`, background: WHITE, color: TEXT_MID,
                fontFamily: SANS, fontSize: "0.95rem", fontWeight: 800, cursor: "pointer" }}>
              <Chevron up={all} />
              {all ? "Show fewer" : `Show all ${items.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
