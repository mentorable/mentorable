import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { getValidUser } from "../lib/auth.js";
import { useTheme } from "../lib/ThemeContext.jsx";
import { attention, counselorErrorMessage, counselorMe, createSchool, loadCaseload } from "../lib/counselor.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import CounselorShell from "../components/counselor/CounselorShell.jsx";
import CounselorAuthCard from "../components/counselor/CounselorAuthCard.jsx";
import SchoolSetup from "../components/counselor/SchoolSetup.jsx";
import CaseloadControls from "../components/counselor/CaseloadControls.jsx";
import CaseloadEmpty from "../components/counselor/CaseloadEmpty.jsx";
import CaseloadTable, { CaseloadCards, CaseloadSkeleton, useGridFits } from "../components/counselor/CaseloadTable.jsx";
import { cleanSort, filterRows, gradesIn, nextSort, sortRows } from "../components/counselor/caseloadRules.js";
import { LoadingBlock, StateCard, nextFromUrl } from "../components/counselor/counselorUi.jsx";
import { Button, Card, Notice, PageHeader, SR_ONLY } from "../components/ui/kit.jsx";
import { SANS, TEXT_MID, TEXT_MUTED } from "../components/ui/tokens.js";

// The counselor's entry page and home (/counselor), unlisted: nothing in the
// student app links here. It is three things, by who is looking:
//   signed out            a sign-in and sign-up card, on this page
//   signed in, no school  "Set up your school", which makes the join code
//   a counselor           the caseload, one row per linked student
//
// A counselor sees a student only once that student has entered the join
// code, and of each student only the sections they chose to share. Every read
// here is one of the counselor SQL functions (src/lib/counselor.js); the page
// has no other way to a student's data and keeps none of it in the browser.

// The real calls. The page takes them as one object so it can be driven with
// made-up data when checking it by hand (see CollegeListPage).
const REAL_API = {
  getValidUser, counselorMe, createSchool, loadCaseload,
  signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
  // The confirmation link returns here, never to student onboarding. Supabase
  // only honours that address when it is on the project's list of allowed
  // redirects; otherwise the link opens the home page. So the account also
  // carries a note that it was made here, which the app reads to send it back
  // (routeAfterAuth in App.jsx). The note decides where a new account lands
  // and nothing else: it gives no access to anything.
  signUp: (email, password) => supabase.auth.signUp({
    email, password,
    options: { emailRedirectTo: `${window.location.origin}/counselor`, data: { counselor_signup: true } },
  }),
  // Someone signed in from another tab (the confirmation link opens one).
  // The callback is put off a tick: Supabase must not be called from inside
  // its own auth event.
  onSignedIn: (run) => {
    const { data } = supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_IN") setTimeout(run, 0); });
    return () => data?.subscription?.unsubscribe();
  },
  accentOf: async (userId) => {
    const { data } = await supabase.from("profiles").select("profile_color").eq("id", userId).maybeSingle();
    return data?.profile_color || null;
  },
};

// The grade, the filters and the order, for this browser tab only,
// so they are still set after a look at one student. Never a name or a search.
const SHARE_KEYS = ["college_list", "portfolio", "quest", "essays"];
const PREFS_KEY = "mentorable.counselorCaseload";
function readPrefs() {
  try {
    const v = JSON.parse(sessionStorage.getItem(PREFS_KEY) || "null");
    return v && typeof v === "object" ? v : {};
  } catch { return {}; }
}
function writePrefs(prefs) {
  try { sessionStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage blocked: the filters just reset */ }
}

/** A row's attention marks, whatever shape the row is in. */
function marksOf(row) {
  try {
    const marks = attention(row);
    return Array.isArray(marks) ? marks : [];
  } catch {
    return [];
  }
}

export default function CounselorPage({ navigate, api = REAL_API }) {
  const isMobile = useIsMobile();
  const wide = useGridFits();   // the grid needs the room; below it the students are compact cards
  const { setAccent } = useTheme();
  const [prefs] = useState(readPrefs);
  const [phase, setPhase] = useState("loading");   // loading | signedout | setup | ready | error
  const [user, setUser] = useState(null);
  const [me, setMe] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [announce, setAnnounce] = useState("");
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState(() => (Number.isFinite(Number(prefs.grade)) && prefs.grade !== null ? Number(prefs.grade) : null));
  const [onlyAttention, setOnlyAttention] = useState(!!prefs.attention);
  const [shares, setShares] = useState(() => (Array.isArray(prefs.shares) ? prefs.shares.filter((k) => SHARE_KEYS.includes(k)) : []));
  const [sort, setSort] = useState(() => cleanSort(prefs.sort));
  const alive = useRef(true);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const loads = useRef(0);        // counts loads, so only the newest one settles the page
  const loading = useRef(false);  // a load is on its way (see the sign-in listener)

  const load = useCallback(async () => {
    const turn = ++loads.current;
    const stale = () => !alive.current || turn !== loads.current;
    loading.current = true;
    setPhase("loading");
    setError("");
    setRefreshError("");
    try {
      const signedIn = await api.getValidUser();
      if (stale()) return;
      if (!signedIn) {
        setUser(null); setMe(null); setRows([]);
        setPhase("signedout");
        return;
      }
      setUser(signedIn);
      // Both at once. Without a school the caseload is refused, which is not
      // an error here: that person is about to set one up.
      const [mine, list] = await Promise.all([
        api.counselorMe(),
        api.loadCaseload().then((r) => ({ rows: r }), (e) => ({ failed: e })),
      ]);
      if (stale()) return;
      if (!mine) {
        setMe(null); setRows([]);
        setPhase("setup");
        return;
      }
      // Sent here to sign in from another counselor page: go back to it.
      const next = nextFromUrl();
      if (next && navigate) { navigate(next, { replace: true }); return; }
      // The school is known even when its students could not be read, so
      // the bar still names it and still leads to the schedule.
      setMe(mine);
      if (list.failed) throw list.failed;
      setRows(Array.isArray(list.rows) ? list.rows : []);
      setPhase("ready");
    } catch (e) {
      console.error("[counselor] load failed:", e?.code || e?.message || "error");
      if (stale()) return;
      setError(counselorErrorMessage(e));
      setPhase("error");
    } finally {
      if (turn === loads.current) loading.current = false;
    }
  }, [api, navigate]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; };
  }, [load]);

  // The sign-in card is showing and someone signs in elsewhere in this
  // browser: carry on without making them sign in twice. Signing in on the
  // card itself fires this too, and by then the card has started its own
  // load, so that one is left alone.
  useEffect(() => {
    if (!api.onSignedIn) return undefined;
    return api.onSignedIn(() => {
      if (alive.current && !loading.current && phaseRef.current === "signedout") load();
    });
  }, [api, load]);

  useEffect(() => {
    writePrefs({ grade, attention: onlyAttention, shares, sort });
  }, [grade, onlyAttention, shares, sort]);

  const onEntered = useCallback(async (signedIn) => {
    // The page's colour is the signed-in person's own; the app looked it up
    // before anyone had signed in.
    if (signedIn?.id && api.accentOf) {
      api.accentOf(signedIn.id)
        .then((color) => { if (color && alive.current) setAccent(color); })
        .catch(() => { /* the default colour stays */ });
    }
    await load();
  }, [api, load, setAccent]);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError("");
    setAnnounce("");
    try {
      const list = await api.loadCaseload();
      if (!alive.current) return;
      setRows(Array.isArray(list) ? list : []);
      setAnnounce("Caseload updated.");
    } catch (e) {
      if (alive.current) setRefreshError(counselorErrorMessage(e));
    } finally {
      if (alive.current) setRefreshing(false);
    }
  };

  // ── What shows ────────────────────────────────────────────────────────────

  const marks = useMemo(() => new Map(rows.map((r) => [r.student_id, marksOf(r)])), [rows]);
  const marksFor = useCallback((row) => marks.get(row.student_id) || [], [marks]);
  const grades = useMemo(() => gradesIn(rows), [rows]);
  // A grade remembered from earlier that nobody is in now means every grade.
  const gradeOn = grade !== null && grades.includes(grade) ? grade : null;
  const shown = useMemo(
    () => sortRows(filterRows(rows, { grade: gradeOn, onlyAttention, shares, query }, marksFor), sort, marksFor),
    [rows, gradeOn, onlyAttention, shares, query, sort, marksFor],
  );
  const attentionCount = useMemo(() => rows.filter((r) => marksFor(r).length > 0).length, [rows, marksFor]);
  const waiting = useMemo(() => rows.reduce((n, r) => n + (Number(r.pending_requests) > 0 ? Number(r.pending_requests) : 0), 0), [rows]);
  const filtered = gradeOn !== null || onlyAttention || shares.length > 0 || query.trim() !== "";
  const clearFilters = () => { setQuery(""); setGrade(null); setOnlyAttention(false); setShares([]); };

  const shell = (children, extra = {}) => (
    <CounselorShell me={me} active="caseload" navigate={navigate} pending={waiting} signedIn={!!user} api={api.shell}
      onJoinCode={(code) => setMe((m) => (m?.school ? { ...m, school: { ...m.school, join_code: code } } : m))} {...extra}>
      {children}
    </CounselorShell>
  );

  if (phase === "loading") {
    // Before the first answer there is no telling which of the three this is.
    return shell(me ? (
      <>
        <PageHeader title="Caseload" isMobile={isMobile} />
        <p role="status" style={SR_ONLY}>Loading your caseload</p>
        <CaseloadSkeleton wide={wide} />
      </>
    ) : <LoadingBlock label="Loading" />);
  }

  if (phase === "signedout") {
    return shell(<CounselorAuthCard api={api} onEntered={onEntered} />, { me: null, signedIn: false });
  }

  if (phase === "setup") {
    return shell(
      <SchoolSetup email={user?.email || ""} api={api} onAlready={load}
        onCreated={(mine) => { setMe(mine); setRows([]); setPhase("ready"); }} />,
      { me: null },
    );
  }

  if (phase === "error") {
    return shell(
      <>
        <PageHeader title="Caseload" isMobile={isMobile} />
        <StateCard alert title="We could not load your caseload" actions={<Button kind="primary" onClick={load}>Try again</Button>}>
          {error}
        </StateCard>
      </>,
    );
  }

  const schoolName = me?.school?.name || "your school";
  const total = rows.length;

  // With students, the page is the grid: a title, the controls and one line
  // per student, so as many as possible fit before scrolling.
  return shell(
    <>
      <PageHeader title="Caseload" isMobile={isMobile} style={{ margin: total > 0 ? "0 0 1rem" : "0 0 1.25rem" }}
        action={total > 0 && <Button kind="secondary" onClick={refresh} busy={refreshing}>Refresh</Button>}>
        {total === 0 && <>Students linked to {schoolName} show up here, with what each one chose to share.</>}
      </PageHeader>

      {refreshError && (
        <Notice tone="error" onDismiss={() => setRefreshError("")} style={{ marginBottom: 14 }}>{refreshError}</Notice>
      )}

      {total === 0 ? (
        <CaseloadEmpty code={me?.school?.join_code || ""} />
      ) : (
        <>
          <CaseloadControls query={query} onQuery={setQuery} grades={grades} grade={gradeOn} onGrade={setGrade}
            onlyAttention={onlyAttention} onAttention={setOnlyAttention} attentionCount={attentionCount}
            shares={shares} onShares={setShares}
            sort={sort} onSort={setSort} showSort={!wide} isMobile={isMobile} />

          <div style={{ marginTop: 14 }}>
            {shown.length === 0 ? (
              <Card style={{ maxWidth: 560 }}>
                <p style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT_MID, lineHeight: 1.5 }}>
                  No students match. Try another name, or clear the filters to see everyone.
                </p>
                <Button kind="secondary" onClick={clearFilters} style={{ marginTop: 12 }}>Clear filters</Button>
              </Card>
            ) : (
              <>
                {wide ? (
                  <CaseloadTable rows={shown} marksFor={marksFor} sort={sort} onSort={(key) => setSort((s) => nextSort(s, key))}
                    navigate={navigate} schoolName={me?.school?.name} />
                ) : (
                  <CaseloadCards rows={shown} marksFor={marksFor} navigate={navigate} />
                )}
                <p style={{ margin: "10px 2px 0", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 500, color: TEXT_MUTED,
                  lineHeight: 1.5 }}>
                  Open a student for the rest: their essays&apos; word counts and supplements, the note on their list&apos;s
                  balance, and what is in their portfolio. You see only what each student chose to share.
                </p>
              </>
            )}
          </div>
        </>
      )}

      <p aria-live="polite" style={SR_ONLY}>{announce}</p>
    </>,
  );
}
