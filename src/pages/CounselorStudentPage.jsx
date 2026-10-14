import { useEffect, useRef, useState } from "react";
import { getValidUser } from "../lib/auth.js";
import { SHARES, counselorErrorMessage, counselorMe, loadStudent, removeStudent } from "../lib/counselor.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import CounselorShell from "../components/counselor/CounselorShell.jsx";
import {
  CollegeListSection, EssaysSection, MeetingsSection, PortfolioSection, QuestSection,
} from "../components/counselor/StudentSections.jsx";
import { useStudentDetail } from "../components/counselor/useStudentDetail.js";
import {
  BackLink, ConfirmSheet, ENTRY_PATH, LoadingBlock, SCHEDULE_PATH, StateCard, firstName, gradeLine, linkProps,
  recordPath, shortDate, studentPath,
} from "../components/counselor/counselorUi.jsx";
import { Button, Heading, LinkButton, Notice, PageHeader } from "../components/ui/kit.jsx";
import { BORDER, SANS, TEXT_MID } from "../components/ui/tokens.js";

// One student, as their counselor sees them (/counselor/students/:studentId):
// who they are, a card for each of the four sections they may share, and the
// meeting requests they sent. Read-only. A section the student has not shared
// says "Not shared" and why; it is never an error.
//
// Everything on the page comes from one call, loadStudent (the
// counselor_student SQL function), which answers only for a student linked to
// this counselor's school and only with the sections that student shares.
// A student who left, was removed, or was never here all look the same:
// "not linked".

// The real calls. The page takes them as one object so it can be driven with
// made-up data when checking it by hand (see CollegeListPage).
const REAL_API = { getValidUser, counselorMe, loadStudent, removeStudent };

const joined = (parts) => (parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts.join(""));

/** Which sections this student shares, in a sentence. A section counts as
 *  shared when the server sent it, whatever the switches say. */
function SharingLine({ detail, who }) {
  const shared = SHARES.filter((s) => detail[s.key]).map((s) => s.label);
  const kept = SHARES.filter((s) => !detail[s.key]).map((s) => s.label);
  let line;
  if (!shared.length) {
    line = `${who} has not shared any sections with you yet. You see their name, grade and graduation year, and any meeting requests they send.`;
  } else if (!kept.length) {
    line = `${who} shares all ${SHARES.length} sections with you.`;
  } else {
    line = `${who} shares ${joined(shared)} with you. ${joined(kept)} ${kept.length === 1 ? "is" : "are"} not shared.`;
  }
  return <p style={{ margin: "0 0 18px", fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT_MID, lineHeight: 1.55 }}>{line}</p>;
}

export default function CounselorStudentPage({ navigate, studentId, api = REAL_API }) {
  const isMobile = useIsMobile();
  const twoColumns = !useIsMobile(1000);
  const { phase, me, detail, error, reload } = useStudentDetail({ api, navigate, studentId, here: studentPath(studentId) });
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
  const waiting = requests.filter((r) => r.status === "pending").length;
  const since = shortDate(student.linked_at);

  const list = <CollegeListSection data={detail.college_list} who={who} />;
  const quest = <QuestSection data={detail.quest} who={who} />;
  const essays = <EssaysSection data={detail.essays} who={who} />;
  const portfolio = <PortfolioSection data={detail.portfolio} who={who} studentId={studentId} navigate={navigate} />;
  const meetings = <MeetingsSection requests={requests} who={who} navigate={navigate} />;
  const column = { display: "grid", gap: 16, alignContent: "start", minWidth: 0 };

  return shell(
    <>
      <PageHeader title={name} isMobile={isMobile} style={{ margin: "0 0 1rem" }}
        action={detail.portfolio && (
          <LinkButton {...linkProps(navigate, recordPath(studentId))}>Open the printable record</LinkButton>
        )}>
        {gradeLine(student)}{since ? `. Joined your school ${since}.` : "."}
      </PageHeader>

      {waiting > 0 && (
        <Notice tone="warn" style={{ marginBottom: 16, maxWidth: 760 }}
          action={<LinkButton {...linkProps(navigate, SCHEDULE_PATH)}>Open the schedule</LinkButton>}>
          {waiting === 1
            ? `${who} has a meeting request waiting for your answer.`
            : `${who} has ${waiting} meeting requests waiting for your answer.`}
        </Notice>
      )}

      <SharingLine detail={detail} who={who} />

      {twoColumns ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
          <div style={column}>{list}{portfolio}</div>
          <div style={column}>{quest}{essays}{meetings}</div>
        </div>
      ) : (
        <div style={column}>{list}{quest}{essays}{portfolio}{meetings}</div>
      )}

      <section aria-labelledby="cs-remove" style={{ marginTop: 32, paddingTop: 20, borderTop: `1px solid ${BORDER}`, maxWidth: 760 }}>
        <Heading id="cs-remove" style={{ fontSize: "1.15rem" }}>Remove from my school</Heading>
        <p style={{ margin: "6px 0 14px", fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.6 }}>
          This unlinks {name} from your school. You stop seeing everything they shared, and their meeting requests,
          answered or not, are removed from your schedule. They can join again with your join code.
        </p>
        <Button kind="danger" onClick={() => { setRemoveError(""); setRemoveOpen(true); }}>Remove from my school</Button>
      </section>

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
