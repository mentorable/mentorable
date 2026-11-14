import { useEffect, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { agentsApi, interviewErrorMessage, needsSignIn } from "../lib/agentsApi.js";
import { POISE_LINES } from "../lib/agents/registry.js";
import { takeCall } from "../lib/interview.js";
import { MascotSays } from "../components/agents/SpeechBubble.jsx";
import CallStage, { CallRoomStrip, HandoffPanel, MicHelp } from "../components/agents/interview/CallStage.jsx";
import {
  CAPTIONS_MAX, FINISH_EVERY_MS, FINISH_FOR_MS, HOME_PATH, MAX_SECONDS, POISE, WARN_SECONDS, holdNote, micCheck,
  modeLabel, reportPath, sleep, targetLine, whoOf,
} from "../components/agents/interview/interviewUi.js";
import { BackLink } from "../components/agents/essay/editor/EditorHeader.jsx";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { Button, Card, SR_ONLY, pageStyle } from "../components/ui/kit.jsx";
import { FOCUS_CLASS, SANS, TEXT, TEXT_MID, useAgentInk } from "../components/ui/tokens.js";
import { useIsMobile } from "../hooks/useIsMobile.js";

// One mock interview (/agents/interview/:mockId/call): the voice call, then
// the wait while Poise reads it.
//
// The call needs what the home page got from the backend when the student
// pressed Start: a one-time signed URL for the voice agent, the interviewer's
// prompt and first line (sent as overrides) and the mock's id (a dynamic
// variable, a second check on the server). It is a credential, so it lives in
// memory only: the home page holds it (holdCall), this page takes it once
// (takeCall), and it is never put in the address, storage or a log. Opened
// with nothing held (a refresh, a link), the call is over: the page says so
// and finishes the mock instead.
//
// The order, as onboarding's voice call does it: the microphone first, then
// startSession, then a clock from the moment the call connects. A one-minute
// warning at the mark the server gave, and the call ends itself at the cap
// (the voice agent has the same cap on its side). Leaving the page ends the
// session.
//
// After the call the server finishes the mock: it fetches the transcript
// from the voice service itself (this page never sends what was said), reads
// it, writes the notes, and deletes the voice service's copy. That can take a
// while, so the page asks every few seconds for two minutes, then says where
// the report will be. A hand-off is shown alone and calmly; nothing of the
// interview is kept on screen with it.

const REAL_API = {
  takeCall, micCheck,
  finish: (id) => agentsApi.interviewFinish(id),
};

// How long a dropped connection must stay dropped before the page treats
// the call as over (the interviewer ending it, the cap on the voice side, or
// the network going).
const DROP_CHECK_MS = 1500;

const numberOr = (n, fallback) => (Number.isInteger(n) && n > 0 ? n : fallback);

export default function InterviewCallPage({ navigate, mockId, api = REAL_API, useVoice = useConversation }) {
  const isMobile = useIsMobile();
  const ink = useAgentInk();
  const [phase, setPhase] = useState("start");
  // start | ended (nothing held: finishing) | mic | denied | connecting | live | ending
  // | pending | refunded | handoff | notfound | error
  const [micReason, setMicReason] = useState("denied");
  const [seconds, setSeconds] = useState(0);
  const [captions, setCaptions] = useState([]);
  const [showCaptions, setShowCaptions] = useState(false);
  const [limits, setLimits] = useState({ max: MAX_SECONDS, warn: WARN_SECONDS });
  const [mock, setMock] = useState(null);             // the row the start returned, for the heading
  const [result, setResult] = useState(null);         // { message, gaveBack, reason }
  const [failure, setFailure] = useState(null);       // { text, signIn }

  const held = useRef(undefined);      // the call, taken once; null when nothing was held
  const alive = useRef(true);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const ending = useRef(false);
  const finishing = useRef(false);
  const startedAt = useRef(0);
  const headingRef = useRef(null);
  const handoffRef = useRef(null);

  const voice = useVoice({
    onMessage: (msg) => {
      const text = typeof msg?.message === "string" ? msg.message : typeof msg?.text === "string" ? msg.text : "";
      if (!text.trim()) return;
      // Memory only, for the captions. The server reads the transcript from the voice service itself.
      setCaptions((prev) => [...prev, { who: whoOf(msg), text: text.trim() }].slice(-CAPTIONS_MAX));
    },
    onDisconnect: () => {
      // The interviewer closed the call, the voice side hit its cap, or the
      // line dropped. Onboarding saw this fire on ordinary turns with an older
      // SDK, so it only counts once the session has stayed disconnected.
      if (phaseRef.current !== "live" || ending.current) return;
      setTimeout(() => {
        if (!alive.current || phaseRef.current !== "live" || ending.current) return;
        if (voiceRef.current?.status === "disconnected") endCall();
      }, DROP_CHECK_MS);
    },
    onError: () => {
      // The message can carry details of the session, so only that it happened is logged.
      console.warn("[interview] voice error");
    },
  });
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  // ── Finishing ─────────────────────────────────────────────────────────────

  /** Ask the server to finish the mock every few seconds while it says
   *  "pending", up to two minutes, then show what it decided. */
  const runFinish = async () => {
    if (finishing.current) return;
    finishing.current = true;
    const deadline = Date.now() + FINISH_FOR_MS;
    try {
      while (alive.current) {
        let res = null;
        let err = null;
        try { res = await api.finish(mockId); } catch (e) { err = e; }
        if (!alive.current) return;
        if (err) {
          if (err?.code === "not_found") { setPhase("notfound"); return; }
          if (needsSignIn(err)) { setFailure({ text: interviewErrorMessage(err), signIn: true }); setPhase("error"); return; }
          // The network or the server stumbled: the server keeps the mock, so keep asking.
          console.warn("[interview] finish failed:", err?.code || err?.name || "error");
        } else {
          const state = res?.status;
          if (state === "done" || state === "no_feedback") {
            holdNote(mockId, res.message);
            navigate?.(reportPath(mockId), { replace: true });
            return;
          }
          if (state === "refunded") {
            setResult({ reason: res.mock?.refund_reason || null, gaveBack: res.gave_back === true, message: res.message || "" });
            setPhase("refunded");
            return;
          }
          if (state === "handoff") {
            // Nothing of the interview stays on screen, in memory or in the page.
            setCaptions([]);
            setMock(null);
            setResult({ message: res.message || "" });
            setPhase("handoff");
            return;
          }
        }
        if (Date.now() >= deadline) { setPhase("pending"); return; }
        await sleep(FINISH_EVERY_MS);
      }
    } finally {
      finishing.current = false;
    }
  };

  /** Hang up (once) and start finishing. Uses refs only, so the clock's
   *  interval can call it from any render. */
  const endCall = async () => {
    if (ending.current) return;
    ending.current = true;
    setPhase("ending");
    try { await voiceRef.current?.endSession(); } catch { /* already closed */ }
    if (alive.current) runFinish();
  };

  // ── The call ──────────────────────────────────────────────────────────────

  const begin = async () => {
    const call = held.current;
    if (!call?.signed_url) return;
    setPhase("mic");
    const mic = await api.micCheck();
    if (!alive.current) return;
    if (mic !== "ok") { setMicReason(mic); setPhase("denied"); return; }
    setPhase("connecting");
    try {
      await voiceRef.current.startSession({
        signedUrl: call.signed_url,
        overrides: call.overrides,
        dynamicVariables: call.dynamic_variables,
      });
    } catch (e) {
      console.error("[interview] the call did not start:", e?.name || "error");
      // Cancelled while connecting: runFinish, started by endCall, drives the screen.
      if (!alive.current || ending.current) return;
      setFailure({ text: "Poise couldn't connect the call. Check your connection, then head back and see how this mock stands.", signIn: false });
      setPhase("error");
      return;
    }
    // Connected: the one-time URL has done its job, so it is dropped from memory.
    held.current = { used: true };
    if (!alive.current) {
      try { await voiceRef.current?.endSession(); } catch { /* already closed */ }
      return;
    }
    // Hung up while it was still connecting.
    if (ending.current) {
      try { await voiceRef.current?.endSession(); } catch { /* already closed */ }
      return;
    }
    startedAt.current = Date.now();
    setSeconds(0);
    setPhase("live");
  };

  // Take the call once. Under React's development double-run the ref keeps
  // what was taken, so the second run neither takes again nor starts twice.
  useEffect(() => {
    alive.current = true;
    if (held.current === undefined) {
      const call = api.takeCall(mockId);
      held.current = call && typeof call.signed_url === "string" && call.signed_url ? call : null;
      if (!held.current) {
        setPhase("ended");
        ending.current = true;
        runFinish();
      } else {
        setLimits({ max: numberOr(call.max_seconds, MAX_SECONDS), warn: numberOr(call.warn_seconds, WARN_SECONDS) });
        setMock(call.mock || null);
        begin();
      }
    }
    return () => { alive.current = false; };
    // Once per mount; the page is keyed on the mock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaving the page ends the session.
  useEffect(() => () => {
    try { voiceRef.current?.endSession?.()?.catch?.(() => {}); } catch { /* already closed */ }
  }, []);

  // The clock, counted from the connect so a throttled tab never drifts, and the cap.
  useEffect(() => {
    if (phase !== "live") return undefined;
    const tick = () => {
      const s = Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(s);
      if (s >= limits.max) endCall();
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
    // endCall reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, limits.max]);

  // Closing the tab mid-call asks first. (The server finishes it either way.)
  useEffect(() => {
    if (phase !== "live" && phase !== "connecting") return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  // A screen that replaces the call takes focus on its heading.
  useEffect(() => {
    if (phase === "handoff") handoffRef.current?.focus();
    else if (["denied", "pending", "refunded", "notfound", "error"].includes(phase)) headingRef.current?.focus();
  }, [phase]);

  const goHome = () => navigate?.(HOME_PATH);
  const checkAgain = () => { setFailure(null); setPhase("ending"); runFinish(); };

  // ── Layout ────────────────────────────────────────────────────────────────

  const pagePad = pageStyle({ isMobile, sidebar: SIDEBAR_WIDTH, ink });
  const onCall = ["start", "mic", "connecting", "live", "ending", "ended"].includes(phase);
  // The call is a wide, quiet room; the screens around it keep the reading width.
  const column = { maxWidth: onCall ? 900 : 760, margin: "0 auto", width: "100%" };

  if (phase === "handoff") {
    return (
      <div data-sidebar-offset className="ui-page" style={pagePad}>
        <div style={column}>
          <HandoffPanel level={1} message={result?.message} headingRef={handoffRef} onHome={goHome} />
        </div>
      </div>
    );
  }

  const title = phase === "ended" ? "This call has ended" : "Mock interview";
  const sub = mock ? `${modeLabel(mock.mode)} for ${targetLine(mock)}` : null;
  // On the call the room speaks for itself: the heading is there for screen
  // readers, and shown only when there is something to say ("ended").
  const quietHeader = onCall && phase !== "ended";
  const h2 = { margin: 0, fontFamily: SANS, fontSize: "1.3rem", fontWeight: 800, color: TEXT, lineHeight: 1.3, borderRadius: 6 };
  const prose = { margin: "8px 0 0", fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.6 };

  return (
    <div data-sidebar-offset className="ui-page" style={pagePad}>
      <div style={column}>
        {/* No way back while the call is on: End is the way out, and leaving would hang up. */}
        {!onCall && <BackLink onClick={goHome}>Poise</BackLink>}
        <header style={quietHeader ? SR_ONLY : { margin: "0 0 18px" }}>
          <h1 style={{ margin: 0, fontFamily: SANS, fontWeight: 800, fontSize: isMobile ? "1.9rem" : "2.3rem", color: ink.title,
            letterSpacing: "-0.02em", lineHeight: 1.15 }}>
            {title}
          </h1>
          {sub && (
            <p style={{ margin: "6px 0 0", fontFamily: SANS, fontSize: "1.05rem", fontWeight: 600, color: TEXT_MID, lineHeight: 1.5,
              overflowWrap: "anywhere" }}>
              {sub}
            </p>
          )}
        </header>

        {/* The screens around the call sit in the same marsh, shorter. */}
        {["denied", "pending", "notfound", "error"].includes(phase) && <CallRoomStrip />}
        {phase === "refunded" && <CallRoomStrip heron={false} />}

        {onCall && (
          <CallStage phase={phase === "start" ? "mic" : phase === "ended" ? "ending" : phase} seconds={seconds}
            maxSeconds={limits.max} warnSeconds={limits.warn} speaking={phase === "live" && !!voice.isSpeaking}
            captions={captions} showCaptions={showCaptions} onToggleCaptions={() => setShowCaptions((v) => !v)}
            onEnd={endCall} />
        )}

        {phase === "denied" && (
          <Card as="section" aria-labelledby="pi-call-denied">
            <h2 id="pi-call-denied" ref={headingRef} tabIndex={-1} className={FOCUS_CLASS} style={h2}>
              Poise can&apos;t hear you yet
            </h2>
            {micReason === "denied" && <p style={prose}>{POISE_LINES?.micDenied}</p>}
            <MicHelp reason={micReason} style={{ marginTop: 12 }} />
            {/* The call is held in memory only, so a reload here would end it. */}
            <p style={{ ...prose, fontWeight: 700, color: TEXT }}>
              Once it&apos;s allowed, press Try again here. Don&apos;t reload the page: a reload ends this call.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
              <Button kind="primary" onClick={begin} style={{ flex: "1 1 160px" }}>Try again</Button>
              <Button kind="secondary" onClick={goHome} style={{ flex: "1 1 160px" }}>Back</Button>
            </div>
          </Card>
        )}

        {phase === "pending" && (
          <Card as="section" aria-labelledby="pi-call-pending">
            <h2 id="pi-call-pending" ref={headingRef} tabIndex={-1} className={FOCUS_CLASS} style={h2}>Still reading</h2>
            <p style={prose}>Poise is still reading. Your report will be on the home page shortly.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
              <Button kind="primary" onClick={goHome} style={{ flex: "1 1 160px" }}>Back to Poise</Button>
              <Button kind="secondary" onClick={checkAgain} style={{ flex: "1 1 160px" }}>Check again</Button>
            </div>
          </Card>
        )}

        {phase === "refunded" && (
          <section aria-labelledby="pi-call-refunded">
            <h2 id="pi-call-refunded" ref={headingRef} tabIndex={-1} className={FOCUS_CLASS} style={{ ...h2, marginBottom: 14 }}>
              No report this time
            </h2>
            {/* "Didn't count" is only said when the server says the mock really was given back. */}
            <MascotSays agent={POISE} state="idle" size={72} layout="auto">
              {result?.gaveBack && typeof POISE_LINES?.refunded === "function"
                ? POISE_LINES.refunded(result.reason)
                : result?.message || POISE_LINES?.kept}
            </MascotSays>
            <Button kind="primary" onClick={goHome} style={{ marginTop: 18 }}>Back to Poise</Button>
          </section>
        )}

        {phase === "notfound" && (
          <Card as="section" aria-labelledby="pi-call-gone">
            <h2 id="pi-call-gone" ref={headingRef} tabIndex={-1} className={FOCUS_CLASS} style={h2}>This mock wasn&apos;t found</h2>
            <p style={prose}>It may have been deleted. Your other mocks are on Poise&apos;s home page.</p>
            <Button kind="primary" onClick={goHome} style={{ marginTop: 16 }}>Back to Poise</Button>
          </Card>
        )}

        {phase === "error" && (
          <Card as="section" aria-labelledby="pi-call-error">
            <h2 id="pi-call-error" ref={headingRef} tabIndex={-1} className={FOCUS_CLASS} style={h2}>Something went wrong</h2>
            <p style={prose}>{failure?.text || POISE_LINES?.error}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
              {failure?.signIn ? (
                <Button kind="primary" onClick={() => navigate?.("/auth")} style={{ flex: "1 1 160px" }}>Sign in again</Button>
              ) : (
                <Button kind="primary" onClick={goHome} style={{ flex: "1 1 160px" }}>Back to Poise</Button>
              )}
              {!failure?.signIn && (
                <Button kind="secondary" onClick={checkAgain} style={{ flex: "1 1 160px" }}>Check this mock again</Button>
              )}
            </div>
          </Card>
        )}

        <p aria-live="polite" style={SR_ONLY}>
          {phase === "live" ? "The interview has started." : ""}
        </p>
      </div>
    </div>
  );
}
