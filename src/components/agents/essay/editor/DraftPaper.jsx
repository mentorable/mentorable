import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { BODY_MAX } from "../../../../lib/essay.js";
import { Card, SR_ONLY } from "../../../ui/kit.jsx";
import { AMBER_TEXT, SANS } from "../../../ui/tokens.js";
import { PAPER_CLASS, TEXT_CLASS, TYPE_CLASS } from "./editorUi.js";

// The paper: one plain textarea that grows with the essay, so the page
// scrolls and the words never sit in a box inside a box. No formatting, no
// toolbar. The save state and the word count live in the bar above the paper
// (EditorBar), which stays at the top of the screen. It is at the top on
// purpose: a browser keeps the caret on screen by bringing its line to the
// nearest edge, and while typing that edge is the bottom, where a bar would
// sit on top of the very line being written (and where a phone's keyboard is).
//
// The browser's own spellcheck is left exactly as the student has it: nothing
// here turns it on or off, and Quill never offers a correction.
//
// Never set the textarea's value from anywhere but `value`, and never give it
// a key that changes or unmount it to show something else: the caret and the
// undo history live in the element (the page hides the editor behind a review
// rather than unmounting it).

/**
 * value / onChange(text): the essay, as typed. onBlur: the textarea lost
 * focus (the page saves). textRef: the textarea, for the page to focus.
 * locked: the essay is gone, so the words can be read and copied but not
 * changed. (The count and the save state are in EditorBar; the textarea points
 * at the count's sentence by id, qe-count.)
 */
export default function DraftPaper({
  value, onChange, onBlur, textRef, isMobile = false, locked = false,
}) {
  const own = useRef(null);
  const area = textRef || own;
  const box = useRef(null);
  const lastWidth = useRef(0);
  const pad = isMobile ? 18 : 56;

  // A browser keeps the caret on screen by bringing its line to the nearest
  // edge of the window. Scroll padding on the page keeps that line clear of
  // the bar at the top, and gives the line being typed some room above the
  // bottom edge. On a phone that edge is crowded: the nav bar (60px), and
  // floating 12px above it the app's round Feedback button (44px, at the left,
  // where a line of the essay starts; both in MobileNav). At 96px the line
  // parked level with that button, with its first words underneath. The
  // button's top edge is 116px up, so 136px parks the line just above it,
  // plus the safe-area inset the bar and the button are lifted by. Chromium
  // counts scroll padding for this; in a browser that does not, the line only
  // hugs the edge.
  useEffect(() => {
    const root = document.documentElement;
    const before = { top: root.style.scrollPaddingTop, bottom: root.style.scrollPaddingBottom };
    root.style.scrollPaddingTop = isMobile ? "104px" : "112px";
    root.style.scrollPaddingBottom = isMobile ? "calc(136px + env(safe-area-inset-bottom, 0px))" : "96px";
    return () => {
      root.style.scrollPaddingTop = before.top;
      root.style.scrollPaddingBottom = before.bottom;
    };
  }, [isMobile]);

  // Grow to fit. The wrapper holds its present height while the textarea is
  // measured: letting it collapse first makes the page jump whenever the essay
  // is taller than the screen.
  const fit = useCallback(() => {
    const el = area.current;
    const wrap = box.current;
    if (!el || !wrap) return;
    wrap.style.minHeight = `${wrap.offsetHeight}px`;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    wrap.style.minHeight = "";
  }, [area]);

  useLayoutEffect(fit, [value, fit]);

  // The lines wrap differently when the column changes width, or when the
  // font arrives after the first paint.
  useEffect(() => {
    const wrap = box.current;
    if (!wrap) return undefined;
    let cancelled = false;
    try { document.fonts?.ready?.then(() => { if (!cancelled) fit(); }); } catch { /* no font loading API */ }
    if (typeof ResizeObserver === "undefined") return () => { cancelled = true; };
    const ro = new ResizeObserver(() => {
      const w = wrap.clientWidth;
      // No width: the editor is hidden behind a review. It keeps the height it
      // had, so the page is the same length when it comes back.
      if (!w || w === lastWidth.current) return;
      lastWidth.current = w;
      fit();
    });
    ro.observe(wrap);
    return () => { cancelled = true; ro.disconnect(); };
  }, [fit]);

  const full = value.length >= BODY_MAX;

  return (
    <Card as="section" aria-labelledby="qe-paper-title" className={PAPER_CLASS}
      style={{ padding: `${isMobile ? 24 : 44}px ${pad}px ${isMobile ? 24 : 40}px` }}>
      <h2 id="qe-paper-title" style={SR_ONLY}>Your essay</h2>
      <div ref={box}>
        <textarea ref={area} id="qe-body" className={`${TYPE_CLASS} ${TEXT_CLASS}`} value={value}
          maxLength={BODY_MAX} readOnly={locked} aria-labelledby="qe-paper-title"
          aria-describedby={full ? "qe-count qe-full" : "qe-count"}
          placeholder="Start writing here. It saves as you go."
          onChange={(e) => onChange?.(e.target.value)} onBlur={onBlur}
          style={{ minHeight: isMobile ? "46vh" : "54vh" }} />
      </div>
      {full && (
        <p id="qe-full" role="status" style={{ margin: "12px 0 0", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700,
          color: AMBER_TEXT, lineHeight: 1.5 }}>
          This essay is at {BODY_MAX.toLocaleString("en-US")} characters, the most one essay holds here. Anything typed or
          pasted past that is not kept.
        </p>
      )}
    </Card>
  );
}
