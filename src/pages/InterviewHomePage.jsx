import { useCallback, useEffect, useRef, useState } from "react";
import { requireUser } from "../lib/auth.js";
import { agentsApi, interviewErrorMessage, needsSignIn } from "../lib/agentsApi.js";
import { POISE_LINES } from "../lib/agents/registry.js";
import { deleteMock, holdCall, listMocks } from "../lib/interview.js";
import { loadCollegeList } from "../lib/collegeList.js";
import { PixelArrow, PixelStamp } from "../components/ui/PixelIcons.jsx";
import { AMBER_TEXT, BORDER, RADIUS, SANS, TEXT, TEXT_MID, WHITE, useAgentInk } from "../components/ui/tokens.js";
import { Button, Card, Notice, SR_ONLY, Toast, pageStyle } from "../components/ui/kit.jsx";
import MarshScene, { PoiseLine, PoiseSays } from "../components/agents/interview/MarshScene.jsx";
import MockList from "../components/agents/interview/MockList.jsx";
import SetupSheet from "../components/agents/interview/SetupSheet.jsx";
import { HandoffPanel } from "../components/agents/interview/CallStage.jsx";
import {
  MOCKS_LIMIT, UNFINISHED, callPath, micCheck, reportPath, short, targetLine,
} from "../components/agents/interview/interviewUi.js";
import { SKEL_CLASS } from "../components/agents/outreach/BoardUi.js";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";

// Poise's practice room (/agents/interview): a marsh at dawn across the top,
// one Start card (with what is left and the privacy promise right under the
// button), then the student's past mocks, one row each.
//
// A mock is a voice interview of up to ten minutes with Poise (an ElevenLabs
// voice agent the backend sets up), then written notes on each answer. Start
// opens the setup sheet; the page checks the microphone before it asks the
// backend, so a student who says no to the microphone spends nothing. The
// backend spends the mock and hands back a one-time signed URL, which is held
// in memory only (holdCall) and never put in the address, storage or a log.
//
// A mock left unfinished (the tab closed mid-call) is finished here: the
// status call names them (live_ids), and the page asks the server to finish
// each in turn, so a call that ran always ends up in the list. One that is
// still being read says so, and the next visit tries again.

// The real calls. The page takes them as one object so it can be driven with
// made-up data when checking it by hand (see CollegeListPage).
const REAL_API = {
  requireUser, listMocks, deleteMock, loadCollegeList, micCheck, holdCall,
  status: () => agentsApi.interviewStatus(),
  start: (body) => agentsApi.interviewStart(body),
  finish: (id) => agentsApi.interviewFinish(id),
};

const MIC_WORDS = {
  missing: "No microphone was found, so nothing was used.",
  unsupported: "This browser has no microphone to offer here, so nothing was used.",
};
// Refusals that are a plain "not now" rather than something breaking: amber, never red.
const NOT_NOW = new Set(["busy", "no_mocks", "budget_unavailable", "not_configured", "voice_unavailable",
  "bad_mode", "bad_target", "bad_role", "bad_details"]);

function Skeleton() {
  const bar = (w, h, extra) => <div className={SKEL_CLASS} style={{ width: w, height: h, borderRadius: 6, ...extra }} />;
  const box = { background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card, boxSizing: "border-box" };
  return (
    <div aria-hidden="true">
      <div style={{ ...box, marginTop: 18, padding: "18px 20px", display: "flex", flexWrap: "wrap", alignItems: "center",
        gap: "16px 32px" }}>
        <div style={{ flex: "1 1 420px", minWidth: 0 }}>
          {bar("40%", 22)}
          {bar("75%", 14, { marginTop: 12 })}
        </div>
        <div style={{ flex: "1 1 280px", maxWidth: 360, minWidth: 0 }}>
          {bar("100%", 52, { borderRadius: 12 })}
          {bar("60%", 14, { marginTop: 12 })}
        </div>
      </div>
      {bar(140, 22, { marginTop: 28 })}
      <div style={{ ...box, marginTop: 12 }}>
        {[0, 1].map((k) => (
          <div key={k} style={{ padding: "16px 20px", borderTop: k ? `1px solid ${BORDER}` : "none" }}>
            {bar("45%", 18)}
            {bar("70%", 14, { marginTop: 10 })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function InterviewHomePage({ navigate, api = REAL_API }) {
  const isMobile = useIsMobile();
  const ink = useAgentInk();
  const [phase, setPhase] = useState("loading");      // loading | ready | error
  const [userId, setUserId] = useState(null);
  const [mocks, setMocks] = useState([]);
  const [status, setStatus] = useState(null);         // agentsApi.interviewStatus(), once it answers
  const [statusState, setStatusState] = useState("loading");   // loading | ready | failed
  const [sheetOpen, setSheetOpen] = useState(false);
  const [colleges, setColleges] = useState(null);     // null until loaded, then [{ id, name }]
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);
  const [handoff, setHandoff] = useState(null);       // a hand-off found while finishing an old call
  const [toast, setToast] = useState(null);
  const [announce, setAnnounce] = useState("");
  const alive = useRef(true);
  const toastTimer = useRef(null);
  const finishing = useRef(false);
  const askedColleges = useRef(false);
  const startRef = useRef(null);
  const handoffRef = useRef(null);
  const focusStart = useRef(false);

  const notify = useCallback((text, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ text, error });
    toastTimer.current = setTimeout(() => setToast(null), error ? 7000 : 4500);
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.status();
      if (!alive.current) return null;
      setStatus(s || null);
      setStatusState(s ? "ready" : "failed");
      return s || null;
    } catch (e) {
      console.warn("[interview] status failed:", e?.code || e?.name || "error");
      if (alive.current) setStatusState((prev) => (prev === "ready" ? prev : "failed"));
      return null;
    }
  }, [api]);

  /** Ask the server to finish each unfinished mock, one at a time, and put
   *  each row in the list as it lands. A pending one stays "still wrapping up". */
  const finishLive = useCallback(async (ids, uid) => {
    const list = (Array.isArray(ids) ? ids : []).filter((x) => typeof x === "string" && x);
    if (!list.length || finishing.current) return;
    finishing.current = true;
    let changed = false;
    let reload = false;
    try {
      for (const id of list) {
        if (!alive.current) return;
        let res = null;
        try { res = await api.finish(id); } catch (e) {
          console.warn("[interview] finishing an old mock failed:", e?.code || e?.name || "error");
          continue;
        }
        if (!alive.current) return;
        const state = res?.status;
        if (!state || state === "pending") continue;
        changed = true;
        if (state === "handoff") {
          setMocks((prev) => prev.filter((m) => m.id !== id));
          setHandoff(res.message || POISE_LINES?.handoffNote || "");
          continue;
        }
        if (res.mock?.id === id) {
          setMocks((prev) => prev.map((m) => (m.id === id ? { ...m, ...res.mock } : m)));
        } else {
          reload = true;
        }
        setAnnounce(state === "refunded"
          ? "An earlier mock was given back."
          : `Your mock for ${short(targetLine(res.mock || {}), 60)} is ready.`);
      }
    } finally {
      finishing.current = false;
    }
    if (!alive.current || !changed) return;
    refreshStatus();
    if (reload && uid) {
      try {
        const rows = await api.listMocks(uid);
        if (alive.current) setMocks(Array.isArray(rows) ? rows : []);
      } catch { /* the list as it was is still right enough */ }
    }
  }, [api, refreshStatus]);

  const load = useCallback(async () => {
    setPhase("loading");
    let user = null;
    try { user = await api.requireUser(); } catch { user = null; }
    if (!alive.current) return;
    if (!user) { navigate?.("/auth"); return; }
    setUserId(user.id);
    // What is left comes from the backend; the list works without it.
    const statusLoad = refreshStatus();
    try {
      const rows = await api.listMocks(user.id);
      if (!alive.current) return;
      setMocks(Array.isArray(rows) ? rows : []);
      setPhase("ready");
    } catch (e) {
      console.error("[interview] list load failed:", e?.code || e?.name || "error");
      if (alive.current) setPhase("error");
      return;
    }
    const s = await statusLoad;
    if (alive.current && s) finishLive(s.live_ids, user.id);
  }, [api, navigate, refreshStatus, finishLive]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; clearTimeout(toastTimer.current); };
    // Load once per visit: `load` changes identity when the user id lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (handoff) handoffRef.current?.focus(); }, [handoff]);
  useEffect(() => {
    if (!focusStart.current) return;
    focusStart.current = false;
    startRef.current?.focus();
  }, [mocks]);

  // ── What shows ────────────────────────────────────────────────────────────

  const configured = status?.configured !== false;
  const limit = Number.isInteger(status?.mocks_limit) && status.mocks_limit > 0 ? status.mocks_limit : MOCKS_LIMIT;
  const left = Number.isInteger(status?.mocks_left) ? status.mocks_left : null;   // null: could not check
  const spent = left !== null && left <= 0;
  const unread = statusState === "failed" || (statusState === "ready" && left === null);
  const canStart = configured && !spent;
  const hello = spent ? POISE_LINES?.noMocks : mocks.length === 0 ? POISE_LINES?.homeEmpty : POISE_LINES?.homeHello;

  // ── Starting a mock ───────────────────────────────────────────────────────

  const openSheet = () => {
    setStartError(null);
    setSheetOpen(true);
    if (askedColleges.current || !userId) return;
    askedColleges.current = true;
    Promise.resolve()
      .then(() => api.loadCollegeList(userId))
      .then((res) => {
        if (!alive.current) return;
        const items = (Array.isArray(res?.items) ? res.items : [])
          .filter((c) => c && c.id && typeof c.name === "string" && c.name.trim())
          .map((c) => ({ id: c.id, name: c.name }));
        setColleges(items);
      })
      .catch((e) => {
        console.warn("[interview] college list failed:", e?.code || e?.name || "error");
        if (alive.current) setColleges([]);
      });
  };

  const signInAction = <Button kind="secondary" onClick={() => navigate?.("/auth")}>Sign in again</Button>;

  const start = async (body) => {
    if (starting) return;
    setStarting(true);
    setStartError(null);
    // The microphone first, before anything is spent.
    const mic = await api.micCheck();
    if (!alive.current) return;
    if (mic !== "ok") {
      setStarting(false);
      // micDenied says how to allow it; MicHelp adds what it can't. Nothing was spent.
      setStartError({ message: MIC_WORDS[mic] || POISE_LINES?.micDenied || "Poise needs your microphone.", tone: "warn", mic });
      return;
    }
    let res = null;
    try {
      res = await api.start(body);
    } catch (e) {
      if (!alive.current) return;
      setStarting(false);
      const signIn = needsSignIn(e);
      setStartError({ message: interviewErrorMessage(e), code: e?.code, signIn,
        tone: signIn ? "error" : NOT_NOW.has(e?.code) ? "warn" : "error", action: signIn ? signInAction : null });
      refreshStatus();
      return;
    }
    if (!alive.current) return;
    const id = res?.mock?.id;
    if (!id || typeof res?.signed_url !== "string" || !res.signed_url) {
      // The mock was started but no call came back with it. It finishes on
      // its own (and is given back if nothing connected), so show it in the list.
      console.error("[interview] start returned no call");
      setStarting(false);
      setStartError({ message: POISE_LINES?.error || "Something went wrong. Try again.", tone: "error" });
      refreshStatus();
      try { const rows = await api.listMocks(userId); if (alive.current) setMocks(Array.isArray(rows) ? rows : []); } catch { /* as it was */ }
      return;
    }
    api.holdCall(id, res);
    navigate?.(callPath(id));
  };

  const removeMock = async (id) => {
    await api.deleteMock(userId, id);
    if (!alive.current) return;
    const gone = mocks.find((m) => m.id === id);
    if (mocks.length <= 1) focusStart.current = true;
    setMocks((prev) => prev.filter((m) => m.id !== id));
    notify(gone ? `Deleted the mock for ${short(targetLine(gone), 60)}.` : "Deleted that mock.");
  };

  const openMock = (id) => {
    const row = mocks.find((m) => m.id === id);
    if (!row || UNFINISHED.has(row.status)) return;
    navigate?.(reportPath(id));
  };

  // ── Layout ────────────────────────────────────────────────────────────────

  const pagePad = pageStyle({ isMobile, sidebar: SIDEBAR_WIDTH, ink });
  const scene = (
    <MarshScene title="Interviews" isMobile={isMobile} state={starting ? "listening" : "idle"}
      onBack={() => navigate?.("/agents")} says={phase === "ready" && !handoff ? hello : null} />
  );

  if (phase !== "ready") {
    return (
      <div data-sidebar-offset className="ui-page" style={pagePad}>
        <div style={{ maxWidth: 1400, margin: "0 auto", width: "100%" }}>{scene}</div>
        <div style={{ maxWidth: 1120, margin: "0 auto", width: "100%" }}>
          {phase === "loading" ? (
            <div aria-busy="true">
              <p role="status" style={SR_ONLY}>Loading your mocks</p>
              <Skeleton />
            </div>
          ) : (
            <div style={{ maxWidth: 640 }}>
              <Card>
                <PoiseLine style={{ fontWeight: 600, color: TEXT }}>{POISE_LINES?.error}</PoiseLine>
              </Card>
              <Button kind="primary" onClick={load} style={{ marginTop: 18 }}>Try again</Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const leftLine = statusState === "loading" ? null
    : unread ? "Couldn't check how many mocks you have left. You can still start: Poise checks when you begin."
    : POISE_LINES?.mocksLeft ? POISE_LINES.mocksLeft(left, limit)
    : `${left} of ${limit} mocks left`;
  const stampLine = (stamp, children, style) => (
    <p style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: 0, fontFamily: SANS, fontSize: "0.95rem",
      fontWeight: 700, lineHeight: 1.5, color: TEXT_MID, ...style }}>
      <span aria-hidden="true" style={{ display: "flex", marginTop: 3, flexShrink: 0 }}><PixelStamp kind={stamp} size={16} /></span>
      <span>{children}</span>
    </p>
  );

  return (
    <div data-sidebar-offset className="ui-page" style={pagePad}>
      <div style={{ maxWidth: 1400, margin: "0 auto", width: "100%" }}>{scene}</div>

      <div style={{ maxWidth: 1120, margin: "0 auto", width: "100%" }}>
        {/* Poise's line is the one pixel bubble: inside the band on a wide screen, under it on a phone. */}
        {isMobile && !handoff && <PoiseSays center={62}>{hello}</PoiseSays>}

        {handoff && (
          <div style={{ marginTop: 18 }}>
            <HandoffPanel message={handoff} headingRef={handoffRef} />
          </div>
        )}

        {/* Everything about starting in one card: what a mock is on the left;
            Start, what is left and the privacy promise together on the right. */}
        <Card as="section" aria-labelledby="pi-start-title" style={{ marginTop: 18, display: "flex", flexWrap: "wrap",
          alignItems: "center", gap: "16px 32px" }}>
          <div style={{ flex: "1 1 420px", minWidth: 0 }}>
            <h2 id="pi-start-title" style={{ margin: 0, fontFamily: SANS, fontSize: "1.3rem", fontWeight: 800, color: TEXT,
              letterSpacing: "-0.01em", lineHeight: 1.3 }}>
              Practice an interview
            </h2>
            <p style={{ margin: "6px 0 0", fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.6,
              maxWidth: "62ch" }}>
              Pick a college or an internship, then talk it through with Poise for up to 10 minutes. Afterward you get notes on
              each answer, pointing at your own words.
            </p>
            {!configured && (
              <Notice tone="info" style={{ marginTop: 14 }}>
                Mock interviews aren&apos;t switched on yet. Your past reports still open.
              </Notice>
            )}
          </div>
          <div style={{ flex: "1 1 280px", maxWidth: isMobile ? "none" : 360, minWidth: 0, display: "flex",
            flexDirection: "column", gap: 10 }}>
            <Button ref={startRef} kind="primary" onClick={openSheet} disabled={!canStart}
              aria-describedby={!canStart ? "pi-start-why" : undefined}
              style={{ width: "100%", minHeight: 52, padding: "12px 22px", fontSize: "1.05rem" }}>
              Start a mock interview
              <PixelArrow size={16} />
            </Button>
            {!canStart && (
              <p id="pi-start-why" style={{ margin: 0, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700,
                color: spent ? AMBER_TEXT : TEXT_MID, lineHeight: 1.5 }}>
                {!configured ? "Starting is off until mock interviews are switched on."
                  : "You've used all your mocks. Your past reports still open below."}
              </p>
            )}
            {leftLine && stampLine("chat", leftLine,
              { color: spent || unread ? AMBER_TEXT : TEXT_MID, fontVariantNumeric: "tabular-nums" })}
            {stampLine("lock",
              "What you say stays yours. Only you see your transcripts and notes, and you can delete them whenever you like.",
              { fontWeight: 500 })}
          </div>
        </Card>

        <div style={{ marginTop: 28 }}>
          <MockList mocks={mocks} onOpen={openMock} onDelete={removeMock} />
        </div>
      </div>

      <p aria-live="polite" style={SR_ONLY}>{announce}</p>
      <Toast notice={toast} onDismiss={() => { clearTimeout(toastTimer.current); setToast(null); }}
        isMobile={isMobile} sidebar={SIDEBAR_WIDTH} />

      <SetupSheet open={sheetOpen} onClose={() => { if (!starting) setSheetOpen(false); }} onStart={start}
        colleges={colleges} busy={starting} error={startError} />
    </div>
  );
}
