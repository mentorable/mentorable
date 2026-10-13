import { useEffect, useRef, useState } from "react";
import { PixelStamp } from "../../../ui/PixelIcons.jsx";
import { SR_ONLY } from "../../../ui/kit.jsx";
import { AMBER_TEXT, FOCUS_CLASS, SANS, TEXT_MUTED, useAgentInk } from "../../../ui/tokens.js";

// The quiet line that says where the essay's words are: "Saved", "Saving",
// or "Couldn't save, retrying" (with a way to try at once). A failed save is
// amber, not red: nothing is lost, it is only behind. "Saving paused" is the
// one that needs the student: the essay was changed somewhere else, and the
// page is waiting to be told which copy stays (the choice is at the top of
// the page, and this line leads there).
//
// For screen readers the line is not a live region itself: it changes every
// time typing pauses, and "Saving, Saved" after each sentence would drown the
// essay out. A separate polite region speaks only what matters: that a save
// failed or is paused (and the words are still there), and that saving works
// again.

const failing = (state) => state === "retrying" || state === "stuck" || state === "conflict";

/** state: the autosave's ("idle" | "saving" | "saved" | "retrying" | "stuck"
 *  | "conflict" | "stopped"). onRetry: try the save now. onConflict: show the
 *  choice between the two copies. */
export default function SaveLine({ state, onRetry, onConflict }) {
  const ink = useAgentInk();
  const [said, setSaid] = useState({ text: "", n: 0 });
  const before = useRef(state);

  useEffect(() => {
    const was = before.current;
    before.current = state;
    if (was === state) return;
    let text = "";
    if (state === "retrying") text = "Couldn't save. Your words are still here, and saving will try again.";
    else if (state === "stuck") text = "Not saved. Your words are still here.";
    else if (state === "conflict") text = "Saving is paused: this essay was changed somewhere else. Your words are still here.";
    else if (state === "saved" && failing(was)) text = "Saved.";
    if (text) setSaid((s) => ({ text, n: s.n + 1 }));
  }, [state]);

  const base = { display: "inline-flex", alignItems: "center", gap: 6, minHeight: 24, fontFamily: SANS, fontSize: "0.93rem",
    fontWeight: 700, color: TEXT_MUTED, whiteSpace: "nowrap" };
  const retry = (label, onClick = onRetry) => (
    <button type="button" className={FOCUS_CLASS} onClick={onClick}
      style={{ border: "none", background: "none", padding: "11px 6px", margin: "-11px 0", cursor: "pointer", borderRadius: 8,
        fontFamily: SANS, fontSize: "0.93rem", fontWeight: 800, color: ink.text, textDecoration: "underline",
        textUnderlineOffset: 3 }}>
      {label}
    </button>
  );

  let line;
  if (state === "saving") {
    line = <span style={base}>Saving...</span>;
  } else if (state === "saved") {
    line = (
      <span style={base}>
        <span aria-hidden="true" style={{ display: "flex", color: ink.text }}><PixelStamp kind="check" size={16} /></span>
        Saved
      </span>
    );
  } else if (state === "retrying") {
    line = (
      <span style={{ ...base, color: AMBER_TEXT, whiteSpace: "normal", flexWrap: "wrap" }}>
        <span aria-hidden="true" style={{ display: "flex" }}><PixelStamp kind="clock" size={16} /></span>
        Couldn't save, retrying
        {retry("Try now")}
      </span>
    );
  } else if (state === "stuck") {
    line = (
      <span style={{ ...base, color: AMBER_TEXT, whiteSpace: "normal", flexWrap: "wrap" }}>
        <span aria-hidden="true" style={{ display: "flex" }}><PixelStamp kind="clock" size={16} /></span>
        Not saved
        {retry("Try again")}
      </span>
    );
  } else if (state === "conflict") {
    line = (
      <span style={{ ...base, color: AMBER_TEXT, whiteSpace: "normal", flexWrap: "wrap" }}>
        <span aria-hidden="true" style={{ display: "flex" }}><PixelStamp kind="clock" size={16} /></span>
        Saving paused
        {onConflict && retry("See why", onConflict)}
      </span>
    );
  } else if (state === "stopped") {
    line = <span style={{ ...base, color: AMBER_TEXT }}>Not saving</span>;
  } else {
    line = <span style={base}>Saves as you write</span>;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
      {line}
      <span role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>
        {said.text && <span key={said.n}>{said.text}</span>}
      </span>
    </div>
  );
}
