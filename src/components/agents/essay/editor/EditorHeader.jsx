import { useEffect, useRef, useState } from "react";
import { ESSAY_STATUS } from "../../../../lib/essay.js";
import { PixelArrow } from "../../../ui/PixelIcons.jsx";
import { INPUT_CLASS, SR_ONLY, inputStyle, textOnPage } from "../../../ui/kit.jsx";
import { BORDER, FOCUS_CLASS, SANS, TEXT_MUTED, WHITE, useAgentInk } from "../../../ui/tokens.js";
import { useIsMobile } from "../../../../hooks/useIsMobile.js";
import MoreMenu from "./MoreMenu.jsx";
import { TITLE_MAX } from "./editorUi.js";

// The top of the editor: the way back to Quill's desk, the essay's title
// (typed straight into, like a document's name), where the essay stands, and
// a small menu for the rarer things (saved versions, delete).
//
// The title field never sends an empty title: the database will not take
// one. Emptied and left, it goes back to the last title that was saved.

/** The way back, as on the other agents' pages. */
export function BackLink({ onClick, children }) {
  const ink = useAgentInk();
  return (
    <button type="button" className={FOCUS_CLASS} onClick={onClick}
      style={{ minHeight: 44, display: "inline-flex", alignItems: "center", gap: 8, margin: "0 0 4px -8px", padding: "0 8px",
        border: "none", background: "none", borderRadius: 10, cursor: "pointer", fontFamily: SANS, fontSize: "0.95rem",
        fontWeight: 700, color: textOnPage(ink) }}>
      <PixelArrow size={16} style={{ transform: "scaleX(-1)" }} />
      {children}
    </button>
  );
}

function TitleField({ value, onCommit, small, locked }) {
  const ink = useAgentInk();
  const [text, setText] = useState(value);
  const focused = useRef(false);

  // The saved title changed from outside this box (the essay loaded): show it,
  // unless the student is in the middle of typing one.
  useEffect(() => { if (!focused.current) setText(value); }, [value]);

  const change = (e) => {
    const next = e.target.value;
    setText(next);
    const clean = next.replace(/\s+/g, " ").trim();
    if (clean && clean !== value) onCommit?.(clean);
  };
  const blur = () => {
    focused.current = false;
    setText(value);
  };

  return (
    <input className={INPUT_CLASS} type="text" value={text} maxLength={TITLE_MAX} readOnly={locked} aria-label="Essay title"
      autoComplete="off" onFocus={() => { focused.current = true; }} onBlur={blur} onChange={change}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      style={{ ...inputStyle, flex: "1 1 260px", minWidth: 0, width: "auto", fontWeight: 800,
        letterSpacing: "-0.02em", lineHeight: 1.2, padding: "8px 12px",
        // index.css holds every input at 16px on a small screen, so the large
        // title is a laptop's. Small text needs the stronger of the two accent
        // inks, and a border to say it can be typed in.
        fontSize: small ? "1rem" : "1.75rem", color: small ? ink.text : ink.title,
        background: small ? WHITE : "transparent", border: `1.5px solid ${small ? BORDER : "transparent"}` }} />
  );
}

/**
 * title, status: as they are on screen. kindLine: "Personal statement" or
 * "Supplement for <school>". onTitle(text), onStatus(key): the student changed
 * one. onBack: to Quill's desk. menuItems: see MoreMenu. locked: the essay is
 * gone, so nothing here can be changed.
 */
export default function EditorHeader({ title, status, kindLine, locked = false, onTitle, onStatus, onBack, menuItems }) {
  // The title's look follows the rule in index.css that holds inputs at 16px,
  // which runs up to and including 768px wide. The app's own "phone" test
  // stops a pixel short of that, and at exactly 768 the two disagreed: the
  // laptop's borderless title, shrunk to 16px.
  const small = useIsMobile(769);
  return (
    <header style={{ margin: "0 0 16px" }}>
      <BackLink onClick={onBack}>Quill's desk</BackLink>
      <h1 style={SR_ONLY}>{title || "Essay"}</h1>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px", marginLeft: small ? 0 : -12 }}>
        <TitleField value={title} onCommit={onTitle} small={small} locked={locked} />
        {/* On a phone the title fills the row and these two wrap onto the next
            one. The auto margin keeps them against the right edge there too
            (beside the title it changes nothing: the title takes the room).
            The "more" menu opens leftward from its button, so a button left
            at the start of the row put the first 40px of the menu off screen. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: "auto" }}>
          <label htmlFor="qe-status" style={SR_ONLY}>Where this essay stands</label>
          <select id="qe-status" className={INPUT_CLASS} value={status} disabled={locked}
            onChange={(e) => onStatus?.(e.target.value)}
            style={{ ...inputStyle, width: "auto", minHeight: 44, padding: "8px 12px", fontWeight: 700, cursor: "pointer" }}>
            {ESSAY_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          {!locked && menuItems?.length > 0 && <MoreMenu items={menuItems} label="More for this essay" />}
        </div>
      </div>
      {kindLine && (
        <p style={{ margin: "6px 0 0", fontFamily: SANS, fontSize: "0.98rem", fontWeight: 600, color: TEXT_MUTED,
          overflowWrap: "anywhere" }}>
          {kindLine}
        </p>
      )}
    </header>
  );
}
