import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { lighten, readableOn } from "../../../lib/theme.js";
import { BORDER, RADIUS, SANS, TEXT, WHITE, useAgentInk } from "../agentUi.js";
import { FLASH_CLASS } from "./flowUi.jsx";

// The email body, with every claim about the recipient highlighted. A plain
// textarea can't color parts of its text, so the highlights live on a mirror
// behind it: a div with the same text, font, padding, width and wrapping,
// scrolled in step with the textarea. The textarea's own background is
// transparent, so the marks show through under the real text. The mirror's
// text is transparent, so only the marks are seen.
//
// A claim is found in the body the way the backend grounded it
// (draft.ground_claims): its words in order, any whitespace between them,
// case and quote style aside. Edit a claim's words away and its highlight goes.

const QUOTE_CLASS = { "'": "['‘’]", "‘": "['‘’]", "’": "['‘’]",
  '"': "[\"“”]", "“": "[\"“”]", "”": "[\"“”]" };
const escapeChar = (ch) => QUOTE_CLASS[ch] || ch.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");

function claimPattern(text) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  try {
    return new RegExp(words.map((w) => [...w].map(escapeChar).join("")).join("\\s+"), "gi");
  } catch {
    return null;
  }
}

/** Where each claim sits in the body: [{ index, start, end, inner }] sorted
 *  by start, never overlapping, plus `missing`: the indexes of claims whose
 *  words are no longer in the body.
 *
 *  Two facts can share words ("your lab studies coral bleaching in the
 *  Florida Keys" and "coral bleaching in the Florida Keys"). A mark can't sit
 *  inside another, so when a claim's words are only found inside (or across)
 *  a fact already marked, the two share one mark: `index` is the fact that
 *  owns it and `inner` lists the others it holds. Those are still in the
 *  email, so they are never reported missing. */
export function findClaimRanges(body, claims) {
  let ranges = [];
  const missing = [];
  const overlapping = (s, e) => ranges.filter((r) => s < r.end && e > r.start);
  (claims || []).forEach((claim, index) => {
    const re = claimPattern(claim?.text);
    let free = null;
    let shared = null;
    if (re && typeof body === "string") {
      for (const m of body.matchAll(re)) {
        if (!m[0]) continue;
        const at = { start: m.index, end: m.index + m[0].length };
        if (!overlapping(at.start, at.end).length) { free = at; break; }
        if (!shared) shared = at;
      }
    }
    if (free) { ranges.push({ index, ...free, inner: [] }); return; }
    if (!shared) { missing.push(index); return; }
    const hits = overlapping(shared.start, shared.end);
    const owner = hits.reduce((a, b) => (b.index < a.index ? b : a));
    ranges = ranges.filter((r) => !hits.includes(r));
    ranges.push({
      index: owner.index,
      start: Math.min(shared.start, ...hits.map((r) => r.start)),
      end: Math.max(shared.end, ...hits.map((r) => r.end)),
      inner: [...hits.flatMap((r) => [r.index, ...r.inner]).filter((i) => i !== owner.index), index],
    });
  });
  ranges.sort((a, b) => a.start - b.start);
  return { ranges, missing };
}

/** The claim indexes a range stands for: its own and any it holds. */
const heldBy = (r) => [r.index, ...(r.inner || [])];

// The focus ring is drawn inside the box (outlineOffset -3): the wrapper
// clips anything outside it.
//
// Everything that decides where a line wraps, shared by the textarea and its
// mirror. Change one, change both, or the highlights drift off their words.
// 16px, not 1rem: index.css forces inputs and textareas to 16px on phones
// (no iOS zoom), and the mirror has to match that exactly.
const METRICS = {
  fontFamily: SANS, fontSize: "16px", fontWeight: 500, lineHeight: 1.65, letterSpacing: "normal",
  wordSpacing: "normal", tabSize: 4, textTransform: "none", textIndent: 0, fontVariantLigatures: "normal",
  whiteSpace: "pre-wrap", overflowWrap: "break-word", wordBreak: "normal", padding: "14px 16px",
  boxSizing: "border-box", margin: 0, border: "none", textAlign: "left",
};
const MIN_HEIGHT = 260;
const MAX_HEIGHT = 620;

/** The textarea's inner box (padding in, scrollbar out), to the fraction of
 *  a pixel. clientWidth rounds: on a phone the textarea can be 308.6px wide
 *  while clientWidth says 309, and that sliver lets the mirror fit a word on
 *  a line the textarea wraps, so every highlight after it lands off its
 *  words. The computed width is exact and ignores transforms. */
function innerBox(el) {
  const cs = getComputedStyle(el);
  const w = parseFloat(cs.width);
  const h = parseFloat(cs.height);
  // No border on the textarea, so these differences are just its scrollbars.
  return {
    w: Number.isFinite(w) ? w - (el.offsetWidth - el.clientWidth) : el.clientWidth,
    h: Number.isFinite(h) ? h - (el.offsetHeight - el.clientHeight) : el.clientHeight,
  };
}
const NAV_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

/**
 * value / onChange: the body. ranges: from findClaimRanges. activeIndex: the
 * claim linked to the rail right now. onActivate(index, { fromKey }): the
 * caret landed inside a highlighted claim (a click, or the arrow keys moving
 * into one; walking through the same claim key by key reports it once).
 * focusRequest: { index, nonce } asks the editor to scroll to a claim and
 * flash it (a rail item was clicked).
 */
export default function ClaimEditor({
  id, value, onChange, ranges, activeIndex = null, onActivate, focusRequest, readOnly = false, maxLength,
  describedBy, labelledBy, disabled = false,
}) {
  const ink = useAgentInk();
  const area = useRef(null);
  const mirror = useRef(null);
  const marks = useRef(new Map());
  const lastHit = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [flash, setFlash] = useState(null);   // { index, nonce }

  // A fact has to be seen at a glance, dim screen or not: a real tint of the
  // accent (black text stays 11:1 or better on it) and an underline in the
  // accent ink at 3:1 or better on that tint. The linked fact gets a deeper
  // tint and a thicker line, so it is not told apart by color alone.
  const look = useMemo(() => {
    const rest = lighten(ink.accent, 0.72);
    const on = lighten(ink.accent, 0.6);
    return { rest, on, restLine: readableOn(ink.accent, rest, 3), onLine: readableOn(ink.accent, on, 3) };
  }, [ink.accent]);

  // Grow with the text up to a cap, then scroll inside.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    const want = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, el.scrollHeight));
    el.style.height = `${want}px`;
    el.style.overflowY = el.scrollHeight > want + 1 ? "auto" : "hidden";
  }, [value]);

  // The mirror matches the textarea's inner box: its width leaves out a
  // scrollbar when one shows, or the lines would wrap at different words.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return undefined;
    const measure = () => {
      const now = innerBox(el);
      setBox((b) => (b.w === now.w && b.h === now.h ? b : now));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const now = innerBox(el);
    setBox((b) => (b.w === now.w && b.h === now.h ? b : now));
  }, [value]);

  const sync = useCallback(() => {
    if (area.current && mirror.current) {
      mirror.current.scrollTop = area.current.scrollTop;
      mirror.current.scrollLeft = area.current.scrollLeft;
    }
  }, []);
  useLayoutEffect(sync, [value, box, sync]);

  // Caret inside a claim: link it to its source on the rail. A click always
  // does; the arrow keys only as the caret moves into a claim, so walking
  // through one word by word doesn't set it off again at every step.
  const checkCaret = (fromKey = false) => {
    const el = area.current;
    if (!el || !onActivate || el.selectionStart !== el.selectionEnd) return;
    const at = el.selectionStart;
    const hit = ranges.find((r) => at >= r.start && at <= r.end);
    const index = hit ? hit.index : null;
    if (hit && (!fromKey || index !== lastHit.current)) onActivate(hit.index, { fromKey });
    lastHit.current = index;
  };

  // A rail item was clicked: bring its words into view and flash them.
  useEffect(() => {
    if (!focusRequest) return;
    const el = area.current;
    const mark = marks.current.get(focusRequest.index);
    if (!el || !mark) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollTop = Math.max(0, mark.offsetTop - el.clientHeight / 3);
    sync();
    const rect = mark.getBoundingClientRect();
    if (rect.top < 90 || rect.bottom > window.innerHeight - 90) {
      window.scrollBy({ top: rect.top - window.innerHeight / 3, behavior: reduce ? "auto" : "smooth" });
    }
    setFlash({ index: focusRequest.index, nonce: focusRequest.nonce });
  }, [focusRequest, sync]);

  // The mirror's content: the body cut into plain runs and marks.
  const parts = [];
  let pos = 0;
  ranges.forEach((r) => {
    if (r.start > pos) parts.push(value.slice(pos, r.start));
    const held = heldBy(r);
    const on = held.includes(activeIndex);
    const flashing = flash && held.includes(flash.index);
    parts.push(
      <mark key={`m-${r.index}-${flashing ? flash.nonce : 0}`} data-claim={r.index}
        className={flashing ? FLASH_CLASS : undefined}
        ref={(n) => held.forEach((i) => { if (n) marks.current.set(i, n); else marks.current.delete(i); })}
        style={{ color: "transparent", background: on ? look.on : look.rest, borderRadius: 3,
          boxShadow: `inset 0 ${on ? -3 : -2}px 0 ${on ? look.onLine : look.restLine}` }}>
        {value.slice(r.start, r.end)}
      </mark>,
    );
    pos = r.end;
  });
  if (pos < value.length) parts.push(value.slice(pos));
  // A textarea shows an empty last line after a trailing newline; a div does not.
  if (value.endsWith("\n")) parts.push(" ");

  return (
    <div style={{ position: "relative", background: disabled ? "#fbfaf8" : WHITE, border: `1.5px solid ${BORDER}`,
      borderRadius: RADIUS.control, overflow: "hidden" }}>
      <div ref={mirror} aria-hidden="true"
        style={{ ...METRICS, position: "absolute", top: 0, left: 0, width: box.w || "100%", height: box.h || "100%",
          overflow: "hidden", color: "transparent", pointerEvents: "none", userSelect: "none" }}>
        {parts}
      </div>
      <textarea ref={area} id={id} value={value} readOnly={readOnly} disabled={disabled} maxLength={maxLength}
        aria-describedby={describedBy} aria-labelledby={labelledBy} spellCheck
        onChange={(e) => onChange?.(e.target.value)} onScroll={sync} onClick={() => checkCaret(false)}
        onKeyUp={(e) => { if (NAV_KEYS.has(e.key)) checkCaret(true); }}
        className="oa-input"
        style={{ ...METRICS, position: "relative", display: "block", width: "100%", minHeight: MIN_HEIGHT, resize: "none",
          background: "transparent", color: TEXT, caretColor: TEXT, outlineOffset: -3, borderRadius: RADIUS.control - 2 }} />
    </div>
  );
}
