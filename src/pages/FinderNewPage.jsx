import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requireUser } from "../lib/auth.js";
import { agentsApi, finderErrorMessage } from "../lib/agentsApi.js";
import { TALON_LINES } from "../lib/agents/registry.js";
import { LANES, WANT_MAX, updateItem } from "../lib/finder.js";
import { MascotSays } from "../components/agents/SpeechBubble.jsx";
import { PixelArrow } from "../components/agents/PixelIcons.jsx";
import { BG, SANS, TEXT, TEXT_MUTED, ringVar, useAgentInk } from "../components/agents/agentUi.js";
import { Button, Card, SR_ONLY, textOnPage } from "../components/agents/outreach/flowUi.jsx";
import { mergeProgress } from "../components/agents/outreach/ProgressChecklist.jsx";
import BoardToast from "../components/agents/outreach/BoardToast.jsx";
import StepRail from "../components/agents/StepRail.jsx";
import LaneStep from "../components/agents/finder/LaneStep.jsx";
import BriefStep, { INTERESTS_MAX, INTEREST_MAX, STATE_MAX } from "../components/agents/finder/BriefStep.jsx";
import CheckStep from "../components/agents/finder/CheckStep.jsx";
import TalonAtWork from "../components/agents/finder/TalonAtWork.jsx";
import SearchFailure from "../components/agents/finder/SearchFailure.jsx";
import ResultsStep from "../components/agents/finder/ResultsStep.jsx";
import { BOARD_PATH, TALON, blockCopy, budgetOf, findsBlock } from "../components/agents/finder/finderUi.js";
import Spinner from "../components/common/Spinner.jsx";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";

// A new find: one decision per screen, with the step rail on top and Talon
// beside each step. What (scholarships or activities), the details (a short
// brief, prefilled from the record), a check of what Talon assumed before
// anything is spent, then the search, streamed as a real checklist, and the
// results on the same page. Everything Talon keeps is on the board already.
//
// Query: ?lane=scholarship|activity opens on the details for that lane (the
// board's empty state and its lane filter).
//
// Privacy: the draft kept in sessionStorage is the lane, the want and the
// interests only. Citizenship and the eligibility chips live in memory for
// this visit and go nowhere but the search request.

// The real calls. The page takes them as one object so it can be driven with
// made-up data when checking it by hand (see CollegeListPage).
const REAL_API = {
  requireUser, updateItem,
  status: () => agentsApi.finderStatus(),
  find: (body, onEvent, opts) => agentsApi.finderFind(body, onEvent, opts),
};

const DRAFT_KEY = (uid) => `mentorable.finderDraft.${uid}`;
const isLane = (v) => LANES.some((l) => l.key === v);

function cleanInterests(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const v of list) {
    if (typeof v !== "string") continue;
    const s = v.trim().replace(/\s+/g, " ").slice(0, INTEREST_MAX);
    if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= INTERESTS_MAX) break;
  }
  return out;
}

function readDraft(uid) {
  try {
    const v = JSON.parse(sessionStorage.getItem(DRAFT_KEY(uid)) || "null");
    if (!v || typeof v !== "object") return null;
    return {
      lane: isLane(v.lane) ? v.lane : null,
      want: typeof v.want === "string" ? v.want.slice(0, WANT_MAX) : "",
      interests: Array.isArray(v.interests) ? cleanInterests(v.interests) : null,
    };
  } catch {
    return null;
  }
}
/** Only these three fields, ever: never citizenship or the chips. */
function saveDraft(uid, { lane, want, interests }) {
  try {
    sessionStorage.setItem(DRAFT_KEY(uid), JSON.stringify({ lane, want, interests }));
  } catch { /* storage blocked: the flow starts fresh on return */ }
}

const EMPTY_BRIEF = {
  lane: null, want: "", interests: [], grade: null, state: "", citizenship: null,
  budget: "any", travel: "anywhere", when: "any", effort: "any", chips: [],
};

const STEPS = [
  { key: "what", label: "What" },
  { key: "details", label: "Details" },
  { key: "check", label: "Check" },
  { key: "search", label: "Search" },
];

const short = (t, n = 60) => {
  const s = String(t || "this find");
  return s.length > n ? `${s.slice(0, n - 3).trimEnd()}...` : s;
};

export default function FinderNewPage({ navigate, api = REAL_API, search }) {
  const isMobile = useIsMobile();
  const ink = useAgentInk();
  const laneParam = useMemo(() => {
    let q;
    try { q = new URLSearchParams(search ?? (typeof window !== "undefined" ? window.location.search : "")); }
    catch { q = new URLSearchParams(); }
    const v = q.get("lane");
    return isLane(v) ? v : null;
  }, [search]);

  const [phase, setPhase] = useState("loading");   // loading | ready | error
  const [attempt, setAttempt] = useState(0);
  const [userId, setUserId] = useState(null);
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(false);  // "Check again" while a past search runs

  const [step, setStep] = useState("what");        // what | details | check | search
  const [brief, setBrief] = useState(EMPTY_BRIEF);
  const [focusField, setFocusField] = useState(null);

  const [searching, setSearching] = useState(false);
  const [lines, setLines] = useState([]);
  const [outcome, setOutcome] = useState(null);     // { search, items, dropped, already }
  const [failure, setFailure] = useState(null);     // { code, message, refunded }
  const [stepError, setStepError] = useState(null); // { message, signIn }
  const [pending, setPending] = useState(() => new Set());
  const [toast, setToast] = useState(null);
  const [announce, setAnnounce] = useState("");

  const abortRef = useRef(null);
  const headingRef = useRef(null);
  const firstStep = useRef(true);
  const alive = useRef(true);
  const toastTimer = useRef(null);

  const finds = budgetOf(status?.finds);
  const block = findsBlock(status);
  const running = status?.running?.id ? status.running : null;
  // What fills the page: a step, or the end of a search. A Save on the
  // results changes `outcome` but not this, so it never jumps the page.
  const view = outcome ? "results" : failure ? "failure" : step;

  // ── Loading ────────────────────────────────────────────────────────────────

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.status();
      if (alive.current) setStatus(s);
      return s;
    } catch {
      return null;   // keep what we have
    }
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    alive.current = true;
    (async () => {
      let user = null;
      try { user = await api.requireUser(); } catch { user = null; }
      if (cancelled) return;
      if (!user) { navigate?.("/auth"); return; }
      setUserId(user.id);
      let s = null;
      try {
        s = await api.status();
      } catch (e) {
        console.error("[finder] status failed:", e);
        if (!cancelled) setPhase("error");
        return;
      }
      if (cancelled) return;
      setStatus(s);

      // The record fills what it can; this tab's draft and the link win.
      const pre = s?.prefill || {};
      const draft = readDraft(user.id);
      const grade = Number(pre.grade);
      setBrief({
        ...EMPTY_BRIEF,
        lane: laneParam || draft?.lane || null,
        want: draft?.want || "",
        interests: draft?.interests ?? cleanInterests(pre.interests),
        grade: Number.isInteger(grade) && grade >= 9 && grade <= 12 ? grade : null,
        state: typeof pre.state === "string" ? pre.state.trim().slice(0, STATE_MAX) : "",
      });
      if (laneParam) setStep("details");
      setPhase("ready");
    })();
    return () => { cancelled = true; };
    // Runs once per visit (and on "Try again"): the query is read on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, attempt]);

  // A search still running when the student leaves keeps going on the server
  // (it lands on the board); the page just stops listening.
  useEffect(() => () => {
    alive.current = false;
    abortRef.current?.abort();
    clearTimeout(toastTimer.current);
  }, []);

  // The lane, the want and the interests survive a refresh in this tab.
  useEffect(() => {
    if (userId && phase === "ready") saveDraft(userId, { lane: brief.lane, want: brief.want, interests: brief.interests });
  }, [userId, phase, brief.lane, brief.want, brief.interests]);

  // New step: back to the top, and focus on the step's heading so a screen
  // reader hears where it is.
  useEffect(() => {
    if (firstStep.current) { firstStep.current = false; return; }
    try { window.scrollTo({ top: 0 }); } catch { /* old browsers */ }
    headingRef.current?.focus?.();
  }, [view]);

  const notify = (message, tone = "info") => {
    clearTimeout(toastTimer.current);
    setToast({ message, tone, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), tone === "error" ? 7000 : 4500);
  };

  const onBrief = (patch) => setBrief((b) => ({ ...b, ...patch }));

  // ── Moving between steps ───────────────────────────────────────────────────

  const pickLane = (lane) => {
    setStepError(null);
    setBrief((b) => ({ ...b, lane }));
    setFocusField(null);
    setStep("details");
  };

  /** Back to one field of the brief ("lane" is step 1). */
  const goEdit = (field) => {
    setStepError(null); setFailure(null); setOutcome(null); setLines([]);
    if (field === "lane") { setFocusField(null); setStep("what"); return; }
    setFocusField(field);
    setStep("details");
  };

  const continueBrief = () => {
    setStepError(null);
    setFocusField(null);
    setStep("check");
  };

  // ── The search ─────────────────────────────────────────────────────────────

  const onEvent = useCallback((ev) => setLines((prev) => mergeProgress(prev, ev)), []);

  const runFind = async () => {
    if (searching || !brief.lane) return;
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setStepError(null); setFailure(null); setOutcome(null); setLines([]);
    setStep("search");
    setSearching(true);
    const body = {
      lane: brief.lane,
      want: brief.want.trim(),
      interests: brief.interests,
      state: brief.state.trim(),
      citizenship: brief.citizenship || "unsure",
      grade: brief.grade ?? null,
      budget: brief.budget,
      travel: brief.travel,
      when: brief.when,
      effort: brief.effort,
      chips: brief.chips,
    };
    try {
      const final = await api.find(body, onEvent, { signal: ctl.signal });
      if (!alive.current) return;
      if (final?.type === "results" && Array.isArray(final.items)) {
        setOutcome({
          search: final.search || null,
          items: final.items,
          dropped: Array.isArray(final.dropped) ? final.dropped.filter((d) => d && typeof d === "object") : [],
          already: Number.isFinite(Number(final.already)) ? Math.max(0, Number(final.already)) : 0,
        });
        // Done with this want; the lane and interests stay for "Find more".
        setBrief((b) => ({ ...b, want: "" }));
      } else {
        const code = final?.error || "server_error";
        setFailure({ code, message: finderErrorMessage({ ...final, code }), refunded: !!final?.refunded });
      }
    } catch (e) {
      if (e?.name === "AbortError" || !alive.current) return;
      const code = e?.code;
      const message = finderErrorMessage(e);
      if (code === "stream_lost") {
        setFailure({ code, message, refunded: false });
      } else {
        // Refused before it started (a bad brief, busy, no finds left, a
        // sign-in that ended): nothing was spent. Back to where it can be fixed.
        setStepError({ message, signIn: code === "auth" });
        setStep(code === "bad_lane" ? "what" : code === "bad_want" ? "details" : "check");
        if (code === "bad_want") setFocusField("want");
      }
    } finally {
      if (abortRef.current === ctl) { setSearching(false); refreshStatus(); }
    }
  };

  // ── Results: Save and Dismiss (free, optimistic) ───────────────────────────

  const markPending = (id, on) => setPending((prev) => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  const setItemStatus = async (item, next) => {
    if (!userId || pending.has(item.id)) return;
    const before = item.status;
    const swap = (fn) => setOutcome((o) => (o ? { ...o, items: o.items.map((i) => (i.id === item.id ? fn(i) : i)) } : o));
    swap((i) => ({ ...i, status: next }));
    markPending(item.id, true);
    try {
      const saved = await api.updateItem(userId, item.id, { status: next });
      if (!alive.current) return;
      if (saved?.id) swap(() => saved);
      setAnnounce(next === "saved" ? `Saved ${short(item.title)}.` : `Dismissed ${short(item.title)}.`);
    } catch (e) {
      console.warn("[finder] save failed:", e);
      if (!alive.current) return;
      swap((i) => ({ ...i, status: before }));
      notify(`Couldn't save that change to "${short(item.title)}". It's back as it was.`, "error");
    } finally {
      if (alive.current) markPending(item.id, false);
    }
  };

  const findMore = () => {
    setOutcome(null); setLines([]); setFailure(null); setStepError(null);
    setFocusField("want");
    setStep("details");
  };

  const checkAgain = async () => {
    if (checking) return;
    setChecking(true);
    const s = await refreshStatus();
    if (alive.current) {
      setChecking(false);
      // Done now: an "already searching" refusal from before no longer applies.
      if (s && !s.running?.id) setStepError(null);
      setAnnounce(s?.running?.id ? "Talon is still searching." : "Talon is done. You can start a new find.");
    }
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
            <MascotSays agent={TALON} state="thinking" size={80} layout="stack">{TALON_LINES.error}</MascotSays>
            <p style={{ margin: "16px 0", color: TEXT_MUTED, lineHeight: 1.6 }}>
              We could not reach Talon. Nothing has been spent.
            </p>
            <Button kind="primary" onClick={() => { setPhase("loading"); setAttempt((n) => n + 1); }}>Try again</Button>
          </div>
        )}
      </div>
    );
  }

  const stepLabel = outcome ? "Results" : failure ? "Search stopped" : (STEPS.find((s) => s.key === step)?.label || "");
  // Our own search in flight or just finished owns the page; otherwise a
  // search still running from before, or nothing left to spend, replaces
  // the form.
  const ours = step === "search";
  const waiting = !ours && running;
  const stopped = !ours && !waiting && block;
  const stop = blockCopy(block);

  const failureActions = () => {
    const board = { label: "Back to your board", onClick: () => navigate?.(BOARD_PATH) };
    const rephrase = { label: "Describe it another way", onClick: () => goEdit("want") };
    switch (failure?.code) {
      case "stream_lost":
        return [{ label: "Go to your board", kind: "primary", onClick: board.onClick }];
      case "nothing_found":
      case "nothing_new":
        return [{ ...rephrase, kind: "primary" }, board];
      default:
        // The find was given back and another can start: the same search may
        // well work a minute later.
        return failure?.refunded && !block
          ? [{ label: "Try again", kind: "primary", onClick: runFind }, { label: "Change what you asked for", onClick: () => goEdit("want") }, board]
          : [{ ...board, kind: "primary" }];
    }
  };

  return (
    <div data-sidebar-offset style={pagePad}>
      <div style={{ maxWidth: 760, margin: "0 auto", width: "100%" }}>
        <button type="button" className="ag-focus" onClick={() => navigate?.(BOARD_PATH)}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, padding: "0 6px", marginLeft: -6,
            border: "none", background: "none", cursor: "pointer", fontFamily: SANS, fontSize: "0.98rem", fontWeight: 700,
            color: textOnPage(ink), borderRadius: 10 }}>
          <PixelArrow size={16} style={{ transform: "scaleX(-1)" }} />
          Your board
        </button>
        <h1 style={{ margin: "6px 0 18px", fontFamily: SANS, fontWeight: 800, fontSize: isMobile ? "1.9rem" : "2.3rem",
          color: ink.title, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
          Find opportunities
        </h1>

        {!waiting && !stopped && <StepRail steps={STEPS} current={step} agent={TALON} allDone={!!outcome} />}

        <h2 ref={headingRef} tabIndex={-1} style={SR_ONLY}>
          {waiting ? "Still searching" : stopped ? (stop?.title || "No finds left") : stepLabel}
        </h2>

        <div style={{ marginTop: 22 }}>
          {waiting ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <MascotSays agent={TALON} state="flying" size={88} layout="auto">
                Talon is still working on your last search.
              </MascotSays>
              <Card style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                <p style={{ flex: "1 1 260px", margin: 0, fontSize: "1rem", color: TEXT, lineHeight: 1.55, fontWeight: 600 }}>
                  What it finds lands on your board, usually within a couple of minutes. You can start a new find after that.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <Button kind="primary" onClick={() => navigate?.(BOARD_PATH)}>Go to your board</Button>
                  <Button kind="secondary" busy={checking} onClick={checkAgain}>Check again</Button>
                </div>
              </Card>
            </div>
          ) : stopped ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <MascotSays agent={TALON} state="idle" size={80} layout="auto">{stop?.line}</MascotSays>
              <div>
                <Button kind="primary" onClick={() => navigate?.(BOARD_PATH)}>Back to your board</Button>
              </div>
            </div>
          ) : (
            <>
              {(step === "what" || (step !== "search" && !brief.lane)) && (
                <LaneStep lane={brief.lane} onPick={pickLane} error={stepError?.message || null} />
              )}

              {step === "details" && brief.lane && (
                <BriefStep brief={brief} onBrief={onBrief} onChangeLane={() => goEdit("lane")}
                  error={stepError?.message || null} focusField={focusField} onContinue={continueBrief} />
              )}

              {step === "check" && brief.lane && (
                <CheckStep brief={brief} finds={finds} block={block} busy={searching}
                  error={stepError?.message || null}
                  errorAction={stepError?.signIn
                    ? <Button kind="secondary" onClick={() => navigate?.("/auth")}>Sign in again</Button>
                    : null}
                  onEdit={goEdit} onStart={runFind} onBoard={() => navigate?.(BOARD_PATH)} />
              )}

              {step === "search" && (
                searching ? (
                  <TalonAtWork lines={lines} onLeave={() => navigate?.(BOARD_PATH)} />
                ) : outcome ? (
                  <ResultsStep outcome={outcome} today={new Date()} pending={pending}
                    onSave={(item) => setItemStatus(item, "saved")} onDismiss={(item) => setItemStatus(item, "dismissed")}
                    onBoard={() => navigate?.(BOARD_PATH)}
                    onMore={block ? null : findMore} moreNote={stop?.short || null} />
                ) : failure ? (
                  <SearchFailure failure={failure} lines={lines} actions={failureActions()} />
                ) : (
                  <TalonAtWork lines={lines} onLeave={() => navigate?.(BOARD_PATH)} />
                )
              )}
            </>
          )}
        </div>
      </div>

      <p aria-live="polite" style={SR_ONLY}>{announce}</p>
      <BoardToast toast={toast} onDismiss={() => { clearTimeout(toastTimer.current); setToast(null); }} />
    </div>
  );
}
