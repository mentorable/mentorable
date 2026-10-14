import { useEffect } from "react";
import { getValidUser } from "../lib/auth.js";
import { counselorMe, loadStudent } from "../lib/counselor.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import CounselorShell from "../components/counselor/CounselorShell.jsx";
import { useStudentDetail } from "../components/counselor/useStudentDetail.js";
import {
  activityFacts, activityRole, awardFacts, courseLevel, coursesByGrade, gpaLines, majorsOf, sortScores, testName,
} from "../components/counselor/recordWords.js";
import {
  BackLink, ENTRY_PATH, LoadingBlock, NO_PRINT, NotShared, StateCard, firstName, gradeLine, linkProps, monthYear,
  shortDate, studentPath,
} from "../components/counselor/counselorUi.jsx";
import { Button, LinkButton, PageHeader } from "../components/ui/kit.jsx";
import { BORDER, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE } from "../components/ui/tokens.js";

// A student's record, laid out to print (/counselor/students/:studentId/record):
// who they are, then grades, test scores, courses, activities and awards. The
// counselor's own browser makes the PDF ("Print or save as PDF"); nothing is
// sent anywhere to build it.
//
// It is the Portfolio section of loadStudent (the counselor_student SQL
// function) and nothing more. When the student has not shared their
// Portfolio there is no record: the page says "Not shared" and offers
// nothing to print.

// The real calls. The page takes them as one object so it can be driven with
// made-up data when checking it by hand (see CollegeListPage).
const REAL_API = { getValidUser, counselorMe, loadStudent, print: () => window.print() };

// The sheet is sized in em, so one font size sets the whole page: 16px on
// screen, 10.5pt on paper, where it runs to one or two pages. Printed, it is
// black on white with no bar, no buttons and no card edge.
const PAPER = "cr-paper";
const RECORD_CSS = `
.${PAPER} { max-width: 820px; margin: 0 auto; box-sizing: border-box; padding: 2.4em 2.6em 2.2em; background: ${WHITE};
  border: 1px solid ${BORDER}; border-radius: 16px; font-family: ${SANS}; font-size: 16px; line-height: 1.5; color: ${TEXT}; }
.${PAPER} h1 { margin: 0; font-size: 1.9em; font-weight: 800; line-height: 1.15; letter-spacing: -0.02em; overflow-wrap: anywhere; }
.${PAPER} h2 { margin: 0 0 0.6em; padding-bottom: 0.3em; border-bottom: 1.5px solid ${TEXT}; font-size: 1em; font-weight: 800;
  letter-spacing: 0.06em; text-transform: uppercase; }
.${PAPER} h3 { margin: 0 0 0.2em; font-size: 0.9em; font-weight: 800; color: ${TEXT_MUTED}; }
.cr-over { margin: 0 0 0.3em; font-size: 0.9em; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: ${TEXT_MUTED}; }
.cr-sub { margin: 0.35em 0 0; font-size: 1.05em; font-weight: 600; color: ${TEXT_MID}; overflow-wrap: anywhere; }
.cr-section { margin-top: 1.6em; }
.cr-facts { margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(11em, 1fr)); gap: 0.6em 1.6em; }
.cr-facts dt { font-size: 0.9em; font-weight: 700; color: ${TEXT_MUTED}; }
.cr-facts dd { margin: 0; font-weight: 700; overflow-wrap: anywhere; }
.cr-table { width: 100%; border-collapse: collapse; }
.cr-table th { padding: 0 0.8em 0.3em 0; text-align: left; font-size: 0.9em; font-weight: 700; color: ${TEXT_MUTED};
  border-bottom: 1px solid ${BORDER}; }
.cr-table td { padding: 0.35em 0.8em 0.35em 0; vertical-align: top; border-bottom: 1px solid ${BORDER};
  font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.cr-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(13em, 1fr)); gap: 1em 1.6em; }
.cr-list { list-style: none; margin: 0; padding: 0; }
.cr-course { padding: 0.12em 0; overflow-wrap: anywhere; }
.cr-item { padding: 0.6em 0; border-top: 1px solid ${BORDER}; break-inside: avoid; overflow-wrap: anywhere; }
.cr-item:first-child { padding-top: 0; border-top: none; }
.cr-name { font-weight: 700; }
.cr-meta { margin: 0.1em 0 0; font-size: 0.9em; font-weight: 600; color: ${TEXT_MID}; }
.cr-desc { margin: 0.25em 0 0; color: ${TEXT_MID}; }
.cr-tag { font-size: 0.9em; font-weight: 600; color: ${TEXT_MID}; }
.cr-none { margin: 0; color: ${TEXT_MUTED}; }
.cr-foot { margin: 2em 0 0; padding-top: 0.8em; border-top: 1px solid ${BORDER}; font-size: 0.9em; color: ${TEXT_MUTED}; }
@media (max-width: 640px) { .${PAPER} { padding: 1.4em 1.1em 1.5em; border-radius: 12px; } }
@page { margin: 0.6in; }
@media print {
  .${PAPER} { max-width: none !important; margin: 0 !important; padding: 0 !important; border: none !important;
    border-radius: 0 !important; font-size: 10.5pt !important; }
  .${PAPER}, .${PAPER} * { color: #000 !important; background: transparent !important; box-shadow: none !important; }
  .${PAPER} * { border-color: #777 !important; }
  .${PAPER} h2 { border-color: #000 !important; break-after: avoid; }
  .${PAPER} h3 { break-after: avoid; }
  .cr-section { margin-top: 1.2em; }
  .cr-cols { grid-template-columns: repeat(auto-fit, minmax(10em, 1fr)); gap: 0.8em 1.4em; }
}
`;

const commas = (parts) => parts.filter(Boolean).join(", ");

function Academics({ portfolio }) {
  const gpa = gpaLines(portfolio);
  const majors = majorsOf(portfolio);
  return (
    <section className="cr-section" aria-labelledby="cr-academics">
      <h2 id="cr-academics">Academics</h2>
      {!gpa.length && !majors.length ? <p className="cr-none">No GPA or majors listed.</p> : (
        <dl className="cr-facts">
          {gpa.length ? gpa.map((g) => (
            <div key={g.label}><dt>{g.label}</dt><dd>{g.value}</dd></div>
          )) : <div><dt>GPA</dt><dd>Not listed</dd></div>}
          {majors.length > 0 && <div><dt>Majors they are considering</dt><dd>{majors.join(", ")}</dd></div>}
        </dl>
      )}
    </section>
  );
}

function Scores({ scores }) {
  const rows = sortScores(scores);
  return (
    <section className="cr-section" aria-labelledby="cr-scores">
      <h2 id="cr-scores">Test scores</h2>
      {rows.length === 0 ? <p className="cr-none">None listed.</p> : (
        <table className="cr-table">
          <thead>
            <tr><th scope="col">Test</th><th scope="col">Score</th><th scope="col">Taken</th></tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={`${s.test_type}-${s.subject}-${i}`}>
                <td className="cr-name">{testName(s)}</td>
                <td>{s.score ?? "Not listed"}</td>
                <td>{monthYear(s.test_date) || "Not listed"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Courses({ courses }) {
  const groups = coursesByGrade(courses);
  return (
    <section className="cr-section" aria-labelledby="cr-courses">
      <h2 id="cr-courses">Courses</h2>
      {groups.length === 0 ? <p className="cr-none">None listed.</p> : (
        <div className="cr-cols">
          {groups.map((g) => (
            <div key={g.key}>
              <h3>{g.label}</h3>
              <ul className="cr-list">
                {g.courses.map((c, i) => (
                  <li key={`${c.name}-${i}`} className="cr-course">
                    {c.name}
                    {(courseLevel(c) || c.planned) && (
                      <span className="cr-tag"> ({commas([courseLevel(c), c.planned ? "planned" : ""])})</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Activities({ activities }) {
  const rows = (Array.isArray(activities) ? activities : []).filter((a) => a?.title);
  return (
    <section className="cr-section" aria-labelledby="cr-activities">
      <h2 id="cr-activities">Activities</h2>
      {rows.length === 0 ? <p className="cr-none">None listed.</p> : (
        <ul className="cr-list">
          {rows.map((a, i) => (
            <li key={`${a.title}-${i}`} className="cr-item">
              <span className="cr-name">{a.title}</span>
              {activityRole(a) && <span>, {activityRole(a)}</span>}
              {activityFacts(a).length > 0 && <p className="cr-meta">{activityFacts(a).join("; ")}</p>}
              {a.description && <p className="cr-desc">{a.description}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Awards({ awards }) {
  const rows = (Array.isArray(awards) ? awards : []).filter((a) => a?.title);
  return (
    <section className="cr-section" aria-labelledby="cr-awards">
      <h2 id="cr-awards">Awards</h2>
      {rows.length === 0 ? <p className="cr-none">None listed.</p> : (
        <ul className="cr-list">
          {rows.map((a, i) => (
            <li key={`${a.title}-${i}`} className="cr-item">
              <span className="cr-name">{a.title}</span>
              {awardFacts(a).length > 0 && <span className="cr-tag"> ({awardFacts(a).join(", ")})</span>}
              {a.description && <p className="cr-desc">{a.description}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function CounselorRecordPage({ navigate, studentId, api = REAL_API }) {
  const isMobile = useIsMobile();
  const back = studentPath(studentId);
  const { phase, me, detail, error, reload } = useStudentDetail({ api, navigate, studentId, here: `${back}/record` });
  const name = detail?.student?.name || "";

  // The browser offers the tab's title as the PDF's file name, so the title
  // carries the student's name while the print window is open, and is put
  // back as soon as it closes rather than left on the tab.
  const printable = phase === "ready" && !!detail?.portfolio;
  useEffect(() => {
    if (!printable || !name) return undefined;
    let before = null;
    const onBefore = () => { if (before === null) { before = document.title; document.title = `${name} record`; } };
    const onAfter = () => { if (before !== null) { document.title = before; before = null; } };
    window.addEventListener("beforeprint", onBefore);
    window.addEventListener("afterprint", onAfter);
    return () => {
      onAfter();
      window.removeEventListener("beforeprint", onBefore);
      window.removeEventListener("afterprint", onAfter);
    };
  }, [printable, name]);

  const shell = (children) => (
    <CounselorShell me={me} active="caseload" navigate={navigate} signedIn api={api.shell}>{children}</CounselorShell>
  );
  const toCaseload = <LinkButton {...linkProps(navigate, ENTRY_PATH)}>Back to caseload</LinkButton>;

  if (phase === "loading") {
    return shell(<><BackLink navigate={navigate} to={back}>Student</BackLink><LoadingBlock label="Loading the record" /></>);
  }

  if (phase === "gone") {
    return shell(
      <>
        <BackLink navigate={navigate} to={ENTRY_PATH}>Caseload</BackLink>
        <PageHeader title="Student record" isMobile={isMobile} />
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
        <BackLink navigate={navigate} to={back}>Student</BackLink>
        <PageHeader title="Student record" isMobile={isMobile} />
        <StateCard alert title="We could not load this record"
          actions={<><Button kind="primary" onClick={reload}>Try again</Button>{toCaseload}</>}>
          {error || "Something went wrong. Try again."}
        </StateCard>
      </>,
    );
  }

  const student = detail.student;
  const shown = student.name || "Student";
  const who = firstName(shown);
  const portfolio = detail.portfolio;
  const school = me?.school?.name || "";

  return shell(
    <>
      <style>{RECORD_CSS}</style>
      <div className={NO_PRINT} style={{ maxWidth: 820, margin: "0 auto 12px", display: "flex", flexWrap: "wrap",
        alignItems: "center", justifyContent: "space-between", gap: "6px 12px" }}>
        <BackLink navigate={navigate} to={back}>{shown}</BackLink>
        {portfolio && <Button kind="primary" onClick={() => (api.print || REAL_API.print)()}>Print or save as PDF</Button>}
      </div>

      <article className={PAPER}>
        <header>
          <p className="cr-over">Student record</p>
          <h1>{shown}</h1>
          <p className="cr-sub">{commas([gradeLine(student), school])}</p>
        </header>

        {portfolio ? (
          <>
            <Academics portfolio={portfolio} />
            <Scores scores={portfolio.test_scores} />
            <Courses courses={portfolio.courses} />
            <Activities activities={portfolio.activities} />
            <Awards awards={portfolio.awards} />
            <p className="cr-foot">
              Prepared {shortDate(new Date())} from what {shown} chose to share on Mentorable. Everything here was
              entered by the student and has not been checked against school records.
            </p>
          </>
        ) : (
          <div className="cr-section">
            <NotShared who={who} />
            <p style={{ margin: "12px 0 0", fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.6 }}>
              The record is made from a student's Portfolio: their grades, scores, courses, activities and awards.
              Until {who === "This student" ? "they share" : `${who} shares`} it, there is nothing to print.
            </p>
          </div>
        )}
      </article>

      {portfolio && (
        <p className={NO_PRINT} style={{ maxWidth: 820, margin: "12px auto 0", fontFamily: SANS, fontSize: "0.95rem",
          color: TEXT_MUTED, lineHeight: 1.5 }}>
          To keep a copy, choose "Save as PDF" where the print window asks for a printer.
        </p>
      )}
    </>,
  );
}
