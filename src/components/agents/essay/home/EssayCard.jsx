import { useId, useRef } from "react";
import { PixelArrow, PixelStamp } from "../../../ui/PixelIcons.jsx";
import {
  AMBER_TEXT, BG, BORDER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
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

export function Tag({ children, style }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: RADIUS.pill,
      fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800, lineHeight: 1.35, maxWidth: "100%", boxSizing: "border-box",
      ...style }}>
      {children}
    </span>
  );
}

// The sheet lifts a little on hover, its border takes the accent, and the
// "Open" arrow steps forward. (A shadow would be cut off by the folded corner.)
const SHEET_CLASS = "eq-sheet";
const SHEET_CSS = `
.${SHEET_CLASS} { transition: transform 0.18s ease, border-color 0.18s ease; }
.${SHEET_CLASS}:hover { transform: translateY(-3px); border-color: var(--eq-accent) !important; }
.${SHEET_CLASS} .eq-open { transition: transform 0.18s ease; }
.${SHEET_CLASS}:hover .eq-open { transform: translateX(3px); }
@media (prefers-reduced-motion: reduce) {
  .${SHEET_CLASS}, .${SHEET_CLASS} .eq-open { transition: none; }
  .${SHEET_CLASS}:hover, .${SHEET_CLASS}:hover .eq-open { transform: none; }
}
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-essay-sheet]")) {
  const el = document.createElement("style");
  el.dataset.essaySheet = "";
  el.textContent = SHEET_CSS;
  document.head.appendChild(el);
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

/** What an essay answers, in a line: the school for a supplement, or the
 *  Common App prompt by number and its short name. "" when none is picked. */
export function answersOf(essay) {
  const what = promptLabel(essay);
  if (essay.kind === "supplement") return what;
  const picked = COMMON_APP_PROMPTS.find((p) => p.key === essay.prompt_key) || null;
  return picked ? `${what}: ${picked.short}` : "";
}

/** "Last read by Quill today", or that it has not read it. Nothing at all
 *  when the page could not find out (undefined: loadHome's read failed). */
export function readLineOf(essay, today = new Date()) {
  if (essay.last_review_at === undefined) return "";
  if (!essay.last_review_at) return "Not read by Quill yet";
  return `Last read by Quill ${dayPhrase(essay.last_review_at, today)}`.trim();
}

/**
 * essay: an essays row without its text, with `last_review_at` (loadHome:
 * a timestamp, null for never, undefined for unknown).
 * today: a Date. onOpen(essay): go to its page.
 */
export default function EssayCard({ essay, today = new Date(), onOpen, look = "card" }) {
  const ink = useAgentInk();
  const uid = useId();
  const titleId = `${uid}-title`;
  const titleRef = useRef(null);

  const supplement = essay.kind === "supplement";
  const kind = KINDS.find((k) => k.key === essay.kind)?.label || "Essay";
  const status = ESSAY_STATUS.find((s) => s.key === essay.status)?.label || "";
  const promptText = typeof essay.prompt_text === "string" ? essay.prompt_text.trim() : "";
  const answers = answersOf(essay);
  const readLine = readLineOf(essay, today);

  const onCardClick = (e) => {
    if (e.target.closest("button, a, input, select, textarea, label")) return;
    titleRef.current?.focus({ preventScroll: true });
    onOpen?.(essay);
  };

  const line = { margin: 0, fontFamily: SANS, fontSize: "0.95rem", lineHeight: 1.5, overflowWrap: "anywhere" };
  const sheet = look === "sheet";

  const tags = (
    <>
      <Tag style={{ background: SURFACE, color: TEXT_MID, border: `1px solid ${BORDER}` }}>{kind}</Tag>
      {status && (
        <Tag style={essay.status === "done"
          ? { background: ink.softer, color: ink.onSoft, border: `1px solid ${ink.soft}` }
          : { background: WHITE, color: TEXT_MID, border: `1px solid ${BORDER}` }}>
          {essay.status === "done" && <PixelStamp kind="check" size={16} />}
          {status}
        </Tag>
      )}
    </>
  );
  const title = (
    <button ref={titleRef} type="button" className={FOCUS_CLASS} data-essay-title={essay.id}
      onClick={() => onOpen?.(essay)}
      style={{ display: "inline", padding: 0, margin: 0, border: "none", background: "none", textAlign: "inherit",
        font: "inherit", color: "inherit", cursor: "pointer", borderRadius: 4, overflowWrap: "anywhere" }}>
      {essay.title || "Untitled essay"}
    </button>
  );
  const titleStyle = { margin: 0, fontFamily: SANS, fontSize: sheet ? "1.2rem" : "1.15rem", fontWeight: 800, color: TEXT,
    lineHeight: 1.3, letterSpacing: "-0.01em", overflowWrap: "anywhere" };

  return (
    <article aria-labelledby={titleId} className={sheet ? `${CARD_CLASS} ${SHEET_CLASS}` : CARD_CLASS} onClick={onCardClick}
      style={sheet
        // A sheet of paper with a folded top corner, its text centered.
        ? { position: "relative", height: "100%", boxSizing: "border-box", minWidth: 0, display: "flex",
            flexDirection: "column", cursor: "pointer", padding: "16px 16px 10px", textAlign: "center", "--eq-accent": ink.text,
            background: WHITE,
            border: `1px solid ${BORDER}`, borderRadius: "4px 0 12px 12px",
            clipPath: "polygon(0 0, calc(100% - 24px) 0, 100% 24px, 100% 100%, 0 100%)" }
        : { background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card, boxSizing: "border-box",
            minWidth: 0, height: "100%", padding: "14px 16px 12px", display: "flex", flexDirection: "column",
            cursor: "pointer" }}>
      {sheet && (
        <span aria-hidden="true" style={{ position: "absolute", top: -1, right: -1, width: 25, height: 25,
          background: `linear-gradient(225deg, ${BG} 50%, ${ink.soft} 50%)`, borderLeft: `1px solid ${BORDER}`,
          borderBottom: `1px solid ${BORDER}` }} />
      )}
      {sheet ? (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, padding: "0 22px" }}>{tags}</div>
          <h3 id={titleId} style={{ ...titleStyle, marginTop: 10 }}>{title}</h3>
        </>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <StampTile kind={supplement ? "resume" : "notebook"} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id={titleId} style={titleStyle}>{title}</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>{tags}</div>
          </div>
        </div>
      )}

      <div style={{ marginTop: sheet ? 8 : 12 }}>
        {answers ? (
          <p style={{ ...line, fontWeight: 700, color: TEXT }}>{answers}</p>
        ) : (
          <p style={{ ...line, display: "flex", alignItems: "flex-start", justifyContent: sheet ? "center" : "flex-start", gap: 8, fontWeight: 700, color: TEXT_MID }}>
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
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: sheet ? "center" : "space-between",
        gap: "2px 12px", minHeight: 32 }}>
        <span style={{ ...line, fontSize: "0.92rem", fontWeight: 600, color: TEXT_MUTED }}>
          {readLine}
        </span>
        <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SANS,
          fontSize: "0.95rem", fontWeight: 800, color: ink.text }}>
          Open
          <span className="eq-open" style={{ display: "inline-flex" }}><PixelArrow size={16} /></span>
        </span>
      </div>
    </article>
  );
}
