import { useEffect, useRef, useState } from "react";
import { getValidUser } from "../lib/auth.js";
import { counselorErrorMessage, counselorMe, loadStudent, removeStudent } from "../lib/counselor.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import CounselorShell from "../components/counselor/CounselorShell.jsx";
import {
  CollegeListSection, EssaysSection, MeetingsSection, NothingShared, PortfolioSection, QuestSection,
} from "../components/counselor/StudentSections.jsx";
import {
  STUDENT_SECTIONS, StudentStrip, panelId, tabId, useOpenSection,
} from "../components/counselor/StudentStrip.jsx";
import { useStudentDetail } from "../components/counselor/useStudentDetail.js";
import {
  BackLink, ConfirmSheet, ENTRY_PATH, LoadingBlock, SCHEDULE_PATH, StateCard, firstName, gradeLine, linkProps,
  recordPath, shortDate, studentPath,
} from "../components/counselor/counselorUi.jsx";
import { Button, LinkButton, Notice, PageHeader } from "../components/ui/kit.jsx";
import { DANGER, FOCUS_CLASS, RADIUS, WHITE } from "../components/ui/tokens.js";

// One student, as their counselor sees them (/counselor/students/:studentId),
// on one screen before a meeting: who they are, a strip of four tiles saying
// where each section they may share stands (or that it is not shared), the
// section picked opened in full under the strip, and beside it the meeting
// requests they sent. Read-only. A section the student has not shared says
// "Not shared" and why; it is never an error.
//
// Everything on the page comes from one call, loadStudent (the
// counselor_student SQL function), which answers only for a student linked to
// this counselor's school and only with the sections that student shares.
// A student who left, was removed, or was never here all look the same:
// "not linked".

// The real calls. The page takes them as one object so it can be driven with
// made-up data when checking it by hand (see CollegeListPage).
const REAL_API = { getValidUser, counselorMe, loadStudent, removeStudent };

export default function CounselorStudentPage({ navigate, studentId, api = REAL_API }) {
  const isMobile = useIsMobile();
  const wide = !useIsMobile(1024);        // the requests beside the open section, not under it
  const roomy = !useIsMobile(1180);       // room for the requests column at full width
  const fourUp = !useIsMobile(860);       // the tiles in one row, not two by two
  const tableRoom = !useIsMobile(700);
  // The College list as one table where it has the room (full width, or the
  // whole row), otherwise a list per group.
  const tableView = roomy || (!wide && tableRoom);
  const { phase, me, detail, error, reload } = useStudentDetail({ api, navigate, studentId, here: studentPath(studentId) });
  const [open, choose] = useOpenSection(studentId, detail);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const [removed, setRemoved] = useState("");   // the name of the student just removed
  const alive = useRef(true);
  const removedRef = useRef(null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  // The page they were reading is gone once the student is removed: move
  // focus to what replaced it.
  useEffect(() => { if (removed) removedRef.current?.focus(); }, [removed]);

  const remove = async () => {
    if (removing || !detail?.student) return;
    setRemoving(true);
    setRemoveError("");
    try {
      await api.removeStudent(studentId);
      if (!alive.current) return;
      setRemoveOpen(false);
      setRemoved(detail.student.name || "This student");
    } catch (e) {
      if (!alive.current) return;
      // Already gone (they left a moment ago): the same end, so say so.
      if (e?.code === "not_linked") {
        setRemoveOpen(false);
        setRemoved(detail.student.name || "This student");
      } else {
        setRemoveError(counselorErrorMessage(e));
      }
    } finally {
      if (alive.current) setRemoving(false);
    }
  };

  const shell = (children) => (
    <CounselorShell me={me} active="caseload" navigate={navigate} signedIn api={api.shell}>
      <BackLink navigate={navigate} to={ENTRY_PATH}>Caseload</BackLink>
      {children}
    </CounselorShell>
  );
  const toCaseload = <LinkButton {...linkProps(navigate, ENTRY_PATH)}>Back to caseload</LinkButton>;

  if (removed) {
    return shell(
      <>
        <PageHeader title="Removed from your school" isMobile={isMobile} />
        <div ref={removedRef} tabIndex={-1} style={{ outline: "none" }}>
          <StateCard title={`${removed} is no longer linked`} actions={toCaseload}>
            You no longer see anything they shared, and their meeting requests are removed from your schedule. They
            can join again with your join code.
          </StateCard>
        </div>
      </>,
    );
  }

  if (phase === "loading") return shell(<LoadingBlock label="Loading this student" />);

  if (phase === "gone") {
    return shell(
      <>
        <PageHeader title="Student" isMobile={isMobile} />
        <StateCard title="This student is not linked to your school" actions={toCaseload}>
          They may have left your school, or this link may be wrong. A student can leave at any time, and from then
          on you no longer see what they shared.
        </StateCard>
      </>,
    );
  }

  if (phase === "error" || !detail?.student) {
    return shell(
      <>
        <PageHeader title="Student" isMobile={isMobile} />
        <StateCard alert title="We could not load this student"
          actions={<><Button kind="primary" onClick={reload}>Try again</Button>{toCaseload}</>}>
          {error || "Something went wrong. Try again."}
        </StateCard>
      </>,
    );
  }

  const student = detail.student;
  const name = student.name || "Student";
  const who = firstName(name);
  const requests = Array.isArray(detail.requests) ? detail.requests : [];
  const waiting = requests.filter((r) => r?.status === "pending").length;
  const since = shortDate(student.linked_at);

  // The open section, in full. The tiles are its tabs; with nothing shared
  // there is no tab, and the space says so instead.
  const sections = {
    college_list: () => <CollegeListSection data={detail.college_list} who={who} table={tableView} />,
    portfolio: () => <PortfolioSection data={detail.portfolio} who={who} studentId={studentId} navigate={navigate} />,
    quest: () => <QuestSection data={detail.quest} who={who} />,
    essays: () => <EssaysSection data={detail.essays} who={who} />,
  };
  const anyShared = STUDENT_SECTIONS.some((s) => detail[s.key]);
  const shown = anyShared && Object.prototype.hasOwnProperty.call(sections, open) ? open : null;
  const panel = shown ? (
    <div role="tabpanel" id={panelId(shown)} aria-labelledby={tabId(shown)} tabIndex={0} className={FOCUS_CLASS}
      style={{ minWidth: 0, borderRadius: RADIUS.card }}>
      {sections[shown]()}
    </div>
  ) : (
    <NothingShared who={who} />
  );

  return shell(
    <>
      <PageHeader isMobile={isMobile} style={{ margin: "0 0 1.1rem" }}
        title={(
          <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {name}
            <button type="button" className={FOCUS_CLASS} aria-label={`Remove ${name} from my school`}
              onClick={() => { setRemoveError(""); setRemoveOpen(true); }}
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, padding: 0,
                background: WHITE, color: DANGER, border: `1.5px solid ${DANGER}`, borderRadius: RADIUS.control, cursor: "pointer" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5" />
              </svg>
            </button>
          </span>
        )}
        action={detail.portfolio && (
          <LinkButton {...linkProps(navigate, recordPath(studentId))}>Open the printable record</LinkButton>
        )}>
        {gradeLine(student)}{since ? `. Joined your school ${since}.` : "."}
      </PageHeader>

      {/* Beside the open section the waiting request is in view; under it, it
          could be a long way down, so say so up here. */}
      {!wide && waiting > 0 && (
        <Notice tone="warn" style={{ marginBottom: 16, maxWidth: 760 }}
          action={<LinkButton {...linkProps(navigate, SCHEDULE_PATH)}>Open the schedule</LinkButton>}>
          {waiting === 1
            ? `${who} has a meeting request waiting for your answer.`
            : `${who} has ${waiting} meeting requests waiting for your answer.`}
        </Notice>
      )}

      <StudentStrip detail={detail} who={who} open={shown} onOpen={choose} fourUp={fourUp} />

      <div style={{ display: "grid", gridTemplateColumns: wide ? `minmax(0, 1fr) ${roomy ? 340 : 300}px` : "minmax(0, 1fr)", gap: 16,
        alignItems: "start", marginTop: fourUp ? 20 : 16 }}>
        {panel}
        <MeetingsSection requests={requests} who={who} navigate={navigate} />
      </div>

      <ConfirmSheet open={removeOpen} titleId="cs-remove-title" title={`Remove ${name} from your school?`}
        confirmLabel="Remove" kind="danger" busy={removing} error={removeError} onConfirm={remove}
        onClose={() => setRemoveOpen(false)}>
        <p style={{ margin: 0 }}>
          You will stop seeing everything {who === "This student" ? "they" : who} shared, at once, and their
          meeting requests, a confirmed meeting included, will be removed from your schedule. They can join again
          with your join code.
        </p>
      </ConfirmSheet>
    </>,
  );
}
