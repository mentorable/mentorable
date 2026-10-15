import { formatWhen, listNote } from "../../lib/counselor.js";
import { PixelStamp } from "../ui/PixelIcons.jsx";
import { Card, Heading, LinkButton, SR_ONLY, StampTile } from "../ui/kit.jsx";
import {
  AMBER_BG, BORDER, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../ui/tokens.js";
import {
  activityRole, essayLines, gpaLines, listCounts, majorsOf, schoolFacts, sortScores, testName,
} from "./recordWords.js";
import {
  NotShared, Pill, SCHEDULE_PATH, SectionCard, linkProps, monthYear, plural, recordPath, shortDate,
} from "./counselorUi.jsx";

// One student's shared sections, as the student page opens them under the
// progress strip (StudentStrip.jsx): College list, Portfolio, Quest, Essay
// progress, and beside them the meeting requests they sent. A section is given
// exactly what counselor_student() returned: `null` means the student has not
// shared it, and the card says so and why. Nothing here can show more than
// that function returned.

/** A table's own entry for a key that came from the database, or undefined. */
const own = (table, key) => (Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined);
const text = (v) => (typeof v === "string" ? v.trim() : "");
const num = (v) => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== "" && Number.isFinite(n) ? n : null;
};
/** A whole count from the database, never negative. */
export const wholeCount = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0);

const body = { fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.55 };
const quiet = { margin: 0, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.5 };
const privacy = { ...quiet, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${BORDER}` };
const subHeading = { fontSize: "1rem" };

/** Short phrases side by side, wrapping as they need to. */
function Facts({ items, style }) {
  if (!items.length) return null;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: "2px 16px", ...style }}>
      {items.map((f, i) => (
        <li key={`${f}-${i}`} style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MID, lineHeight: 1.5,
          fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>
          {f}
        </li>
      ))}
    </ul>
  );
}

/** A labelled fact: the label small above its value. */
function Stat({ label, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <dt style={{ fontFamily: SANS, fontSize: "0.9rem", fontWeight: 700, color: TEXT_MUTED, lineHeight: 1.4 }}>{label}</dt>
      <dd style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", fontWeight: 700, color: TEXT, lineHeight: 1.4,
        fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>
        {children}
      </dd>
    </div>
  );
}
const statGrid = { margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "12px 18px" };

// ─── Nothing shared ───────────────────────────────────────────────────────────

/** In place of an open section when the student shares none of the four. */
export function NothingShared({ who }) {
  return (
    <Card as="section" aria-labelledby="cs-nothing" style={{ padding: "1.1rem 1.2rem 1.25rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <StampTile kind="lock" size={40} lit={false} />
        <Heading id="cs-nothing" style={{ flex: 1, minWidth: 0 }}>Nothing shared yet</Heading>
      </div>
      <p style={{ ...body, margin: 0, maxWidth: "62ch" }}>
        {who} has not shared any sections with you yet. You see their name, grade and graduation year, and any meeting
        requests they send. Each student chooses what their counselor sees, and can change it at any time.
      </p>
    </Card>
  );
}

// ─── College list ─────────────────────────────────────────────────────────────

const GROUPS = [
  { key: "reach", label: "Reach", stamp: "peak" },
  { key: "target", label: "Target", stamp: "target" },
  { key: "likely", label: "Likely", stamp: "check" },
];
const OTHER = { key: "other", label: "Not sorted yet", stamp: "question" };

/** How a school came to be in its group, in a few words, or "". */
function sortedBy(school, who) {
  switch (text(school?.category_source)) {
    case "student": return who === "This student" ? "Sorted by the student" : `Sorted by ${who}`;
    case "suggested": return "Sorted by scores and admit rate";
    case "rough": return "A rough guess, with no test score to compare";
    default: return "";
  }
}
const placeOf = (s) => [text(s?.city), text(s?.state)].filter(Boolean).join(", ");
function rateOf(s) {
  const n = num(s?.admission_rate);
  if (n === null || n < 0) return "";
  return n >= 1 ? "Open admission" : `${Math.round(n * 100)}%`;
}
function priceOf(s) {
  const n = num(s?.net_price);
  return n === null || n < 0 ? "" : `$${Math.round(n).toLocaleString("en-US")}`;
}

const cellText = { fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MID, lineHeight: 1.4,
  fontVariantNumeric: "tabular-nums" };
const missing = <span style={{ fontWeight: 500, color: TEXT_MUTED }}>Not on file</span>;

/** Every school in one table, reach first, with its group in the last column. */
function ListTable({ groups, who }) {
  const th = (label, style) => (
    <th scope="col" style={{ padding: "0 12px 8px", textAlign: "left", verticalAlign: "bottom", fontFamily: SANS,
      fontSize: "0.9rem", fontWeight: 800, color: TEXT_MUTED, lineHeight: 1.3, ...style }}>
      {label}
    </th>
  );
  const td = { ...cellText, padding: "9px 12px", verticalAlign: "top" };
  const rows = groups.flatMap((g) => g.schools.map((s, i) => ({ s, g, key: `${g.key}-${i}-${s?.name}` })));
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <caption style={SR_ONLY}>The schools on the list, reach first, each with its group</caption>
      <thead>
        <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
          {th("School", { paddingLeft: 0 })}
          {th("Where")}
          {th("Admitted")}
          {th("Average net price")}
          {th("Group", { paddingRight: 0 })}
        </tr>
      </thead>
      <tbody>
        {rows.map(({ s, g, key }, i) => (
          // "Open admission" may wrap; a percentage or a price never does.
          <tr key={key} style={{ borderTop: i ? `1px solid ${BORDER}` : "none" }}>
            <th scope="row" style={{ padding: "9px 12px 9px 0", textAlign: "left", verticalAlign: "top", fontFamily: SANS,
              fontSize: "1rem", fontWeight: 700, color: TEXT, lineHeight: 1.35, overflowWrap: "anywhere" }}>
              {s?.name || "A school"}
              {sortedBy(s, who) && (
                <span style={{ display: "block", ...quiet, fontSize: "0.9rem", lineHeight: 1.4 }}>{sortedBy(s, who)}</span>
              )}
            </th>
            <td style={{ ...td, overflowWrap: "anywhere" }}>{placeOf(s) || missing}</td>
            <td style={{ ...td, whiteSpace: rateOf(s) === "Open admission" ? "normal" : "nowrap" }}>{rateOf(s) || missing}</td>
            <td style={{ ...td, whiteSpace: "nowrap" }}>{priceOf(s) || missing}</td>
            <td style={{ ...td, paddingRight: 0 }}><Pill>{g.label}</Pill></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The same schools grouped under a heading each, for a narrow screen. */
function ListGroups({ groups, who }) {
  const ink = useAgentInk();
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {groups.map((g) => (
        <div key={g.key}>
          <Heading level={3} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span aria-hidden="true" style={{ display: "flex", color: g.schools.length ? ink.text : TEXT_MUTED }}>
              <PixelStamp kind={g.stamp} size={16} />
            </span>
            {g.label}
            <span style={{ fontWeight: 600, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>{g.schools.length}</span>
          </Heading>
          {g.schools.length === 0 ? (
            <p style={{ ...quiet, marginTop: 4 }}>None on their list.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>
              {g.schools.map((s, i) => (
                <li key={`${s?.name}-${i}`} style={{ padding: "9px 0", borderTop: i ? `1px solid ${BORDER}` : "none" }}>
                  <p style={{ margin: 0, fontFamily: SANS, fontSize: "1.02rem", fontWeight: 700, color: TEXT, lineHeight: 1.35,
                    overflowWrap: "anywhere" }}>
                    {s?.name || "A school"}
                  </p>
                  <Facts items={schoolFacts(s)} style={{ marginTop: 2 }} />
                  {sortedBy(s, who) && <p style={{ ...quiet, marginTop: 2 }}>{sortedBy(s, who)}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

/** The whole list with its groups and the balance note the student sees.
 *  `table`: one table (wide screens) rather than a list per group. */
export function CollegeListSection({ data, who, table = true }) {
  const title = "College list";
  if (!data) return <SectionCard id="cs-list" title={title}><NotShared who={who} /></SectionCard>;
  const schools = (Array.isArray(data.schools) ? data.schools : []).filter((s) => s && typeof s === "object");
  const note = listNote(listCounts(schools));
  const other = schools.filter((s) => !GROUPS.some((g) => g.key === s.category));
  const grouped = GROUPS.map((g) => ({ ...g, schools: schools.filter((s) => s.category === g.key) }));
  const groups = [...grouped, ...(other.length ? [{ ...OTHER, schools: other }] : [])];
  return (
    <SectionCard id="cs-list" title={title} aside={schools.length > 0 && <Pill>{plural(schools.length, "school")}</Pill>}>
      {schools.length === 0 ? (
        <p style={{ ...body, margin: 0 }}>{who} shares their College List, and has not added a school to it yet.</p>
      ) : (
        <>
          {note && (
            <p style={{ ...body, margin: "0 0 14px", background: SURFACE, border: `1px solid ${BORDER}`,
              borderRadius: RADIUS.control, padding: "10px 14px" }}>
              <strong style={{ fontWeight: 800, color: TEXT }}>The note they see about its balance:</strong> {note}
            </p>
          )}
          {table ? <ListTable groups={groups} who={who} /> : <ListGroups groups={groups} who={who} />}
          <p style={privacy}>Admit rates and net prices come from the U.S. Department of Education. A group is a starting point, not a prediction.</p>
        </>
      )}
    </SectionCard>
  );
}

// ─── Quest ────────────────────────────────────────────────────────────────────

/** A quest's status in words, for the statuses a counselor is shown. */
const QUEST_STATUS = {
  active: { label: "Active", tone: "accent" },
  paused: { label: "Paused", tone: "neutral" },
  completed: { label: "Finished", tone: "neutral" },
};
export const questStatus = (quest) => own(QUEST_STATUS, quest?.status);

/** Milestones in their order. */
export const milestonesOf = (quest) => (Array.isArray(quest?.milestones) ? quest.milestones : [])
  .filter((m) => m && typeof m === "object")
  .sort((a, b) => wholeCount(a.position) - wholeCount(b.position));

function Milestones({ milestones, active }) {
  const ink = useAgentInk();
  const current = milestones.findIndex((m) => m.status !== "done");
  return (
    // Down the first column, then the second, when there is room for two.
    <ol style={{ listStyle: "none", margin: "8px 0 0", padding: 0, columns: "260px 2", columnGap: 18 }}>
      {milestones.map((m, i) => {
        const done = m.status === "done";
        const here = !done && i === current;
        const state = done ? "Done" : here ? (active ? "In progress" : "Next up") : "Not started";
        return (
          <li key={`${m.position}-${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 10, paddingBottom: 8,
            breakInside: "avoid" }}>
            <span aria-hidden="true" style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, boxSizing: "border-box",
              display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontSize: "0.9rem",
              fontWeight: 800, fontVariantNumeric: "tabular-nums",
              background: done ? ink.softer : here ? WHITE : SURFACE, color: done ? ink.onSoft : here ? ink.text : TEXT_MUTED,
              border: `1.5px solid ${done ? ink.soft : here ? ink.text : BORDER}` }}>
              {done ? <PixelStamp kind="check" size={16} /> : i + 1}
            </span>
            <span style={{ minWidth: 0, paddingTop: 2 }}>
              <span style={{ display: "block", fontFamily: SANS, fontSize: "1rem", fontWeight: here ? 800 : 600,
                color: done || here ? TEXT : TEXT_MID, lineHeight: 1.4, overflowWrap: "anywhere" }}>
                {m.title || `Milestone ${i + 1}`}
              </span>
              <span style={{ display: "block", fontFamily: SANS, fontSize: "0.9rem", fontWeight: 600, color: TEXT_MUTED,
                lineHeight: 1.4 }}>
                {state}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function QuestSection({ data, who }) {
  const title = "Quest";
  if (!data) return <SectionCard id="cs-quest" title={title}><NotShared who={who} /></SectionCard>;
  const status = questStatus(data);
  if (!status) {
    return (
      <SectionCard id="cs-quest" title={title}>
        <p style={{ ...body, margin: 0 }}>{who} shares their Quest, and has not started one yet.</p>
      </SectionCard>
    );
  }
  const milestones = milestonesOf(data);
  const done = milestones.filter((m) => m.status === "done").length;
  const streak = wholeCount(data.streak);
  const best = wholeCount(data.best_streak);
  return (
    <SectionCard id="cs-quest" title={title} aside={<Pill tone={status.tone}>{status.label}</Pill>}>
      <Heading level={3} style={{ overflowWrap: "anywhere" }}>{data.title || "Their quest"}</Heading>
      {data.summary && <p style={{ ...body, margin: "4px 0 0", overflowWrap: "anywhere" }}>{data.summary}</p>}

      <dl style={{ ...statGrid, marginTop: 14 }}>
        <Stat label="Streak">
          {streak > 0 ? plural(streak, "day") : "None right now"}
          {best > streak && <span style={{ fontWeight: 500, color: TEXT_MUTED }}> (best {best})</span>}
        </Stat>
        <Stat label="Check-ins">{wholeCount(data.checkins)}</Stat>
        <Stat label="Last check-in">{shortDate(data.last_checkin_at) || "None yet"}</Stat>
        {shortDate(data.started_at) && <Stat label="Started">{shortDate(data.started_at)}</Stat>}
      </dl>

      {milestones.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Heading level={3} style={subHeading}>
            Milestones
            <span style={{ fontWeight: 600, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}> {done} of {milestones.length} done</span>
          </Heading>
          <Milestones milestones={milestones} active={data.status === "active"} />
        </div>
      )}
      <p style={{ ...privacy, marginTop: milestones.length ? 6 : 14 }}>What a student writes in a check-in stays private. You see that they checked in, never the words.</p>
    </SectionCard>
  );
}

// ─── Essay progress ───────────────────────────────────────────────────────────

export function EssaysSection({ data, who }) {
  const title = "Essay progress";
  if (!data) return <SectionCard id="cs-essays" title={title}><NotShared who={who} /></SectionCard>;
  const lines = essayLines(data.essays);
  return (
    <SectionCard id="cs-essays" title={title} aside={lines.length > 0 && <Pill>{plural(lines.length, "essay")}</Pill>}>
      {lines.length === 0 ? (
        <p style={{ ...body, margin: 0 }}>{who} shares their essay progress, and has not started an essay yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {lines.map((e, i) => (
            <li key={e.key} style={{ padding: "8px 0", borderTop: i ? `1px solid ${BORDER}` : "none", fontFamily: SANS,
              fontSize: "1rem", fontWeight: 600, color: TEXT, lineHeight: 1.45, fontVariantNumeric: "tabular-nums",
              overflowWrap: "anywhere" }}>
              {e.line}
            </li>
          ))}
        </ul>
      )}
      <p style={privacy}>Only the stage and the word count are shared. Titles, prompts and the writing itself stay with the student.</p>
    </SectionCard>
  );
}

// ─── Portfolio ────────────────────────────────────────────────────────────────

export function PortfolioSection({ data, who, studentId, navigate }) {
  const title = "Portfolio";
  if (!data) return <SectionCard id="cs-portfolio" title={title}><NotShared who={who} /></SectionCard>;
  const gpa = gpaLines(data);
  const majors = majorsOf(data);
  const scores = sortScores(data.test_scores);
  const courses = Array.isArray(data.courses) ? data.courses.length : 0;
  const activities = (Array.isArray(data.activities) ? data.activities : []).filter((a) => a && typeof a === "object");
  const awards = Array.isArray(data.awards) ? data.awards.length : 0;
  const empty = !gpa.length && !majors.length && !scores.length && !courses && !activities.length && !awards;
  const left = scores.length > 0 || majors.length > 0;
  return (
    <SectionCard id="cs-portfolio" title={title}>
      {empty ? (
        <p style={{ ...body, margin: 0 }}>{who} shares their Portfolio, and has not added anything to it yet.</p>
      ) : (
        <>
          <dl style={statGrid}>
            {gpa.length ? gpa.map((g) => <Stat key={g.label} label={g.label}>{g.value}</Stat>) : <Stat label="GPA">Not on file</Stat>}
            <Stat label="Courses">{courses}</Stat>
            <Stat label="Activities">{activities.length}</Stat>
            <Stat label="Awards">{awards}</Stat>
          </dl>

          {(left || activities.length > 0) && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px 24px",
              marginTop: 16 }}>
              {left && (
                <div style={{ minWidth: 0, display: "grid", gap: 14, alignContent: "start" }}>
                  {scores.length > 0 && (
                    <div>
                      <Heading level={3} style={subHeading}>Test scores</Heading>
                      <Facts style={{ marginTop: 2 }}
                        items={scores.map((s) => [testName(s), s?.score ?? "", monthYear(s?.test_date) ? `(${monthYear(s.test_date)})` : ""]
                          .filter((p) => p !== "").join(" "))} />
                    </div>
                  )}
                  {majors.length > 0 && (
                    <div>
                      <Heading level={3} style={subHeading}>Majors they are considering</Heading>
                      <p style={{ ...body, margin: "2px 0 0", overflowWrap: "anywhere" }}>{majors.join(", ")}</p>
                    </div>
                  )}
                </div>
              )}
              {activities.length > 0 && (
                <div style={{ minWidth: 0 }}>
                  <Heading level={3} style={subHeading}>Activities</Heading>
                  <ul style={{ listStyle: "none", margin: "2px 0 0", padding: 0 }}>
                    {activities.slice(0, 5).map((a, i) => (
                      <li key={`${a.title}-${i}`} style={{ ...body, padding: "3px 0", overflowWrap: "anywhere" }}>
                        <span style={{ fontWeight: 700, color: TEXT }}>{a.title || "An activity"}</span>
                        {activityRole(a) && <span>, {activityRole(a)}</span>}
                      </li>
                    ))}
                  </ul>
                  {activities.length > 5 && <p style={{ ...quiet, marginTop: 2 }}>And {activities.length - 5} more, on the printable record.</p>}
                </div>
              )}
            </div>
          )}
        </>
      )}
      <LinkButton {...linkProps(navigate, recordPath(studentId))} style={{ marginTop: 16 }}>
        Open the printable record
      </LinkButton>
    </SectionCard>
  );
}

// ─── Meeting requests ─────────────────────────────────────────────────────────

const REQUEST_STATUS = {
  pending: { label: "Waiting for your answer", tone: "amber" },
  confirmed: { label: "Confirmed", tone: "accent" },
  declined: { label: "Declined", tone: "neutral" },
  cancelled: { label: "Cancelled by the student", tone: "neutral" },
};

const timesOf = (r) => (Array.isArray(r.times) ? r.times : []).map((t) => formatWhen(t)).filter(Boolean);

function Note({ note }) {
  if (!note) return null;
  return (
    <p style={{ ...quiet, marginTop: 8, overflowWrap: "anywhere" }}>
      Your note to them: <span style={{ fontWeight: 600, color: TEXT_MID }}>{note}</span>
    </p>
  );
}

/** A request still waiting: in amber, in full, with the way to answer it. */
function WaitingRequest({ r, navigate }) {
  const times = timesOf(r);
  return (
    <li style={{ background: AMBER_BG, border: "1px solid #f3d9a4", borderRadius: RADIUS.control, padding: "12px 14px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 10px" }}>
        <Pill tone="amber" style={{ background: WHITE }}>Waiting for your answer</Pill>
        {shortDate(r.created_at) && <span style={quiet}>Asked {shortDate(r.created_at)}</span>}
      </div>
      {r.message && (
        <p style={{ ...body, margin: "8px 0 0", color: TEXT, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{r.message}</p>
      )}
      {times.length > 0 && (
        <>
          <p style={{ ...quiet, marginTop: 8 }}>{times.length === 1 ? "The time that suits them:" : "Times that suit them:"}</p>
          <ul style={{ listStyle: "none", margin: "2px 0 0", padding: 0, display: "grid", gap: 2 }}>
            {times.map((t, i) => (
              <li key={`${t}-${i}`} style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: TEXT_MID,
                lineHeight: 1.45, fontVariantNumeric: "tabular-nums" }}>
                {t}
              </li>
            ))}
          </ul>
        </>
      )}
      <Note note={r.counselor_note} />
      <LinkButton {...linkProps(navigate, SCHEDULE_PATH)} style={{ marginTop: 12 }}>
        Answer it on the schedule
      </LinkButton>
    </li>
  );
}

/** A request already answered, or cancelled. */
function EarlierRequest({ r, first }) {
  const status = own(REQUEST_STATUS, r.status) || { label: "Closed", tone: "neutral" };
  const times = timesOf(r);
  const meeting = r.status === "confirmed" ? formatWhen(r.meeting_at) : "";
  return (
    <li style={{ padding: first ? "0 0 12px" : "12px 0", borderTop: first ? "none" : `1px solid ${BORDER}` }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 10px" }}>
        <Pill tone={status.tone}>{status.label}</Pill>
        {shortDate(r.created_at) && <span style={quiet}>Asked {shortDate(r.created_at)}</span>}
      </div>
      {meeting && (
        <p style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "1rem", fontWeight: 800, color: TEXT, lineHeight: 1.4 }}>
          Meeting {meeting}
        </p>
      )}
      {r.message && (
        <p style={{ ...body, margin: "6px 0 0", overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{r.message}</p>
      )}
      {times.length > 0 && r.status !== "confirmed" && (
        <p style={{ ...quiet, marginTop: 6 }}>
          {times.length === 1 ? "Time that suited them: " : "Times that suited them: "}
          <span style={{ fontWeight: 600, color: TEXT_MID }}>{times.join("; ")}</span>
        </p>
      )}
      <Note note={r.counselor_note} />
    </li>
  );
}

/** The requests this student sent, the waiting ones first. They are answered
 *  on the schedule. */
export function MeetingsSection({ requests, who, navigate }) {
  const list = (Array.isArray(requests) ? requests : []).filter((r) => r && typeof r === "object");
  const waiting = list.filter((r) => r.status === "pending");
  const earlier = list.filter((r) => r.status !== "pending");
  return (
    <SectionCard id="cs-meetings" title="Meeting requests" accent={false}
      aside={waiting.length > 0 && <Pill tone="amber">{waiting.length} waiting</Pill>}>
      {list.length === 0 ? (
        <p style={{ ...body, margin: 0 }}>{who} has not asked for a meeting.</p>
      ) : (
        <>
          {waiting.length > 0 && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
              {waiting.map((r, i) => <WaitingRequest key={r.id || `w-${i}`} r={r} navigate={navigate} />)}
            </ul>
          )}
          {earlier.length > 0 && (
            <div style={waiting.length ? { marginTop: 16, paddingTop: 14, borderTop: `1px solid ${BORDER}` } : undefined}>
              {waiting.length > 0 && <Heading level={3} style={{ ...subHeading, marginBottom: 10 }}>Earlier requests</Heading>}
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {earlier.map((r, i) => <EarlierRequest key={r.id || `e-${i}`} r={r} first={i === 0} />)}
              </ul>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
