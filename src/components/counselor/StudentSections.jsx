import { formatWhen, listNote } from "../../lib/counselor.js";
import { PixelStamp } from "../ui/PixelIcons.jsx";
import { Heading, LinkButton } from "../ui/kit.jsx";
import { BORDER, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk } from "../ui/tokens.js";
import {
  activityRole, essayLines, gpaLines, listCounts, majorsOf, schoolFacts, sortScores, sourceLine, testName,
} from "./recordWords.js";
import {
  NotShared, Pill, SCHEDULE_PATH, SectionCard, linkProps, monthYear, plural, recordPath, shortDate,
} from "./counselorUi.jsx";

// One student's shared sections, each its own card: College list, Quest,
// Essay progress, Portfolio, and the meeting requests they sent. A card is
// given its section exactly as counselor_student() returned it: `null` means
// the student has not shared it, and the card says so and why. Nothing here
// can show more than that function returned.

/** A table's own entry for a key that came from the database, or undefined. */
const own = (table, key) => (Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined);

const body = { fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.55 };
const quiet = { margin: 0, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.5 };
const privacy = { ...quiet, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${BORDER}` };

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

// ─── College list ─────────────────────────────────────────────────────────────

const GROUPS = [
  { key: "reach", label: "Reach", stamp: "peak" },
  { key: "target", label: "Target", stamp: "target" },
  { key: "likely", label: "Likely", stamp: "check" },
];

export function CollegeListSection({ data, who }) {
  const ink = useAgentInk();
  const title = "College list";
  if (!data) return <SectionCard id="cs-list" title={title} stamp="target"><NotShared who={who} /></SectionCard>;
  const schools = Array.isArray(data.schools) ? data.schools : [];
  const counts = listCounts(schools);
  const note = listNote(counts);
  const other = schools.filter((s) => !GROUPS.some((g) => g.key === s?.category));
  const groups = [
    ...GROUPS.map((g) => ({ ...g, schools: schools.filter((s) => s?.category === g.key) })),
    ...(other.length ? [{ key: "other", label: "Not sorted yet", stamp: "question", schools: other }] : []),
  ];
  return (
    <SectionCard id="cs-list" title={title} stamp="target"
      aside={schools.length > 0 && <Pill>{plural(schools.length, "school")}</Pill>}>
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
                      <li key={`${s.name}-${i}`} style={{ padding: "9px 0", borderTop: i ? `1px solid ${BORDER}` : "none" }}>
                        <p style={{ margin: 0, fontFamily: SANS, fontSize: "1.02rem", fontWeight: 700, color: TEXT, lineHeight: 1.35,
                          overflowWrap: "anywhere" }}>
                          {s.name || "A school"}
                        </p>
                        <Facts items={schoolFacts(s)} style={{ marginTop: 2 }} />
                        {sourceLine(s) && <p style={{ ...quiet, marginTop: 2 }}>{sourceLine(s)}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
          <p style={privacy}>Admit rates and net prices come from the U.S. Department of Education. A group is a starting point, not a prediction.</p>
        </>
      )}
    </SectionCard>
  );
}

// ─── Quest ────────────────────────────────────────────────────────────────────

const QUEST_STATUS = {
  active: { label: "Active", tone: "accent" },
  paused: { label: "Paused", tone: "neutral" },
  completed: { label: "Finished", tone: "neutral" },
};

const count = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0);

function Milestones({ milestones, active }) {
  const ink = useAgentInk();
  const list = [...milestones].sort((a, b) => count(a?.position) - count(b?.position));
  const current = list.findIndex((m) => m?.status !== "done");
  return (
    <ol style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "grid", gap: 8 }}>
      {list.map((m, i) => {
        const done = m?.status === "done";
        const here = !done && i === current;
        const state = done ? "Done" : here ? (active ? "In progress" : "Next up") : "Not started";
        return (
          <li key={`${m?.position}-${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
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
                {m?.title || `Milestone ${i + 1}`}
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
  if (!data) return <SectionCard id="cs-quest" title={title} stamp="flag"><NotShared who={who} /></SectionCard>;
  const status = own(QUEST_STATUS, data.status);
  if (!status) {
    return (
      <SectionCard id="cs-quest" title={title} stamp="flag">
        <p style={{ ...body, margin: 0 }}>{who} shares their Quest, and has not started one yet.</p>
      </SectionCard>
    );
  }
  const milestones = Array.isArray(data.milestones) ? data.milestones : [];
  const done = milestones.filter((m) => m?.status === "done").length;
  const streak = count(data.streak);
  const best = count(data.best_streak);
  return (
    <SectionCard id="cs-quest" title={title} stamp="flag" aside={<Pill tone={status.tone}>{status.label}</Pill>}>
      <Heading level={3} style={{ overflowWrap: "anywhere" }}>{data.title || "Their quest"}</Heading>
      {data.summary && <p style={{ ...body, margin: "4px 0 0", overflowWrap: "anywhere" }}>{data.summary}</p>}

      <dl style={{ ...statGrid, marginTop: 14 }}>
        <Stat label="Streak">
          {streak > 0 ? plural(streak, "day") : "None right now"}
          {best > streak && <span style={{ fontWeight: 500, color: TEXT_MUTED }}> (best {best})</span>}
        </Stat>
        <Stat label="Check-ins">{count(data.checkins)}</Stat>
        <Stat label="Last check-in">{shortDate(data.last_checkin_at) || "None yet"}</Stat>
        {shortDate(data.started_at) && <Stat label="Started">{shortDate(data.started_at)}</Stat>}
      </dl>

      {milestones.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Heading level={3} style={{ fontSize: "1rem" }}>
            Milestones
            <span style={{ fontWeight: 600, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}> {done} of {milestones.length} done</span>
          </Heading>
          <Milestones milestones={milestones} active={data.status === "active"} />
        </div>
      )}
      <p style={privacy}>What a student writes in a check-in stays private. You see that they checked in, never the words.</p>
    </SectionCard>
  );
}

// ─── Essay progress ───────────────────────────────────────────────────────────

export function EssaysSection({ data, who }) {
  const title = "Essay progress";
  if (!data) return <SectionCard id="cs-essays" title={title} stamp="scroll"><NotShared who={who} /></SectionCard>;
  const lines = essayLines(data.essays);
  return (
    <SectionCard id="cs-essays" title={title} stamp="scroll"
      aside={lines.length > 0 && <Pill>{plural(lines.length, "essay")}</Pill>}>
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
  if (!data) return <SectionCard id="cs-portfolio" title={title} stamp="reportcard"><NotShared who={who} /></SectionCard>;
  const gpa = gpaLines(data);
  const majors = majorsOf(data);
  const scores = sortScores(data.test_scores);
  const courses = Array.isArray(data.courses) ? data.courses.length : 0;
  const activities = Array.isArray(data.activities) ? data.activities : [];
  const awards = Array.isArray(data.awards) ? data.awards.length : 0;
  const empty = !gpa.length && !majors.length && !scores.length && !courses && !activities.length && !awards;
  return (
    <SectionCard id="cs-portfolio" title={title} stamp="reportcard">
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

          {scores.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <Heading level={3} style={{ fontSize: "1rem" }}>Test scores</Heading>
              <Facts style={{ marginTop: 2 }}
                items={scores.map((s) => [testName(s), s.score ?? "", monthYear(s.test_date) ? `(${monthYear(s.test_date)})` : ""]
                  .filter((p) => p !== "").join(" "))} />
            </div>
          )}

          {majors.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <Heading level={3} style={{ fontSize: "1rem" }}>Majors they are considering</Heading>
              <p style={{ ...body, margin: "2px 0 0", overflowWrap: "anywhere" }}>{majors.join(", ")}</p>
            </div>
          )}

          {activities.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <Heading level={3} style={{ fontSize: "1rem" }}>Activities</Heading>
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

/** The requests this student sent. They are answered on the schedule. */
export function MeetingsSection({ requests, who, navigate }) {
  const list = Array.isArray(requests) ? requests : [];
  return (
    <SectionCard id="cs-meetings" title="Meeting requests" stamp="letter">
      {list.length === 0 ? (
        <p style={{ ...body, margin: 0 }}>{who} has not asked for a meeting.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
          {list.map((r) => {
            const status = own(REQUEST_STATUS, r.status) || { label: "Closed", tone: "neutral" };
            const times = (Array.isArray(r.times) ? r.times : []).map((t) => formatWhen(t)).filter(Boolean);
            const meeting = r.status === "confirmed" ? formatWhen(r.meeting_at) : "";
            return (
              <li key={r.id} style={{ border: `1px solid ${BORDER}`, borderRadius: RADIUS.control, padding: "12px 14px" }}>
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
                  <p style={{ ...body, margin: "8px 0 0", color: TEXT, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{r.message}</p>
                )}
                {times.length > 0 && r.status !== "confirmed" && (
                  <p style={{ ...quiet, marginTop: 8 }}>
                    {times.length === 1 ? "Time that suits them: " : "Times that suit them: "}
                    <span style={{ fontWeight: 600, color: TEXT_MID }}>{times.join("; ")}</span>
                  </p>
                )}
                {r.counselor_note && (
                  <p style={{ ...quiet, marginTop: 8, overflowWrap: "anywhere" }}>
                    Your note to them: <span style={{ fontWeight: 600, color: TEXT_MID }}>{r.counselor_note}</span>
                  </p>
                )}
                {r.status === "pending" && (
                  <LinkButton {...linkProps(navigate, SCHEDULE_PATH)} style={{ marginTop: 12 }}>
                    Answer it on the schedule
                  </LinkButton>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
