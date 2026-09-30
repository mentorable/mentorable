import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { requireUser } from "../lib/auth.js";
import { agentsApi, agentErrorMessage, finishGmailReturn } from "../lib/agentsApi.js";
import { BEAKER_LINES } from "../lib/agents/registry.js";
import StepRail from "../components/agents/StepRail.jsx";
import { MascotSays } from "../components/agents/SpeechBubble.jsx";
import { PixelArrow } from "../components/agents/PixelIcons.jsx";
import { BG, SANS, TEXT, TEXT_MUTED, ringVar, useAgentInk } from "../components/agents/agentUi.js";
import { Button, Card, Notice, SR_ONLY, readLocal, textOnPage, writeLocal } from "../components/agents/outreach/flowUi.jsx";
import WhoStep from "../components/agents/outreach/WhoStep.jsx";
import ShortlistStep from "../components/agents/outreach/ShortlistStep.jsx";
import DetailsStep from "../components/agents/outreach/DetailsStep.jsx";
import ResearchStep from "../components/agents/outreach/ResearchStep.jsx";
import BeakerAtWork from "../components/agents/outreach/BeakerAtWork.jsx";
import GmailConnectSheet from "../components/agents/outreach/GmailConnectSheet.jsx";
import { mergeProgress } from "../components/agents/outreach/ProgressChecklist.jsx";
import {
  DEFAULT_LENGTH, DEFAULT_VOICE, GOAL_MAX, NAME_MAX, ORG_MAX, URL_MAX, budgetOf, researchBlock,
} from "../components/agents/outreach/options.js";
import Spinner from "../components/common/Spinner.jsx";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";

// New outreach: one decision per screen, with the step rail on top and
// Beaker beside each step. Who (a person, or a goal), the shortlist (goal
// only), the details, then research and draft, streamed as a real checklist.
// A draft goes straight to the review screen; nothing is ever sent from here.
//
// Query: ?goal= or ?name=&org=&url= prefill the Who step (the board's
// examples and "Draft with Beaker"), ?try=<id> resumes the open try from
// status (a pick or Beaker's question still waiting), ?gmail=connected|
// denied|error is Google sending the student back.

// The real calls. The page takes them as one object so it can be driven with
// made-up data when checking it by hand (see CollegeListPage).
const REAL_API = { requireUser, ...agentsApi };

const RETURN_TO = "/agents/outreach/new";
const BOARD = "/agents/outreach";
const INTRO_KEY = (uid) => `mentorable.outreachIntroSeen.${uid}`;
const FLOW_KEY = (uid) => `mentorable.outreachFlow.${uid}`;

const GMAIL_RETURN = {
  connected: { tone: "success", text: (email) => `Gmail is connected${email ? ` as ${email}` : ""}. Beaker only sends an email when you press Send.` },
  denied: { tone: "warn", text: () => "Gmail wasn't connected. That's okay: you can copy each email or open it in your mail app. To send from here later, connect again and leave the send box ticked." },
  error: { tone: "warn", text: () => "Google didn't finish connecting your Gmail. You can try again when you send, or copy the email instead." },
  expired: { tone: "warn", text: () => "That Gmail connection took too long to finish. Connect again when you're ready to send." },
  wrong_account: { tone: "warn", text: () => "That Gmail connection was started from a different Mentorable account, so it wasn't saved. Connect Gmail again from your own account." },
};

function readParams(search) {
  let q;
  try { q = new URLSearchParams(search || ""); } catch { q = new URLSearchParams(); }
  const get = (k, max) => (q.get(k) || "").slice(0, max);
  return {
    goal: get("goal", GOAL_MAX), name: get("name", NAME_MAX), org: get("org", ORG_MAX), url: get("url", URL_MAX),
    try: get("try", 64), gmail: get("gmail", 16),
  };
}

function readFlow(uid) {
  try {
    const raw = sessionStorage.getItem(FLOW_KEY(uid));
    sessionStorage.removeItem(FLOW_KEY(uid));
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}
function saveFlow(uid, flow) {
  try { sessionStorage.setItem(FLOW_KEY(uid), JSON.stringify(flow)); } catch { /* the flow starts fresh on return */ }
}

// What Beaker says while it builds a shortlist (the research lines are about
// one person; these are about finding a few).
const SHORTLIST_SAYINGS = [
  "Scanning the coastline for people who fit your goal.",
  "Only keeping people I can link to a real page.",
  "Checking each one is really working on this.",
  "Picking the few worth writing to.",
];

export default function OutreachNewPage({ navigate, api = REAL_API, search }) {
  const isMobile = useIsMobile();
  const ink = useAgentInk();
  const params = useMemo(() => readParams(search ?? (typeof window !== "undefined" ? window.location.search : "")), [search]);

  const [phase, setPhase] = useState("loading");   // loading | ready | error
  const [userId, setUserId] = useState(null);
  const [status, setStatus] = useState(null);
  const [notice, setNotice] = useState(null);       // { tone, text }
  const [sheet, setSheet] = useState(null);         // null | "intro"

  const [step, setStep] = useState("who");          // who | shortlist | details | research
  const [mode, setMode] = useState(params.goal ? "goal" : "person");
  const [person, setPerson] = useState({ name: params.name, organization: params.org, url: params.url });
  const [goal, setGoal] = useState(params.goal);
  const [tryId, setTryId] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [listKind, setListKind] = useState("shortlist");   // shortlist | ambiguous
  const [pick, setPick] = useState(null);
  const [choices, setChoices] = useState({ purpose: null, voice: DEFAULT_VOICE, length: DEFAULT_LENGTH, note: "" });

  const [running, setRunning] = useState(null);     // null | "shortlist" | "draft"
  const [lines, setLines] = useState([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [answerError, setAnswerError] = useState(null);
  const [failure, setFailure] = useState(null);     // { code, message, refunded, from }
  const [stepError, setStepError] = useState(null);

  const abortRef = useRef(null);
  const headingRef = useRef(null);
  const firstStep = useRef(true);

  const tries = budgetOf(status?.tries);
  const searches = budgetOf(status?.searches);   // research runs, which can run out before tries do
  const gmail = status?.gmail || { configured: false, connected: false, email: null };
  const openTry = status?.open_try || null;

  // ── Loading ────────────────────────────────────────────────────────────────

  const refreshStatus = useCallback(async () => {
    try { setStatus(await api.status()); } catch { /* keep what we have */ }
  }, [api]);

  const resumeFrom = useCallback((open) => {
    setTryId(open.id);
    setMode(open.mode === "goal" ? "goal" : "person");
    if (open.goal) setGoal(open.goal);
    setFailure(null); setStepError(null); setLines([]); setPick(null);
    if (open.pending_question) {
      setQuestion(open.pending_question); setAnswer(""); setAnswerError(null);
      setStep("research");
      return true;
    }
    const list = Array.isArray(open.candidates) ? open.candidates : [];
    if (list.length) {
      setCandidates(list);
      setListKind(open.mode === "goal" ? "shortlist" : "ambiguous");
      setStep("shortlist");
      return true;
    }
    setTryId(null);
    return false;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let user = null;
      try { user = await api.requireUser(); } catch { user = null; }
      if (cancelled) return;
      if (!user) { navigate?.("/auth"); return; }
      setUserId(user.id);
      // Back from Google: finish the connection first, so the status below sees it.
      const gmailOutcome = await finishGmailReturn(search ?? window.location.search, api);
      if (cancelled) return;
      let s = null;
      try {
        s = await api.status();
      } catch (e) {
        console.error("[outreach] status failed:", e);
        if (!cancelled) setPhase("error");
        return;
      }
      if (cancelled) return;
      setStatus(s);

      // Back from Google: say how it went, and put back what was typed.
      const back = GMAIL_RETURN[gmailOutcome];
      if (back) {
        setNotice({ tone: back.tone, text: back.text(s?.gmail?.email) });
        writeLocal(INTRO_KEY(user.id), "1");
        const flow = readFlow(user.id);
        if (flow) {
          if (flow.mode === "goal" || flow.mode === "person") setMode(flow.mode);
          if (typeof flow.goal === "string") setGoal(flow.goal.slice(0, GOAL_MAX));
          if (flow.person && typeof flow.person === "object") {
            setPerson({
              name: String(flow.person.name || "").slice(0, NAME_MAX),
              organization: String(flow.person.organization || "").slice(0, ORG_MAX),
              url: String(flow.person.url || "").slice(0, URL_MAX),
            });
          }
        }
        navigate?.(RETURN_TO, { replace: true });
      }

      if (params.try) {
        const open = s?.open_try;
        const resumed = open && open.id === params.try ? resumeFrom(open) : false;
        if (!resumed) {
          setNotice(open && open.id === params.try
            ? { tone: "info", text: "Beaker is still working on that one, or it stopped partway. Check your board in a minute." }
            : { tone: "info", text: "That outreach is already finished. You'll find it on your board." });
        }
      }

      // Nothing can be started (no tries, or no research runs): no intro yet.
      if (!back && !researchBlock(s) && !readLocal(INTRO_KEY(user.id))) setSheet("intro");
      setPhase("ready");
    })();
    return () => { cancelled = true; };
    // Runs once per visit: the query is read on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  // A stream still running when the student leaves keeps going on the server
  // (the try lands on the board); the page just stops listening.
  useEffect(() => () => abortRef.current?.abort(), []);

  // New step: back to the top, and focus on the step's heading so a screen
  // reader hears where it is.
  useEffect(() => {
    if (firstStep.current) { firstStep.current = false; return; }
    try { window.scrollTo({ top: 0 }); } catch { /* old browsers */ }
    headingRef.current?.focus?.();
  }, [step]);

  // Only the sheet's own buttons mark the ground rules as read. A stray tap
  // on the backdrop, or Escape, closes it for now and it comes back next time.
  const closeIntro = () => {
    if (userId) writeLocal(INTRO_KEY(userId), "1");
    setSheet(null);
  };
  const dismissIntro = () => setSheet(null);

  const connectGmail = async () => {
    if (userId) {
      writeLocal(INTRO_KEY(userId), "1");
      saveFlow(userId, { mode, goal, person });
    }
    const res = await api.googleConnect(RETURN_TO);
    if (!res?.url) throw new Error("Google did not answer. Try again.");
    window.location.href = res.url;
  };

  // ── Streams ────────────────────────────────────────────────────────────────

  const onEvent = useCallback((ev) => setLines((prev) => mergeProgress(prev, ev)), []);

  const listen = () => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    return ctl;
  };

  const runShortlist = async () => {
    if (running) return;
    const ctl = listen();
    setStepError(null); setFailure(null); setLines([]); setCandidates([]); setTryId(null); setPick(null);
    setListKind("shortlist");
    setStep("shortlist");
    setRunning("shortlist");
    try {
      const final = await api.shortlist({ goal: goal.trim() }, onEvent, { signal: ctl.signal });
      if (final?.type === "shortlist" && Array.isArray(final.candidates) && final.candidates.length) {
        setTryId(final.try_id);
        setCandidates(final.candidates);
      } else {
        setFailure({ code: final?.error || "search_failed", message: agentErrorMessage(final), refunded: !!final?.refunded, from: "shortlist" });
      }
    } catch (e) {
      if (e?.name === "AbortError") return;
      if (e?.code === "stream_lost") {
        setFailure({ code: e.code, message: agentErrorMessage(e), refunded: false, from: "shortlist" });
      } else {
        // Refused before it started (no tries, busy, a bad goal): nothing was spent.
        setStepError(agentErrorMessage(e));
        setStep("who");
      }
    } finally {
      if (abortRef.current === ctl) { setRunning(null); refreshStatus(); }
    }
  };

  /** `from`: where a refusal before the stream sends the student back to. */
  const runDraft = async (body, from) => {
    if (running) return;
    const ctl = listen();
    setStepError(null); setFailure(null); setAnswerError(null); setLines([]);
    setStep("research");
    setRunning("draft");
    try {
      const final = await api.draft(body, onEvent, { signal: ctl.signal });
      if (final?.type === "draft" && final.contact?.id) {
        try { if (userId) sessionStorage.removeItem(FLOW_KEY(userId)); } catch { /* nothing saved */ }
        navigate?.(`/agents/outreach/${final.contact.id}`);
        return;
      }
      if (final?.type === "question") {
        setTryId(final.try_id || body.try_id);
        setQuestion(final.question || "One quick question before I write.");
        setAnswer("");
        return;
      }
      if (final?.type === "ambiguous" && Array.isArray(final.candidates) && final.candidates.length) {
        setTryId(final.try_id);
        setCandidates(final.candidates);
        setListKind("ambiguous");
        setPick(null);
        setStep("shortlist");
        return;
      }
      setFailure({ code: final?.error || "draft_failed", message: agentErrorMessage(final), refunded: !!final?.refunded, from: "draft" });
      if (final?.refunded) { setTryId(null); setCandidates([]); setPick(null); setQuestion(""); }
    } catch (e) {
      if (e?.name === "AbortError") return;
      const code = e?.code;
      const message = agentErrorMessage(e);
      if (code === "stream_lost" || code === "card_deleted") {
        setFailure({ code, message, refunded: code === "card_deleted", from: "draft" });
        setQuestion("");
        if (code === "card_deleted") { setTryId(null); setCandidates([]); setPick(null); }
      } else if (from === "question") {
        setAnswerError(message);
      } else if (code === "bad_person" || code === "try_closed" || code === "no_try") {
        setTryId(null); setCandidates([]); setPick(null);
        setStepError(message);
        setStep("who");
      } else if (code === "bad_candidate") {
        setStepError(message);
        setStep(candidates.length ? "shortlist" : "who");
      } else {
        setStepError(message);
        setStep(from === "pick" ? "shortlist" : "details");
      }
    } finally {
      if (abortRef.current === ctl) { setRunning(null); refreshStatus(); }
    }
  };

  const choiceBody = () => ({
    purpose: choices.purpose, voice: choices.voice, length: choices.length,
    student_note: choices.note.trim(), answer: null,
  });

  const submitDetails = () => {
    if (tryId && pick !== null) {
      runDraft({ try_id: tryId, candidate_index: pick, person: null, ...choiceBody() }, "details");
    } else {
      runDraft({
        try_id: null, candidate_index: null, ...choiceBody(),
        person: { name: person.name.trim(), organization: person.organization.trim(), url: person.url.trim() },
      }, "details");
    }
  };

  const onPick = (index) => {
    setPick(index);
    setStepError(null);
    // A look-alike picked in the same visit: the details are already chosen.
    if (listKind === "ambiguous" && choices.purpose) {
      runDraft({ try_id: tryId, candidate_index: index, person: null, ...choiceBody() }, "pick");
    } else {
      setStep("details");
    }
  };

  const submitAnswer = (skip = false) => {
    runDraft({ try_id: tryId, candidate_index: null, person: null, ...choiceBody(), answer: skip ? "" : answer.trim() }, "question");
  };

  const startOver = () => {
    abortRef.current?.abort();
    setRunning(null);
    setTryId(null); setCandidates([]); setPick(null); setQuestion(""); setFailure(null); setStepError(null); setLines([]);
    setStep("who");
  };

  const continueWho = () => {
    setStepError(null);
    if (mode === "goal") { runShortlist(); return; }
    setTryId(null); setCandidates([]); setPick(null);
    setStep("details");
  };

  // ── Layout ─────────────────────────────────────────────────────────────────

  const pagePad = {
    minHeight: "100vh", background: BG, fontFamily: SANS, boxSizing: "border-box",
    padding: isMobile ? "1.25rem 1rem 6rem" : "2.25rem 2rem 4rem",
    paddingLeft: isMobile ? "1rem" : `calc(${SIDEBAR_WIDTH}px + 2rem)`,
    ...ringVar(ink),
  };

  if (phase !== "ready") {
    return (
      <div data-sidebar-offset style={{ ...pagePad, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {phase === "loading" ? (
          <div role="status" style={{ display: "flex", alignItems: "center", gap: 10, color: TEXT_MUTED, fontWeight: 600 }}>
            <Spinner size={22} color={ink.text} /> Loading
          </div>
        ) : (
          <div style={{ maxWidth: 440, textAlign: "center" }}>
            <MascotSays state="thinking" size={80} layout="stack">{BEAKER_LINES.error}</MascotSays>
            <p style={{ margin: "16px 0", color: TEXT_MUTED, lineHeight: 1.6 }}>
              We could not reach Beaker. Nothing has been spent.
            </p>
            <Button kind="primary" onClick={() => window.location.reload()}>Try again</Button>
          </div>
        )}
      </div>
    );
  }

  const showPick = mode === "goal" || (listKind === "ambiguous" && candidates.length > 0);
  const steps = [
    { key: "who", label: "Who" },
    ...(showPick ? [{ key: "shortlist", label: "Pick one" }] : []),
    { key: "details", label: "Details" },
    { key: "research", label: "Research" },
    { key: "review", label: "Review" },
  ];
  const stepLabel = steps.find((s) => s.key === step)?.label || "";
  const picked = pick !== null ? candidates[pick] : null;
  const who = picked ? { name: picked.name, organization: picked.organization }
    : person.name.trim() ? { name: person.name.trim(), organization: person.organization.trim() } : null;

  const failureActions = () => {
    if (failure?.code === "stream_lost") {
      return [
        { label: "Go to your board", kind: "primary", onClick: () => navigate?.(BOARD) },
        { label: "Start again", onClick: startOver },
      ];
    }
    return [
      { label: failure?.from === "shortlist" ? "Change my goal" : "Start again", kind: "primary", onClick: startOver },
      { label: "Back to your board", onClick: () => navigate?.(BOARD) },
    ];
  };

  const resumable = openTry && step === "who" && !running && (openTry.pending_question || openTry.candidates?.length);

  return (
    <div data-sidebar-offset style={pagePad}>
      <div style={{ maxWidth: 760, margin: "0 auto", width: "100%" }}>
        <button type="button" className="ag-focus" onClick={() => navigate?.(BOARD)}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, padding: "0 6px", marginLeft: -6,
            border: "none", background: "none", cursor: "pointer", fontFamily: SANS, fontSize: "0.98rem", fontWeight: 700,
            color: textOnPage(ink), borderRadius: 10 }}>
          <PixelArrow size={16} style={{ transform: "scaleX(-1)" }} />
          Your board
        </button>
        <h1 style={{ margin: "6px 0 18px", fontFamily: SANS, fontWeight: 800, fontSize: isMobile ? "1.9rem" : "2.3rem",
          color: ink.title, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
          New outreach
        </h1>

        <StepRail steps={steps} current={step} />

        <h2 ref={headingRef} tabIndex={-1} style={{ ...SR_ONLY }}>{stepLabel}</h2>

        {notice && (
          <Notice tone={notice.tone} onDismiss={() => setNotice(null)} style={{ marginTop: 18 }}>{notice.text}</Notice>
        )}

        <div style={{ marginTop: 22 }}>
          {step === "who" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <MascotSays state="idle" size={80} layout="auto">{BEAKER_LINES.who}</MascotSays>
              {resumable && (
                <Card style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                  <p style={{ flex: "1 1 260px", margin: 0, fontSize: "1rem", color: TEXT, lineHeight: 1.55, fontWeight: 600 }}>
                    {openTry.pending_question
                      ? "Beaker asked you a question on your last outreach and is waiting for your answer."
                      : openTry.mode === "goal"
                        ? `Your shortlist for "${openTry.goal}" is still waiting for a pick.`
                        : "Beaker found a few people with that name and is waiting for you to pick one."}
                    {" "}Picking up costs nothing more.
                  </p>
                  <Button kind="secondary" onClick={() => resumeFrom(openTry)}>Pick up where you left off</Button>
                </Card>
              )}
              <WhoStep mode={mode} onMode={(m) => { setMode(m); setStepError(null); }}
                person={person} onPerson={(patch) => setPerson((p) => ({ ...p, ...patch }))}
                goal={goal} onGoal={setGoal} tries={tries} searches={searches} busy={!!running} error={stepError}
                onContinue={continueWho} onBoard={() => navigate?.(BOARD)} />
            </div>
          )}

          {step === "shortlist" && (
            running === "shortlist" ? (
              <BeakerAtWork lines={lines} sayings={SHORTLIST_SAYINGS}
                note="Finding real people usually takes under a minute. If you leave, the shortlist waits for you here." />
            ) : failure ? (
              <ResearchStep view="error" failure={failure} lines={lines} actions={failureActions()} />
            ) : (
              <>
                {stepError && <Notice tone="error" style={{ marginBottom: 14 }}>{stepError}</Notice>}
                <ShortlistStep candidates={candidates} kind={listKind} goal={listKind === "shortlist" ? goal : ""}
                  onPick={onPick} busy={!!running}
                  onBack={startOver}
                  backLabel={listKind === "shortlist" ? "None of these, start over" : "None of these"} />
                {listKind === "shortlist" && (
                  <p style={{ margin: "6px 0 0", fontSize: "0.93rem", color: TEXT_MUTED, lineHeight: 1.5 }}>
                    Starting over uses another try. Picking someone here costs nothing more.
                  </p>
                )}
              </>
            )
          )}

          {step === "details" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <MascotSays state="idle" size={80} layout="auto">{BEAKER_LINES.details}</MascotSays>
              <DetailsStep who={who} onChangeWho={() => setStep(picked ? "shortlist" : "who")}
                choices={choices} onChoices={(patch) => setChoices((c) => ({ ...c, ...patch }))}
                charge={!(tryId && pick !== null)} tries={tries} searches={searches} busy={!!running} error={stepError}
                onSubmit={submitDetails} />
            </div>
          )}

          {step === "research" && (
            <ResearchStep
              view={running === "draft" ? "running" : failure ? "error" : question ? "question" : "running"}
              lines={lines} question={question} answer={answer} onAnswer={setAnswer}
              onSubmitAnswer={() => submitAnswer(false)} onSkip={() => submitAnswer(true)}
              busy={!!running} failure={failure} actions={failureActions()}
              answerError={answerError ? <Notice tone="error">{answerError}</Notice> : null} />
          )}
        </div>
      </div>

      <AnimatePresence>
        {sheet === "intro" && (
          <GmailConnectSheet key="intro" reason="first" gmail={gmail} showSafety onConnect={connectGmail}
            onClose={closeIntro} onDismiss={dismissIntro} />
        )}
      </AnimatePresence>
    </div>
  );
}
