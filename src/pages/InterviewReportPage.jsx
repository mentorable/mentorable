import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { requireUser } from "../lib/auth.js";
import { agentsApi, interviewErrorMessage, needsSignIn } from "../lib/agentsApi.js";
import { POISE_LINES } from "../lib/agents/registry.js";
import { deleteMock, getMock } from "../lib/interview.js";
import { MascotSays } from "../components/agents/SpeechBubble.jsx";
import { HandoffPanel } from "../components/agents/interview/CallStage.jsx";
import { PoiseLine } from "../components/agents/interview/MarshScene.jsx";
import NoteList from "../components/agents/interview/NoteList.jsx";
import ScoreGrid from "../components/agents/interview/ScoreGrid.jsx";
import TranscriptPanel, { showTurn } from "../components/agents/interview/TranscriptPanel.jsx";
import {
  FEEDBACK_TRIES_MAX, HOME_PATH, POISE, UNFINISHED, dayLabel, minutesLabel, modeLabel, scrollBehavior, short, takeNote,
  targetLine, turnsOf,
} from "../components/agents/interview/interviewUi.js";
import { BackLink } from "../components/agents/essay/editor/EditorHeader.jsx";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { PixelStamp } from "../components/ui/PixelIcons.jsx";
import { Button, Card, Notice, SR_ONLY, Sheet, pageStyle } from "../components/ui/kit.jsx";
import { DANGER, SANS, TEXT, TEXT_MID, TEXT_MUTED, useAgentInk } from "../components/ui/tokens.js";
import { useIsMobile } from "../hooks/useIsMobile.js";

// One mock's report (/agents/interview/:mockId): the payoff.
//
// At the top, what it was for, when and how long. Then the four practice
// scores, each "3 of 5" with its reason; Poise's notes on each question (what
// worked, what to try), every one pointing at the student's own words; the
// habits that ran through the whole call; and the transcript beside them on
// a wide screen (under them on a phone). Choosing a quote finds that turn in
// the transcript and marks the words; "Back to the note" returns.
//
// Poise never writes an answer for the student and never says how an
// admission or an offer will go. The page says so once, beside the notes.
// Everything here is the student's alone (RLS), and Delete removes it.
//
// A mock whose notes could not be written shows its transcript and a "Try
// again" while tries remain (free, two per mock). One that was given back
// shows its transcript only.

const REAL_API = {
  requireUser, getMock, deleteMock, takeNote,
  feedback: (id) => agentsApi.interviewFeedback(id),
  finish: (id) => agentsApi.interviewFinish(id),
};

const h2 = { margin: 0, fontFamily: SANS, fontSize: "1.3rem", fontWeight: 800, color: TEXT, letterSpacing: "-0.01em", lineHeight: 1.3 };

export default function InterviewReportPage({ navigate, mockId, api = REAL_API }) {
  const isMobile = useIsMobile();
  const narrow = useIsMobile(1000);    // no room for the transcript beside the notes
  const ink = useAgentInk();
  const [phase, setPhase] = useState("loading");      // loading | ready | notfound | error | handoff
  const [userId, setUserId] = useState(null);
  const [mock, setMock] = useState(null);
  const [note, setNote] = useState(null);             // a line carried from the call page, shown once
  const [highlight, setHighlight] = useState(null);   // { turn, quote }
  const [retrying, setRetrying] = useState(false);
  const [retryNote, setRetryNote] = useState(null);   // { text, tone, signIn }
  const [checking, setChecking] = useState(false);
  const [handoff, setHandoff] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const alive = useRef(true);
  const noted = useRef(false);
  const backTo = useRef(null);         // the quote that led into the transcript
  const handoffRef = useRef(null);

  const load = useCallback(async () => {
    setPhase("loading");
    let user = null;
    try { user = await api.requireUser(); } catch { user = null; }
    if (!alive.current) return;
    if (!user) { navigate?.("/auth"); return; }
    setUserId(user.id);
    try {
      const row = await api.getMock(user.id, mockId);
      if (!alive.current) return;
      if (!row) { setPhase("notfound"); return; }
      setMock(row);
      setPhase("ready");
    } catch (e) {
      console.error("[interview] report load failed:", e?.code || e?.name || "error");
      if (alive.current) setPhase("error");
    }
  }, [api, mockId, navigate]);

  useEffect(() => {
    alive.current = true;
    // The call page's line for this report, taken once (a development double-run keeps it).
    if (!noted.current) { noted.current = true; setNote(api.takeNote(mockId)); }
    load();
    return () => { alive.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A quote was chosen: find its turn once the mark has rendered.
  useEffect(() => {
    if (highlight && Number.isInteger(highlight.turn)) showTurn(highlight.turn);
  }, [highlight]);

  useEffect(() => { if (phase === "handoff") handoffRef.current?.focus(); }, [phase]);

  const jump = (turn, quote) => {
    if (!Number.isInteger(turn)) return;
    backTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setHighlight({ turn, quote: quote || "" });
  };
  const back = () => {
    const el = backTo.current;
    if (!el || !document.contains(el)) return;
    try { el.scrollIntoView({ block: "center", behavior: scrollBehavior() }); } catch { /* old browsers */ }
    el.focus({ preventScroll: true });
  };

  /** Settle on what a finish or a retry answered. */
  const settle = async (res) => {
    if (res?.status === "handoff") {
      setMock(null);
      setHighlight(null);
      setHandoff(res.message || "");
      setPhase("handoff");
      return true;
    }
    // Still reading: the reply carries the row, but nothing has moved yet.
    if (res?.status === "pending") {
      if (res.mock?.id === mockId) setMock((prev) => ({ ...prev, ...res.mock }));
      return false;
    }
    if (res?.mock?.id === mockId) { setMock((prev) => ({ ...prev, ...res.mock })); return true; }
    if (res?.status && res.status !== "pending") {
      try {
        const row = await api.getMock(userId, mockId);
        if (alive.current && row) setMock(row);
      } catch { /* the row as it was */ }
      return true;
    }
    return false;
  };

  const retry = async () => {
    if (retrying) return;
    setRetrying(true); setRetryNote(null);
    try {
      const res = await api.feedback(mockId);
      if (!alive.current) return;
      await settle(res);
      if (!alive.current) return;
      if (res?.status === "no_feedback") {
        setRetryNote({ text: res.message || "Poise still couldn't write the notes.", tone: "warn", signIn: false });
      } else if (res?.status === "done") {
        setRetryNote({ text: "Your notes are ready below.", tone: "info", signIn: false });
      }
    } catch (e) {
      if (!alive.current) return;
      setRetryNote({ text: interviewErrorMessage(e), tone: needsSignIn(e) ? "error" : "warn", signIn: needsSignIn(e) });
      // The tries counted on the server may have moved: read the row again.
      if (e?.code === "no_retries") {
        try { const row = await api.getMock(userId, mockId); if (alive.current && row) setMock(row); } catch { /* as it was */ }
      }
    } finally {
      if (alive.current) setRetrying(false);
    }
  };

  const checkAgain = async () => {
    if (checking) return;
    setChecking(true); setRetryNote(null);
    try {
      const res = await api.finish(mockId);
      if (!alive.current) return;
      const moved = await settle(res);
      if (alive.current && !moved) setRetryNote({ text: "Poise is still reading. Try again in a minute.", tone: "warn", signIn: false });
    } catch (e) {
      if (alive.current) setRetryNote({ text: interviewErrorMessage(e), tone: "warn", signIn: needsSignIn(e) });
    } finally {
      if (alive.current) setChecking(false);
    }
  };

  const remove = async () => {
    if (deleting) return;
    setDeleting(true); setDeleteError(null);
    try {
      await api.deleteMock(userId, mockId);
      if (!alive.current) return;
      navigate?.(HOME_PATH, { replace: true });
    } catch (e) {
      if (!alive.current) return;
      setDeleting(false);
      setDeleteError(interviewErrorMessage(e));
    }
  };

  const goHome = () => navigate?.(HOME_PATH);

  // ── Layout ────────────────────────────────────────────────────────────────

  const pagePad = pageStyle({ isMobile, sidebar: SIDEBAR_WIDTH, ink });
  const frame = (children, width = 1180) => (
    <div data-sidebar-offset className="ui-page" style={pagePad}>
      <div style={{ maxWidth: width, margin: "0 auto", width: "100%" }}>{children}</div>
    </div>
  );

  if (phase === "handoff") {
    return frame(<HandoffPanel level={1} message={handoff} headingRef={handoffRef} onHome={goHome} />, 760);
  }

  if (phase === "loading") {
    return frame(
      <div aria-busy="true">
        <BackLink onClick={goHome}>Poise</BackLink>
        <p role="status" style={{ margin: "12px 0 0", fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT_MID }}>
          Loading your report...
        </p>
      </div>,
    );
  }

  if (phase === "notfound" || phase === "error") {
    return frame(
      <>
        <BackLink onClick={goHome}>Poise</BackLink>
        <h1 style={{ margin: "4px 0 12px", fontFamily: SANS, fontWeight: 800, fontSize: isMobile ? "1.9rem" : "2.3rem",
          color: ink.title, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
          {phase === "notfound" ? "Report not found" : "Your report didn't load"}
        </h1>
        <Card style={{ maxWidth: 640 }}>
          <PoiseLine style={{ fontWeight: 600, color: TEXT }}>
            {phase === "notfound" ? "This mock isn't here. It may have been deleted, or the link is wrong." : POISE_LINES?.error}
          </PoiseLine>
        </Card>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
          {phase === "error" && <Button kind="primary" onClick={load}>Try again</Button>}
          <Button kind={phase === "error" ? "secondary" : "primary"} onClick={goHome}>Back to Poise</Button>
        </div>
      </>,
      760,
    );
  }

  // ── The report ────────────────────────────────────────────────────────────

  const turns = turnsOf(mock.transcript);
  const status = mock.status;
  const unfinished = UNFINISHED.has(status);
  const tries = Number.isInteger(mock.feedback_tries) ? mock.feedback_tries : 0;
  const canRetry = status === "no_feedback" && turns.length > 0 && tries < FEEDBACK_TRIES_MAX;
  const meta = [modeLabel(mock.mode), dayLabel(mock.created_at || mock.started_at), minutesLabel(mock.duration_s)]
    .filter(Boolean).join(", ");
  const transcript = (
    <TranscriptPanel transcript={mock.transcript} highlight={highlight?.turn ?? null} quote={highlight?.quote || ""}
      onBack={backTo.current ? back : undefined} />
  );

  const says = unfinished ? null
    : status === "refunded" ? (typeof POISE_LINES?.refunded === "function" ? POISE_LINES.refunded(mock.refund_reason) : null)
    : status === "no_feedback" ? (turns.length ? (canRetry ? POISE_LINES?.noFeedback : POISE_LINES?.noFeedbackFinal) : POISE_LINES?.kept)
    : POISE_LINES?.reportHello;

  return frame(
    <>
      <BackLink onClick={goHome}>Poise</BackLink>
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between",
        gap: "10px 20px", margin: "0 0 18px" }}>
        <div style={{ minWidth: 0, flex: "1 1 320px" }}>
          <h1 style={{ margin: 0, fontFamily: SANS, fontWeight: 800, fontSize: isMobile ? "1.9rem" : "2.3rem", color: ink.title,
            letterSpacing: "-0.02em", lineHeight: 1.15, overflowWrap: "anywhere" }}>
            {targetLine(mock)}
          </h1>
          {meta && (
            <p style={{ margin: "6px 0 0", fontFamily: SANS, fontSize: "1.02rem", fontWeight: 600, color: TEXT_MID, lineHeight: 1.5 }}>
              {meta}
            </p>
          )}
        </div>
        {!unfinished && (
          <Button kind="secondary" onClick={() => { setDeleteError(null); setConfirming(true); }}>Delete this mock</Button>
        )}
      </header>

      {note && says !== POISE_LINES?.kept && (
        <Notice tone="info" onDismiss={() => setNote(null)} style={{ marginBottom: 16, maxWidth: 760 }}>{note}</Notice>
      )}
      {says && (
        <div style={{ marginBottom: 20 }}>
          <MascotSays agent={POISE} state="idle" size={72} layout="auto">{says}</MascotSays>
        </div>
      )}

      {unfinished && (
        <Card as="section" aria-labelledby="pi-rep-wait" style={{ maxWidth: 760, marginBottom: 20 }}>
          <h2 id="pi-rep-wait" style={h2}>Poise is still reading this one</h2>
          <p style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.6 }}>
            The notes appear here once they are written. That usually takes a minute or two after the call.
          </p>
          <Button kind="primary" busy={checking} onClick={checkAgain} style={{ marginTop: 14 }}>Check again</Button>
        </Card>
      )}

      {canRetry && (
        <div style={{ maxWidth: 760, marginBottom: 20 }}>
          <Button kind="primary" busy={retrying} onClick={retry}>
            {retrying ? "Poise is reading..." : "Try again"}
          </Button>
          <p style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.5 }}>
            Trying again is free. {FEEDBACK_TRIES_MAX - tries === 1 ? "One more try" : `${FEEDBACK_TRIES_MAX - tries} tries`} left for this mock.
          </p>
        </div>
      )}
      <div aria-live="polite" style={{ maxWidth: 760 }}>
        {retryNote && (
          <Notice tone={retryNote.tone} onDismiss={() => setRetryNote(null)} style={{ marginBottom: 20 }}
            action={retryNote.signIn ? <Button kind="secondary" onClick={() => navigate?.("/auth")}>Sign in again</Button> : null}>
            {retryNote.text}
          </Notice>
        )}
      </div>

      {status === "done" ? (
        <>
          <ScoreGrid scores={mock.scores} mode={mock.mode} />
          <p style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: "26px 0 18px", fontFamily: SANS, fontSize: "1rem",
            fontWeight: 600, color: TEXT_MID, lineHeight: 1.55, maxWidth: "70ch" }}>
            <span aria-hidden="true" style={{ display: "flex", marginTop: 3, flexShrink: 0, color: ink.text }}>
              <PixelStamp kind="lock" size={16} />
            </span>
            <span><span style={SR_ONLY}>Poise: </span>{POISE_LINES?.neverScripts}</span>
          </p>
          <div style={narrow ? { display: "flex", flexDirection: "column", gap: 28 }
            : { display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)", gap: 28, alignItems: "start" }}>
            <NoteList feedback={mock.feedback} transcript={mock.transcript} onJump={jump} />
            <div style={narrow ? null : { position: "sticky", top: 16 }}>{transcript}</div>
          </div>
        </>
      ) : !unfinished ? (
        <div style={{ maxWidth: 820 }}>{transcript}</div>
      ) : null}

      <AnimatePresence>
        {confirming && (
          <Sheet key="delete" onClose={() => { if (!deleting) setConfirming(false); }} locked={deleting}
            labelledBy="pi-rep-delete" width={480}>
            <h2 id="pi-rep-delete" style={{ ...h2, margin: "0 0 8px", overflowWrap: "anywhere" }}>
              Delete the mock for {short(targetLine(mock), 60)}?
            </h2>
            <p style={{ margin: 0, fontFamily: SANS, fontSize: "1.02rem", color: TEXT_MID, lineHeight: 1.6 }}>
              Its transcript, Poise&apos;s notes and its scores are deleted for good. This can&apos;t be undone, and it does
              not give the mock back.
            </p>
            {deleteError && (
              <p role="alert" style={{ margin: "12px 0 0", fontFamily: SANS, fontSize: "0.98rem", fontWeight: 700, color: DANGER,
                lineHeight: 1.45 }}>
                {deleteError}
              </p>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
              <Button kind="secondary" data-autofocus disabled={deleting} onClick={() => setConfirming(false)}
                style={{ flex: "1 1 140px" }}>
                Keep it
              </Button>
              <Button kind="danger" busy={deleting} onClick={remove} style={{ flex: "1 1 140px" }}>Delete this mock</Button>
            </div>
          </Sheet>
        )}
      </AnimatePresence>
    </>,
  );
}
