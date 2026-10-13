import { useId, useRef } from "react";
import { PixelArrow, PixelStamp } from "../../../ui/PixelIcons.jsx";
import {
  AMBER_TEXT, BORDER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../../../ui/tokens.js";
import { StampTile } from "../../../ui/kit.jsx";
import { CARD_CLASS } from "../../outreach/BoardUi.js";
import {
  COMMON_APP_PROMPTS, ESSAY_STATUS, KINDS, lengthState, promptLabel, wordBounds,
} from "../../../../lib/essay.js";
import { STONE, dayPhrase } from "./homeUi.js";

// One essay on Quill's desk: what it is called, what it answers, how long it
// is against its limit, where it stands, and when Quill last read it. The
// card shows none of the essay's words: those are read on its own page only.
//
// The title is the card's real button; a click anywhere else on the card
// does the same for a mouse. Over the limit is amber, never red, and always
// said in words as well as shown on the bar.

function Tag({ children, style }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: RADIUS.pill,
      fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800, lineHeight: 1.35, maxWidth: "100%", boxSizing: "border-box",
      ...style }}>
      {children}
    </span>
  );
}

/** The essay's length against its limit: the words, then a bar. A personal
 *  statement's bar also marks where its minimum sits. */
export function WordMeter({ essay }) {
  const ink = useAgentInk();
  const words = Math.max(0, Math.trunc(Number(essay?.word_count) || 0));
  const { min, max } = wordBounds(essay);
  const state = lengthState(essay, words);
  const over = state === "over";
  const count = `${words.toLocaleString("en-US")} of ${max.toLocaleString("en-US")} words`;
  const line = state === "empty"
    ? (min ? `No words yet. The range is ${min} to ${max}.` : `No words yet. The limit is ${max}.`)
    : over ? `${count}. ${(words - max).toLocaleString("en-US")} over the limit.`
    : state === "under" ? `${count}. The minimum is ${min}.`
    : count;
  const fill = Math.min(100, Math.round((words / max) * 100));

  return (
    <div>
      <p style={{ margin: 0, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, lineHeight: 1.45,
        color: over ? AMBER_TEXT : TEXT_MID, fontVariantNumeric: "tabular-nums" }}>
        {line}
      </p>
      <div aria-hidden="true" style={{ position: "relative", height: 8, marginTop: 6, borderRadius: 4, background: STONE }}>
        <div style={{ width: `${fill}%`, height: "100%", borderRadius: 4,
          // Striped when over, so the bar does not rest on its colour.
          background: over
            ? `repeating-linear-gradient(135deg, ${AMBER_TEXT} 0 6px, #b9722a 6px 12px)`
            : ink.button.bg }} />
        {min !== null && (
          <span style={{ position: "absolute", top: -3, bottom: -3, left: `${Math.round((min / max) * 100)}%`, width: 2,
            background: TEXT_MUTED }} />
        )}
      </div>
    </div>
  );
}

/**
 * essay: an essays row without its text, with `last_review_at` (loadHome:
 * a timestamp, null for never, undefined for unknown).
 * today: a Date. onOpen(essay): go to its page.
 */
export default function EssayCard({ essay, today = new Date(), onOpen }) {
  const ink = useAgentInk();
  const uid = useId();
  const titleId = `${uid}-title`;
  const titleRef = useRef(null);

  const supplement = essay.kind === "supplement";
  const kind = KINDS.find((k) => k.key === essay.kind)?.label || "Essay";
  const status = ESSAY_STATUS.find((s) => s.key === essay.status)?.label || "";
  const what = promptLabel(essay);
  const promptText = typeof essay.prompt_text === "string" ? essay.prompt_text.trim() : "";
  // What it answers, in a line: the school and the prompt they pasted, or the
  // Common App prompt by number and its short name.
  const picked = supplement ? null : COMMON_APP_PROMPTS.find((p) => p.key === essay.prompt_key) || null;
  const answers = supplement ? what : picked ? `${what}: ${picked.short}` : "";
  // "Last read by Quill today", or that it has not read it; a date that
  // cannot be read still says it was read. Nothing at all when the page could
  // not find out (undefined: loadHome's read of the reviews failed).
  const readLine = essay.last_review_at === undefined ? ""
    : !essay.last_review_at ? "Not read by Quill yet"
      : `Last read by Quill ${dayPhrase(essay.last_review_at, today)}`.trim();

  const onCardClick = (e) => {
    if (e.target.closest("button, a, input, select, textarea, label")) return;
    titleRef.current?.focus({ preventScroll: true });
    onOpen?.(essay);
  };

  const line = { margin: 0, fontFamily: SANS, fontSize: "0.95rem", lineHeight: 1.5, overflowWrap: "anywhere" };

  return (
    <article aria-labelledby={titleId} className={CARD_CLASS} onClick={onCardClick}
      style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card, boxSizing: "border-box",
        minWidth: 0, height: "100%", padding: "14px 16px 12px", display: "flex", flexDirection: "column", cursor: "pointer" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <StampTile kind={supplement ? "resume" : "notebook"} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 id={titleId} style={{ margin: 0, fontFamily: SANS, fontSize: "1.15rem", fontWeight: 800, color: TEXT,
            lineHeight: 1.3, letterSpacing: "-0.01em", overflowWrap: "anywhere" }}>
            <button ref={titleRef} type="button" className={FOCUS_CLASS} data-essay-title={essay.id}
              onClick={() => onOpen?.(essay)}
              style={{ display: "inline", padding: 0, margin: 0, border: "none", background: "none", textAlign: "left",
                font: "inherit", color: "inherit", cursor: "pointer", borderRadius: 4, overflowWrap: "anywhere" }}>
              {essay.title || "Untitled essay"}
            </button>
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            <Tag style={{ background: SURFACE, color: TEXT_MID, border: `1px solid ${BORDER}` }}>{kind}</Tag>
            {status && (
              <Tag style={essay.status === "done"
                ? { background: ink.softer, color: ink.onSoft, border: `1px solid ${ink.soft}` }
                : { background: WHITE, color: TEXT_MID, border: `1px solid ${BORDER}` }}>
                {essay.status === "done" && <PixelStamp kind="check" size={16} />}
                {status}
              </Tag>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {answers ? (
          <p style={{ ...line, fontWeight: 700, color: TEXT }}>{answers}</p>
        ) : (
          <p style={{ ...line, display: "flex", alignItems: "flex-start", gap: 8, fontWeight: 700, color: TEXT_MID }}>
            <span aria-hidden="true" style={{ display: "flex", marginTop: 3, flexShrink: 0 }}><PixelStamp kind="question" size={16} /></span>
            <span>No prompt picked yet</span>
          </p>
        )}
        {/* A supplement's own prompt, two lines of it: what tells two essays
            for one school apart. */}
        {supplement && promptText && (
          <p style={{ ...line, marginTop: 2, fontWeight: 500, color: TEXT_MUTED, display: "-webkit-box",
            WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {promptText}
          </p>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <WordMeter essay={essay} />
      </div>

      {/* The footer sits at the bottom, so cards in a row line up. */}
      <div style={{ flex: 1 }} />
      <div aria-hidden="true" style={{ height: 2, margin: "12px 0 4px",
        background: "linear-gradient(90deg, #d6d1c9 50%, transparent 50%) left top / 4px 2px repeat-x" }} />
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "2px 12px",
        minHeight: 32 }}>
        <span style={{ ...line, fontSize: "0.92rem", fontWeight: 600, color: TEXT_MUTED }}>
          {readLine}
        </span>
        <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SANS,
          fontSize: "0.95rem", fontWeight: 800, color: ink.text }}>
          Open
          <PixelArrow size={16} />
        </span>
      </div>
    </article>
  );
}
