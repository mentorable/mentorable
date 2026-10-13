import { PixelArrow, PixelStamp } from "../../../ui/PixelIcons.jsx";
import {
  AMBER_TEXT, BORDER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../../../ui/tokens.js";
import { Button, Notice, SR_ONLY } from "../../../ui/kit.jsx";
import Spinner from "../../../common/Spinner.jsx";
import { QUILL_LINES } from "../../../../lib/agents/registry.js";
import { QuillLine } from "./homeParts.jsx";
import { budgetOf } from "./homeUi.js";
import TopicCard from "./TopicCard.jsx";
import NewIdeaCard from "./NewIdeaCard.jsx";

// The ideas half of Quill's desk: the cards, and the three ways one gets
// there. "Find areas in my record" has Quill read the record and name parts
// of the student's life with questions to think about (three searches in
// all; with too little on the record, Quill says so instead of offering it).
// "Brainstorm with Quill" is the guided talk. "Add my own idea" is a blank
// card, free. Before the first card, the three are the whole section.
//
// A control that cannot be used right now stays in place, marked
// aria-disabled, with the reason in words beside it.

/** One of the three ways to an idea. `big`: a tile with a line about it (the
 *  empty desk); otherwise a button in a row. */
function DeskAction({ stamp, label, blurb, big = false, off = false, busy = false, onClick, describedBy }) {
  const ink = useAgentInk();
  const stopped = off || busy;
  const press = () => { if (!stopped) onClick?.(); };
  if (!big) {
    return (
      <button type="button" className={FOCUS_CLASS} onClick={press} aria-disabled={stopped || undefined}
        aria-busy={busy || undefined} aria-describedby={describedBy}
        style={{ minHeight: 44, padding: "0 12px", display: "inline-flex", alignItems: "center", gap: 8,
          borderRadius: RADIUS.control, border: `1.5px solid ${BORDER}`, background: off ? SURFACE : WHITE,
          color: off ? TEXT_MUTED : TEXT_MID, fontFamily: SANS, fontSize: "1rem", fontWeight: 700, lineHeight: 1.25,
          cursor: stopped ? "default" : "pointer", boxSizing: "border-box" }}>
        <span aria-hidden="true" style={{ display: "flex", color: off ? TEXT_MUTED : ink.text }}>
          {busy ? <Spinner size={16} color={ink.text} /> : <PixelStamp kind={stamp} size={16} />}
        </span>
        {label}
      </button>
    );
  }
  return (
    <button type="button" className={FOCUS_CLASS} onClick={press} aria-disabled={stopped || undefined}
      aria-busy={busy || undefined} aria-describedby={describedBy}
      style={{ width: "100%", height: "100%", minHeight: 44, padding: "12px 14px", display: "flex",
        alignItems: "center", justifyContent: "space-between", gap: 12, borderRadius: RADIUS.control, textAlign: "left",
        border: `1.5px solid ${off ? BORDER : ink.soft}`, background: off ? SURFACE : ink.softer, color: TEXT,
        fontFamily: SANS, cursor: stopped ? "default" : "pointer", boxSizing: "border-box" }}>
      <span style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
        <span aria-hidden="true" style={{ color: off ? TEXT_MUTED : ink.onSoft, display: "flex", marginTop: 3 }}>
          {busy ? <Spinner size={16} color={ink.text} /> : <PixelStamp kind={stamp} size={16} />}
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: "1.05rem", fontWeight: 800 }}>{label}</span>
          <span style={{ display: "block", marginTop: 2, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED,
            lineHeight: 1.45 }}>
            {blurb}
          </span>
        </span>
      </span>
      {!off && <span aria-hidden="true" style={{ color: ink.onSoft, display: "inline-flex" }}><PixelArrow size={16} /></span>}
    </button>
  );
}

/**
 * topics: the cards, in board order. linked: a Map of topic id to the essays
 * that grew from it. fresh: a Set of ids that arrived this visit.
 * status: agentsApi.essayStatus(), or null while unknown (nothing is blocked
 * on a count the page does not have).
 * finding: a search of the record is running. findNote: how the last one
 * ended when it did not bring cards ({ message, tone, signIn }).
 * composing: the blank card is out.
 * onAddIdea({ area, notes }) and onDelete(topic) are async and throw an
 * Error whose message is fit to show; onSaveNotes(topic, text) resolves to
 * whether it saved.
 */
export default function IdeasSection({
  topics, linked, fresh, status, finding = false, findNote = null, onDismissFindNote, composing = false,
  onCompose, onCancelCompose, onAddIdea, onFind, onBrainstorm, onSignIn,
  onStatus, onSaveNotes, onDelete, onStartEssay, onOpenEssay, onDirty, headingRef,
}) {
  const ink = useAgentInk();
  const finds = budgetOf(status?.topics);
  const talk = budgetOf(status?.talk);
  const thin = status?.record?.thin === true;
  const noFinds = !!finds && finds.left <= 0;
  const noTalk = !!talk && talk.left <= 0;
  const empty = topics.length === 0 && !composing;

  const findAction = thin ? null : (
    <DeskAction big={empty} stamp="sparkle" label="Find areas in my record" off={noFinds} busy={finding}
      blurb="Quill reads your activities, awards and interview, and names parts of your life with questions to think about."
      onClick={onFind} describedBy={finds ? "eq-finds-left" : undefined} />
  );
  const talkAction = (
    <DeskAction big={empty} stamp="chat" label="Brainstorm with Quill" off={noTalk}
      blurb="A few short questions, one at a time. Your answers land on a card."
      onClick={() => onBrainstorm?.(null)} describedBy={talk ? "eq-talk-left" : undefined} />
  );
  const ownAction = (
    <DeskAction big={empty} stamp="scroll" label="Add my own idea"
      blurb="Already have something in mind? Put it on a card of its own."
      onClick={onCompose} />
  );

  const counts = (finds && !thin) || talk ? (
    <p style={{ margin: "10px 0 0", fontFamily: SANS, fontSize: "0.92rem", fontWeight: 600, color: TEXT_MUTED,
      lineHeight: 1.5, fontVariantNumeric: "tabular-nums" }}>
      {finds && !thin && (
        <span id="eq-finds-left" style={noFinds ? { color: AMBER_TEXT, fontWeight: 700 } : undefined}>
          {/* With the brainstorm turns spent too, the next sentence says what is
              still open: this one must not promise a brainstorm it then takes back. */}
          {noFinds
            ? `No searches of your record left. ${noTalk ? "" : "You can still brainstorm or add your own ideas. "}`
            : `${finds.left} of ${finds.limit} ${finds.limit === 1 ? "search" : "searches"} of your record left. `}
        </span>
      )}
      {talk && (
        <span id="eq-talk-left" style={noTalk ? { color: AMBER_TEXT, fontWeight: 700 } : undefined}>
          {noTalk
            ? "No brainstorm turns left. You can still add your own ideas."
            : `${talk.left} of ${talk.limit} brainstorm turns left.`}
        </span>
      )}
    </p>
  ) : null;

  return (
    <section aria-labelledby="eq-ideas-title" style={{ minWidth: 0 }}>
      <h2 id="eq-ideas-title" ref={headingRef} tabIndex={-1}
        style={{ margin: 0, display: "flex", alignItems: "baseline", gap: 10, fontFamily: SANS, fontSize: "1.45rem",
          fontWeight: 800, color: TEXT, letterSpacing: "-0.01em", lineHeight: 1.3, outline: "none" }}>
        Ideas
        {topics.length > 0 && (
          <span style={{ fontSize: "1.05rem", fontWeight: 600, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
            <span style={SR_ONLY}>, </span>
            {topics.length}
          </span>
        )}
      </h2>

      {empty ? (
        <div style={{ marginTop: 12, background: WHITE, border: `1px dashed ${BORDER}`, borderRadius: RADIUS.card,
          padding: "1.2rem 1.2rem 1.3rem", boxSizing: "border-box" }}>
          <QuillLine style={{ fontWeight: 600, color: TEXT }}>{thin ? QUILL_LINES.thinRecord : QUILL_LINES.ideasEmpty}</QuillLine>
          <p id="eq-ways" style={{ margin: "16px 0 10px", fontFamily: SANS, fontSize: "1rem", fontWeight: 700, color: TEXT_MUTED }}>
            Start with one of these:
          </p>
          <ul aria-labelledby="eq-ways" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))" }}>
            {findAction && <li>{findAction}</li>}
            <li>{talkAction}</li>
            <li>{ownAction}</li>
          </ul>
          {counts}
        </div>
      ) : (
        <>
          <QuillLine style={{ marginTop: 6 }}>{QUILL_LINES.ideasIntro}</QuillLine>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            {findAction}
            {talkAction}
            {ownAction}
          </div>
          {counts}
          {/* With too little on the record, Quill says so where the search would be. */}
          {thin && <QuillLine style={{ marginTop: 10, fontSize: "0.95rem" }}>{QUILL_LINES.thinRecord}</QuillLine>}
        </>
      )}

      {findNote && (
        <Notice tone={findNote.tone} onDismiss={onDismissFindNote} style={{ marginTop: 14 }}
          action={findNote.signIn ? <Button kind="secondary" onClick={onSignIn}>Sign in again</Button> : null}>
          {findNote.message}
        </Notice>
      )}

      {finding && (
        <div role="status" style={{ marginTop: 14, display: "flex", alignItems: "flex-start", gap: 12, background: WHITE,
          borderStyle: "solid", borderWidth: "1px 1px 1px 4px", borderRadius: RADIUS.control,
          borderColor: `${BORDER} ${BORDER} ${BORDER} ${ink.ring}`, padding: "12px 14px" }}>
          <span aria-hidden="true" style={{ display: "flex", marginTop: 4 }}><Spinner size={18} color={ink.text} /></span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", fontWeight: 800, color: TEXT, lineHeight: 1.4 }}>
              Quill is reading your record. This can take half a minute.
            </p>
            <QuillLine style={{ marginTop: 4, fontSize: "0.95rem" }}>{QUILL_LINES.findAreas}</QuillLine>
          </div>
        </div>
      )}

      {(composing || topics.length > 0) && (
        <ul style={{ listStyle: "none", margin: "16px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          {composing && (
            <li><NewIdeaCard onAdd={onAddIdea} onCancel={onCancelCompose} /></li>
          )}
          {topics.map((topic) => (
            <li key={topic.id}>
              <TopicCard topic={topic} essays={linked?.get(topic.id) || []} fresh={!!fresh?.has(topic.id)}
                onStatus={(key) => onStatus?.(topic, key)}
                onSaveNotes={(text) => onSaveNotes?.(topic, text)}
                onDelete={() => onDelete?.(topic)}
                onBrainstorm={() => onBrainstorm?.(topic.id)}
                onStartEssay={() => onStartEssay?.(topic)}
                onOpenEssay={onOpenEssay} onDirty={onDirty} />
            </li>
          ))}
        </ul>
      )}

      {topics.length > 0 && (
        <p style={{ margin: "14px 0 0", fontFamily: SANS, fontSize: "0.92rem", fontWeight: 500, color: TEXT_MUTED,
          lineHeight: 1.5, maxWidth: "62ch" }}>
          Your notes stay on your cards. Quill reads a card&apos;s notes only when you brainstorm that idea.
        </p>
      )}
    </section>
  );
}
