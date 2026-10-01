import { useId, useRef } from "react";
import { PixelStamp } from "../PixelIcons.jsx";
import {
  AMBER_TEXT, BORDER, FOCUS_CLASS, PRESS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../agentUi.js";
import { SourceLink } from "../outreach/flowUi.jsx";
import { CARD_CLASS, NEUTRAL_TAG } from "../outreach/BoardUi.js";
import { TALON_LINES } from "../../../lib/agents/registry.js";
import { KIND_LABELS, deadlineLabel, isSoon, isStale, moneyLine, outcomeLabel } from "../../../lib/finder.js";
import { KEPT, checkedLabel, listOf, plural } from "./finderUi.js";

// One find: what it is and who runs it, the deadline (amber when it is close,
// never red), the money, whether Talon read the facts on the provider's own
// page, and one line on why it fits the student. Used on the results screen
// and on the board.
//
// The title is the card's real button when it opens (the board's drawer); a
// click anywhere else on the card does the same for a mouse. Save and Dismiss
// show only when their handlers are passed (the results screen and the New
// finds tab). They use aria-disabled rather than disabled, so a button that
// was just pressed keeps focus while the save is in flight.

/** A small pill: the kind of listing, or the trust badge. */
function Pill({ children, style }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: RADIUS.pill,
      fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800, lineHeight: 1.35, maxWidth: "100%", boxSizing: "border-box",
      ...style }}>
      {children}
    </span>
  );
}

/** Verified or not, in words and an icon (never colour alone). */
export function TrustBadge({ verified }) {
  const ink = useAgentInk();
  return verified ? (
    <Pill style={{ background: ink.softer, color: ink.onSoft, border: `1px solid ${ink.soft}` }}>
      <PixelStamp kind="check" size={16} />
      Verified on its own page
    </Pill>
  ) : (
    <Pill style={{ background: NEUTRAL_TAG, color: TEXT_MID, border: `1px solid ${BORDER}` }}>
      <PixelStamp kind="question" size={16} />
      Unconfirmed: check the provider
    </Pill>
  );
}

export function KindTag({ kind }) {
  return (
    <Pill style={{ background: SURFACE, color: TEXT_MID, border: `1px solid ${BORDER}`, borderRadius: 6 }}>
      <PixelStamp kind={kind === "scholarship" ? "star" : "sparkle"} size={16} />
      {KIND_LABELS[kind] || KIND_LABELS.other || "Opportunity"}
    </Pill>
  );
}

function ActionButton({ children, onClick, off, current, primary, ink, describedBy }) {
  // `current`: this is already the card's state ("Saved", "Dismissed").
  const look = current
    ? { background: SURFACE, color: TEXT_MUTED, border: `1.5px solid ${BORDER}` }
    : primary
      ? { background: ink.button.bg, color: ink.button.fg, border: `1.5px solid ${ink.button.bg}` }
      : { background: WHITE, color: TEXT_MID, border: `1.5px solid ${BORDER}` };
  return (
    <button type="button" className={`${FOCUS_CLASS} ${primary && !current ? PRESS_CLASS : ""}`}
      aria-disabled={off || current || undefined} aria-busy={(off && !current) || undefined} aria-describedby={describedBy}
      onClick={() => { if (!off && !current) onClick(); }}
      style={{ minHeight: 44, padding: "0 16px", display: "inline-flex", alignItems: "center", gap: 8,
        borderRadius: RADIUS.control, fontFamily: SANS, fontSize: "0.98rem", fontWeight: 700, lineHeight: 1.25,
        cursor: off || current ? "default" : "pointer", ...look }}>
      {children}
    </button>
  );
}

/**
 * item: a finder_items row. today: a Date. onOpen(item): opens the drawer
 * (omit for a card that does not open). onSave(item), onDismiss(item): the
 * Save and Dismiss buttons, shown only when passed. busy: a save is in flight.
 */
export default function ListingCard({ item, today = new Date(), onOpen, onSave, onDismiss, busy = false }) {
  const ink = useAgentInk();
  const uid = useId();
  const titleRef = useRef(null);

  const soon = isSoon(item, today);
  const stale = isStale(item, today);
  const deadline = deadlineLabel(item, today);
  const money = moneyLine(item);
  const confirm = listOf(item.confirm);
  const checked = checkedLabel(item, today);
  // How it went, once the student has marked it done (the Done tab promises it).
  const result = item.status === "done" ? outcomeLabel(item.lane, item.outcome) : "";
  const kept = KEPT.has(item.status);
  const dismissed = item.status === "dismissed";
  const actions = !!(onSave || onDismiss);
  // Dismissed on the results screen: a dashed edge, never faded text (the
  // button says "Dismissed" in words).
  const setAside = dismissed && actions;
  const titleId = `${uid}-title`;

  const onCardClick = (e) => {
    if (!onOpen) return;
    if (e.target.closest("button, a, input, select, textarea, label")) return;
    titleRef.current?.focus({ preventScroll: true });
    onOpen(item);
  };

  const line = { margin: "6px 0 0", fontFamily: SANS, fontSize: "0.95rem", lineHeight: 1.45, overflowWrap: "anywhere" };

  return (
    <article aria-labelledby={titleId} className={onOpen ? CARD_CLASS : undefined} onClick={onCardClick}
      data-card-id={item.id}
      style={{ background: WHITE, borderRadius: RADIUS.card, boxSizing: "border-box", minWidth: 0, height: "100%",
        border: setAside ? "1.5px dashed #b9b3aa" : `1px solid ${stale || soon ? "#f3d9a6" : BORDER}`,
        padding: "14px 16px 12px", display: "flex", flexDirection: "column", cursor: onOpen ? "pointer" : "default" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <KindTag kind={item.kind} />
        <TrustBadge verified={!!item.verified} />
      </div>

      <h3 id={titleId} style={{ margin: "10px 0 0", fontFamily: SANS, fontSize: "1.15rem", fontWeight: 800, color: TEXT,
        lineHeight: 1.3, letterSpacing: "-0.01em", overflowWrap: "anywhere" }}>
        {onOpen ? (
          <button ref={titleRef} type="button" className={FOCUS_CLASS} data-title-for={item.id} aria-haspopup="dialog"
            onClick={() => onOpen(item)}
            style={{ display: "inline", padding: 0, margin: 0, border: "none", background: "none", textAlign: "left",
              font: "inherit", color: "inherit", cursor: "pointer", borderRadius: 4, overflowWrap: "anywhere" }}>
            {item.title}
          </button>
        ) : item.title}
      </h3>
      {item.provider && (
        <p style={{ ...line, margin: "3px 0 0", fontWeight: 500, color: TEXT_MUTED }}>{item.provider}</p>
      )}
      {/* No drawer on the results screen, so what it is shows on the card. */}
      {!onOpen && item.summary && (
        <p style={{ ...line, margin: "8px 0 0", fontWeight: 500, color: TEXT }}>{item.summary}</p>
      )}

      <p style={{ ...line, margin: "10px 0 0", display: "flex", alignItems: "flex-start", gap: 8, fontWeight: 700,
        color: soon ? AMBER_TEXT : TEXT_MID, fontVariantNumeric: "tabular-nums" }}>
        <span aria-hidden="true" style={{ display: "flex", marginTop: 2 }}><PixelStamp kind="clock" size={16} /></span>
        <span>{deadline}</span>
      </p>
      {money && (
        <p style={{ ...line, fontWeight: 600, color: TEXT_MID }}>{money}</p>
      )}
      {result && (
        <p style={{ ...line, display: "flex", alignItems: "flex-start", gap: 8, fontWeight: 800, color: TEXT }}>
          {/* A star for a win only: a check beside "Not this time" would read as a yes. */}
          {item.outcome === "yes" && (
            <span aria-hidden="true" style={{ display: "flex", marginTop: 2 }}>
              <PixelStamp kind="star" size={16} />
            </span>
          )}
          <span>{result}</span>
        </p>
      )}

      {item.fit_reason && (
        <p style={{ ...line, margin: "10px 0 0", color: TEXT, fontWeight: 500 }}>
          <span style={{ fontWeight: 800 }}>Why it fits you: </span>{item.fit_reason}
        </p>
      )}
      {confirm.length > 0 && (onOpen ? (
        <p style={{ ...line, display: "flex", alignItems: "flex-start", gap: 8, fontWeight: 700, color: TEXT_MID }}>
          <span aria-hidden="true" style={{ display: "flex", marginTop: 2 }}><PixelStamp kind="question" size={16} /></span>
          <span>You'd need to confirm {plural(confirm.length, "thing")}</span>
        </p>
      ) : (
        // No drawer to open here, so each line shows in full.
        <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {confirm.map((text, i) => (
            <li key={`${i}-${text}`} style={{ ...line, margin: 0, display: "flex", alignItems: "flex-start", gap: 8,
              fontWeight: 700, color: TEXT_MID }}>
              <span aria-hidden="true" style={{ display: "flex", marginTop: 2, flexShrink: 0 }}><PixelStamp kind="question" size={16} /></span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      ))}
      {stale && (
        <p style={{ ...line, display: "flex", alignItems: "flex-start", gap: 8, fontWeight: 700, color: AMBER_TEXT }}>
          <span aria-hidden="true" style={{ display: "flex", marginTop: 2 }}><PixelStamp kind="clock" size={16} /></span>
          <span>{TALON_LINES.staleNote}</span>
        </p>
      )}

      {/* The footer sits at the bottom, so cards in a row line their buttons up. */}
      <div style={{ flex: 1 }} />
      <div aria-hidden="true" style={{ height: 2, margin: "12px 0 4px",
        background: "linear-gradient(90deg, #d6d1c9 50%, transparent 50%) left top / 4px 2px repeat-x" }} />
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px" }}>
        <SourceLink url={item.url} style={{ fontSize: "0.95rem" }}>Open its page</SourceLink>
        {checked && (
          <span style={{ fontFamily: SANS, fontSize: "0.9rem", fontWeight: 600, color: TEXT_MUTED }}>{checked}</span>
        )}
      </div>
      {actions && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {onSave && (
            <ActionButton primary ink={ink} off={busy} current={kept} onClick={() => onSave(item)} describedBy={titleId}>
              {kept && <PixelStamp kind="check" size={16} />}
              {kept ? "Saved" : "Save"}
            </ActionButton>
          )}
          {onDismiss && (
            <ActionButton ink={ink} off={busy} current={dismissed} onClick={() => onDismiss(item)} describedBy={titleId}>
              {dismissed ? "Dismissed" : "Dismiss"}
            </ActionButton>
          )}
        </div>
      )}
    </article>
  );
}
