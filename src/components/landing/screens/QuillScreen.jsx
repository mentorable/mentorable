import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import NightScene from "../../agents/essay/home/NightScene.jsx";
import ChecksStrip from "../../agents/essay/editor/ChecksStrip.jsx";
import NoteCard from "../../agents/essay/editor/NoteCard.jsx";
import { buildReview } from "../../agents/essay/editor/reviewModel.js";
import { CHIP_CLASS, TYPE_CLASS, markVars, plural } from "../../agents/essay/editor/editorUi.js";
import { Card } from "../../ui/kit.jsx";
import { BG, SANS, TEXT, TEXT_MUTED, useAgentInk } from "../../ui/tokens.js";
import { QUILL_LINES } from "../../../lib/agents/registry.js";
import { clamp01, seg, smooth, useReduce } from "../kit.js";
import { ESSAY, ESSAY_BODY, ESSAY_REVIEW } from "../data.js";

// Quill's screen for the agents band (PLAN.md 6.4.7): the real night band,
// the review header, the real seven-check strip resolving check by check,
// then the version Quill read with one sentence highlighted and the real
// note card beside it. A note is a quote plus a question; nothing here ever
// shows replacement text. One step; a pure function of t:
//   0         the header and the strip with every check "Not checked"
//   .05-.17   the checks resolve left to right, 90ms apart
//   .3        the paper (the paragraph before the sentence, then the sentence)
//   .4-.58    Quill thinks; the highlight sweeps under the sentence
//   .6        the numbered square "2" appears in one frame
//   .7        the note for it slides in
//   .9        Quill back to idle
// The review's date line is written out ("Read Oct 18 at 6:12 PM"): the
// app formats it in the reader's own time zone, which a mockup must not do.

const noop = () => {};
const W8 = 800;   // the app's own heading weight inside the recreated review
const CHECK_AT = 0.05;   // the first check resolves here...
const CHECK_GAP = 0.02;  // ...and the rest 90ms apart (of a 4.5s play)
const READ_AT = "Oct 18 at 6:12 PM";

/** An element's top inside `ancestor`, by offsetTop (unaffected by transforms). */
function offsetWithin(el, ancestor) {
  let y = 0;
  let n = el;
  while (n && n !== ancestor) { y += n.offsetTop; n = n.offsetParent; }
  return y;
}

export default function QuillScreen({ step = 0, t = 0, layout = "desktop", still = false }) {
  void step;   // a single step
  const reduce = useReduce();
  const ink = useAgentInk();
  const mobile = layout === "mobile";
  const tt = clamp01(t);
  const tr = (v) => (reduce ? "none" : v);

  // ── The review, laid out by the app's own model ───────────────────────────
  const model = useMemo(() => buildReview(ESSAY_REVIEW, ESSAY_BODY), []);
  const note = useMemo(() => model.notes.find((n) => n.number === 2) || model.notes[0] || null, [model]);
  const checkLabel = useMemo(() => model.checks.find((c) => c.key === note?.check)?.label || "", [model, note]);
  // The paragraph before the quoted sentence, as the essay has it.
  const before = useMemo(() => {
    const paras = String(ESSAY_BODY || "").split(/\n\s*\n/);
    const at = note ? paras.findIndex((p) => p.trim() === note.quote) : -1;
    return at > 0 ? paras[at - 1] : paras[0] || "";
  }, [note]);

  // ── Beats ──────────────────────────────────────────────────────────────────
  const resolved = tt < CHECK_AT ? 0 : Math.min(model.checks.length, Math.floor((tt - CHECK_AT) / CHECK_GAP) + 1);
  const checks = useMemo(() => model.checks.map((c, i) => (i < resolved ? c : { ...c, verdict: "none", line: "", notes: [] })),
    [model, resolved]);
  const shown = resolved >= 2 ? "specificity" : "prompt";
  const paperIn = tt >= 0.3;
  const sweep = seg(tt, 0.4, 0.58);
  const marked = tt >= 0.4;
  const chip = tt >= 0.6;
  const noteIn = tt >= 0.7;
  const quill = tt >= 0.4 && tt < 0.9 ? "thinking" : "idle";

  // ── Scrolling: to the paper at .3, and on a phone to the note at .7 ───────
  const scrollerRef = useRef(null);
  const paperRef = useRef(null);
  const sentenceRef = useRef(null);
  const latest = useRef(tt);
  latest.current = tt;
  const apply = useCallback((now) => {
    const sc = scrollerRef.current;
    const paper = paperRef.current;
    if (!sc || !paper) return;
    const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
    const clampY = (y) => Math.max(0, Math.min(max, Math.round(y)));
    const toPaper = clampY(offsetWithin(paper, sc) - 2);
    let y = toPaper * smooth(seg(now, 0.3, 0.4));
    if (mobile && sentenceRef.current && now >= 0.7) {
      const toNote = clampY(offsetWithin(sentenceRef.current, sc) - 16);
      y = toPaper + (toNote - toPaper) * smooth(seg(now, 0.7, 0.8));
    }
    y = Math.round(y);
    if (sc.scrollTop !== y) sc.scrollTop = y;
  }, [mobile]);
  useLayoutEffect(() => { apply(tt); });
  useLayoutEffect(() => {
    const sc = scrollerRef.current;
    if (!sc || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => apply(latest.current));
    ro.observe(sc);
    if (sc.firstElementChild) ro.observe(sc.firstElementChild);
    return () => ro.disconnect();
  }, [apply]);

  // ── Layout ─────────────────────────────────────────────────────────────────
  const pad = mobile ? 12 : 16;
  const side = mobile ? 12 : 24;
  const bandH = mobile ? 150 : 200;
  const lowerTop = pad + bandH + 14;
  const vars = markVars(ink);
  // The highlight sweeps in word by word (the sentence wraps, so a width
  // alone would not read left to right): a tint and a 2px line in the accent,
  // the app's own highlight look.
  const words = useMemo(() => String(note?.quote || "").split(/(?<=\s)/), [note]);
  const lit = marked ? Math.round(sweep * words.length) : 0;
  const mark = { background: vars["--qe-tint"], boxShadow: `inset 0 -2px 0 ${vars["--qe-line"]}`, padding: "2px 0" };

  const paper = (
    <Card ref={paperRef} as="section" style={{ padding: mobile ? 16 : "16px 24px", minWidth: 0 }}>
      <div className={TYPE_CLASS} style={{ ...vars, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {before}
        {"\n\n"}
        <span ref={sentenceRef}>
          {chip && <span aria-hidden="true" className={CHIP_CLASS}>{note?.number ?? 2}</span>}
          {words.map((w, i) => <span key={i} style={i < lit ? mark : undefined}>{w}</span>)}
        </span>
      </div>
    </Card>
  );

  const noteCard = note && (
    <div style={{ opacity: noteIn ? 1 : 0, transform: noteIn ? "none" : "translateY(8px)",
      transition: tr("opacity 240ms ease, transform 240ms cubic-bezier(.2,0,0,1)") }}>
      <NoteCard note={note} checkLabel={checkLabel} response={null} answer="" active register={noop}
        onAnswer={noop} onAnswerBlur={noop} onDismiss={noop} onRestore={noop} />
    </div>
  );

  return (
    <div className="ui-page" style={{ position: "absolute", inset: 0, overflow: "hidden", background: BG, fontFamily: SANS,
      "--ag-ring": ink.ring }}>
      <div style={{ padding: `${pad}px ${side}px 0` }}>
        <NightScene headingAs="p" isMobile={mobile} animate={!still} state={quill}
          says={mobile ? null : QUILL_LINES.reviewReady(model.notes.length)} />
      </div>

      <div ref={scrollerRef} style={{ position: "absolute", top: lowerTop, left: 0, right: 0, bottom: 0, overflow: "hidden",
        padding: `0 ${side}px 24px`, boxSizing: "border-box" }}>
        <header style={{ margin: "0 0 14px" }}>
          {/* The app's h1, drawn as a <p>: the landing page has one h1, the hero's. */}
          <p style={{ margin: 0, fontFamily: SANS, fontWeight: W8, fontSize: mobile ? "1.6rem" : "2rem", color: ink.title,
            letterSpacing: "-0.02em", lineHeight: 1.15, overflowWrap: "anywhere" }}>
            {ESSAY.title}
          </p>
          <h2 style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "1.3rem", fontWeight: W8, color: TEXT, display: "inline-block" }}>
            Quill's review
          </h2>
          <p style={{ margin: "2px 0 0", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.55,
            fontVariantNumeric: "tabular-nums" }}>
            Read {READ_AT}, {plural(ESSAY_REVIEW.word_count, "word")}
          </p>
        </header>

        <ChecksStrip checks={checks} shown={shown} compact={mobile} onPick={noop} onOpenNote={noop} />

        <div style={{ marginTop: 18, opacity: paperIn ? 1 : 0, transition: tr("opacity 240ms ease") }}>
          {mobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {paper}
              {noteCard}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 24, alignItems: "start" }}>
              {paper}
              {noteCard}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
