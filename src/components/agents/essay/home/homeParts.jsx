import { useEffect, useRef, useState } from "react";
import { PixelStamp } from "../../../ui/PixelIcons.jsx";
import {
  AMBER_TEXT, BORDER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../../../ui/tokens.js";
import { CHOICE_CLASS, SR_ONLY } from "../../../ui/kit.jsx";
import { SpeechBubble, TAIL_AT } from "../../../ui/SpeechBubble.jsx";
import { SKEL_CLASS } from "../../outreach/BoardUi.js";

// Small pieces shared by Quill's home: the fold chevron, a choice row for the
// sheets, the character counter, a plain line in Quill's voice, the header
// every sheet opens with, and the loading skeleton.

/** A pixel chevron, pointing down (or up). Decorative. */
export function Chevron({ up = false }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false" shapeRendering="crispEdges"
      style={{ flexShrink: 0, transform: up ? "rotate(180deg)" : "none" }}>
      <path d="M2 4h2v2H2zM4 6h2v2H4zM6 6h2v2H6zM8 4h2v2H8z" fill="currentColor" />
    </svg>
  );
}

/** "42 / 600", amber once within 10% of the cap. Never red: the box stops at
 *  the cap by itself. */
export function CharCount({ n, max, id }) {
  return (
    <span id={id} style={{ fontFamily: SANS, fontSize: "0.9rem", fontWeight: 600, fontVariantNumeric: "tabular-nums",
      whiteSpace: "nowrap", flexShrink: 0, color: n > max * 0.9 ? AMBER_TEXT : TEXT_MUTED }}>
      {n} / {max}
      <span style={SR_ONLY}> characters</span>
    </span>
  );
}

/** One of Quill's lines as plain text, where the mascot is not the one saying
 *  it (a section's intro, an empty state). Screen readers hear whose it is. */
export function QuillLine({ children, style, as: Tag = "p" }) {
  return (
    <Tag style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.6,
      maxWidth: "62ch", overflowWrap: "anywhere", ...style }}>
      <span style={SR_ONLY}>Quill: </span>
      {children}
    </Tag>
  );
}

/**
 * Quill's own voice on the night desk: the pixel speech bubble under the
 * scene, its tail aimed up at the owl. `center`: how far the owl's middle is
 * from the right edge of the page column (NightScene perches it there).
 */
export function QuillSays({ children, center = 120 }) {
  const ref = useRef(null);
  const [wide, setWide] = useState(560);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setWide(Math.min(560, el.clientWidth || 560));
    read();
    if (typeof ResizeObserver === "undefined") return undefined;
    const watch = new ResizeObserver(read);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ display: "flex", justifyContent: "flex-end", paddingTop: 18, marginTop: -14 }}>
      <SpeechBubble side="top" tailAt={Math.max(TAIL_AT, Math.round(wide - center - 5))}
        style={{ width: "min(560px, 100%)" }}>
        <span style={SR_ONLY}>Quill says: </span>
        {children}
      </SpeechBubble>
    </div>
  );
}

/**
 * A choice in a list where one is picked: a real radio (hidden, so the row
 * draws its own mark) inside a label that is the whole 44px target. `detail`
 * shows under the label; children show under that only while it is chosen.
 * `autoFocusMark`: where a sheet's focus lands when it opens (Sheet.jsx).
 */
export function RadioRow({ name, checked, onChange, label, detail, children, disabled = false, autoFocusMark = false }) {
  const ink = useAgentInk();
  return (
    <label className={CHOICE_CLASS}
      style={{ display: "flex", alignItems: "flex-start", gap: 12, minHeight: 44, boxSizing: "border-box",
        padding: "10px 12px", borderRadius: RADIUS.control, cursor: disabled ? "default" : "pointer",
        border: `1.5px solid ${checked ? ink.ring : BORDER}`, background: checked ? ink.softer : WHITE,
        opacity: disabled ? 0.6 : 1 }}>
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} style={SR_ONLY}
        data-autofocus={autoFocusMark || undefined} />
      {/* The mark is a ring that fills, so the choice never rests on colour alone. */}
      <span aria-hidden="true" style={{ flexShrink: 0, width: 20, height: 20, marginTop: 2, borderRadius: "50%",
        boxSizing: "border-box", border: `2px solid ${checked ? ink.ring : "#8a857c"}`, background: WHITE,
        display: "flex", alignItems: "center", justifyContent: "center" }}>
        {checked && <span style={{ width: 10, height: 10, borderRadius: "50%", background: ink.button.bg }} />}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontFamily: SANS, fontSize: "1rem", fontWeight: checked ? 800 : 700, color: TEXT,
          lineHeight: 1.4, overflowWrap: "anywhere" }}>
          {label}
        </span>
        {detail && (
          <span style={{ display: "block", marginTop: 2, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 500,
            color: TEXT_MUTED, lineHeight: 1.5, overflowWrap: "anywhere" }}>
            {detail}
          </span>
        )}
        {checked && children}
      </span>
    </label>
  );
}

/** A sheet's first row: its title (the dialog's name) and a way out. */
export function SheetHeader({ id, title, onClose, closeLabel = "Close", closeOff = false }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, margin: "0 0 14px" }}>
      <h2 id={id} style={{ margin: 0, paddingTop: 8, fontFamily: SANS, fontWeight: 800, fontSize: "1.35rem", color: TEXT,
        letterSpacing: "-0.01em", lineHeight: 1.25, overflowWrap: "anywhere" }}>
        {title}
      </h2>
      <button type="button" className={FOCUS_CLASS} onClick={closeOff ? undefined : onClose} aria-label={closeLabel}
        aria-disabled={closeOff || undefined}
        style={{ flexShrink: 0, width: 44, height: 44, margin: "-2px -6px 0 0", display: "inline-flex", alignItems: "center",
          justifyContent: "center", border: "none", borderRadius: 10, background: "rgba(20,20,19,0.05)", color: TEXT_MID,
          cursor: closeOff ? "default" : "pointer" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
          strokeLinecap="round" aria-hidden="true" focusable="false">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

/** A small label over a group of lines inside a card (not a heading: the
 *  card's own title is the heading). */
export function SmallLabel({ children, id, stamp, style }) {
  const ink = useAgentInk();
  return (
    <p id={id} style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontFamily: SANS, fontSize: "0.95rem",
      fontWeight: 800, color: TEXT_MID, lineHeight: 1.4, ...style }}>
      {stamp && <span aria-hidden="true" style={{ display: "flex", color: ink.text }}><PixelStamp kind={stamp} size={16} /></span>}
      {children}
    </p>
  );
}

// ── Loading ──────────────────────────────────────────────────────────────────

function Bar({ w = "100%", h = 14, style }) {
  return <div className={SKEL_CLASS} style={{ width: w, height: h, borderRadius: 6, ...style }} />;
}

/** The desk while it loads: the resume card, the tabs, and a few sheets. */
export function DeskSkeleton() {
  const sheet = (k) => (
    <div key={k} style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card,
      padding: "16px 18px", boxSizing: "border-box" }}>
      <Bar w="55%" h={18} />
      <Bar w="85%" style={{ marginTop: 12 }} />
      <Bar w="70%" style={{ marginTop: 8 }} />
      <Bar h={8} style={{ marginTop: 14 }} />
    </div>
  );
  return (
    <div aria-hidden="true">
      <div style={{ marginTop: 18, background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card,
        padding: "18px 20px", boxSizing: "border-box" }}>
        <Bar w="30%" h={14} />
        <Bar w="55%" h={22} style={{ marginTop: 10 }} />
        <Bar h={8} style={{ marginTop: 16 }} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
        <Bar w={120} h={44} style={{ borderRadius: 999 }} />
        <Bar w={90} h={44} style={{ borderRadius: 999 }} />
      </div>
      <div style={{ display: "grid", gap: 16, marginTop: 14, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))" }}>
        {[0, 1, 2].map(sheet)}
      </div>
    </div>
  );
}
