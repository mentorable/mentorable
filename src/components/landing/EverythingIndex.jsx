import { PixelArrow, PixelStamp } from "../ui/PixelIcons.jsx";
import { C, CONTAINER, GUTTER, MOBILE_MAX, SANS, TYPE, useMedia } from "./kit.js";
import { Signpost, TwoTone } from "./frames.jsx";

// "Everything it does today." (PLAN.md 4.7): an honest index of the product,
// eight groups in a grid on desktop and native <details> on phones. Every
// item is true of the app as it works today.

const GROUPS = [
  { name: "Your record", stamp: "reportcard", items: [
    "A five-step form for names and numbers",
    "A short text interview, about five minutes",
    "Or a voice interview, about three minutes",
    "A review of everything it heard before anything is saved",
    "Activities in the Common App's format: role, organization, hours, weeks and grades",
    "Courses tagged by level, like AP, Honors or dual enrollment",
    "Weighted and unweighted GPA on a 4.0, 5.0 or 100-point scale",
    "SAT, ACT and AP scores, with section scores",
    "Upload a resume or brag sheet to pull out activities and awards",
    "Export a one-page resume as a PDF",
  ] },
  { name: "College List", stamp: "peak", items: [
    "Search U.S. colleges by name, or a short name like UMich or NYU",
    "Admit rate, SAT and ACT ranges, average net price and size from the College Scorecard",
    "Reach, target or likely by a written rule, with the reason on each card",
    "A rough guess, marked as one, when there's no score to compare",
    "Move any school yourself, and the rule never moves it back",
    "Order by date added, most selective or lowest price",
    "Full or compact cards",
    "Bring over the schools you named when you signed up",
  ] },
  { name: "Quest", stamp: "flag", items: [
    "One project at a time, split into 3 to 8 milestones",
    "A few quick questions before it plans, or skip them",
    "One small task on the days you choose, sized to your minutes a day",
    "Rest days that never break your streak",
    "A fixed deadline, if you have one",
    "Check-ins with a short reply from your advisor",
    "Streaks, XP and levels",
    "Missed days become backlog to catch up on",
    "The next milestone opens when this one is done",
    "Up to three real links for a task, found by a web search when you ask",
  ] },
  { name: "Chat", stamp: "chat", items: [
    "Reads your whole record, your College List and your Quest",
    "Adds and edits record items when you ask, and tells you when it did",
    "Raises net price before you ask",
    "Flags a list that's too safe as readily as one that's too hard",
    "Never predicts your chances of admission",
    "Sends you to the source for policies that change every year",
    "Your own instructions for how it answers",
  ] },
  { name: "Talon", stamp: "star", items: [
    "Scholarships, summer programs, competitions, research, internships and volunteering",
    "Every deadline, amount and requirement checked against the provider's own page",
    "Drops listings with application fees, guaranteed money, or requests for your SSN or bank details",
    "A \"why it fits you\" line that names something on your record",
    "A timeline of everything you saved, by the month it's due",
    "Recheck a listing's page for changes",
    "Citizenship and eligibility answers are used for that search and never stored",
  ] },
  { name: "Beaker", stamp: "letter", items: [
    "Write to a person you name, or describe a goal and get a shortlist of real people",
    "Reads their work on the web before drafting",
    "A short email in a voice you pick, under 175 words",
    "Every fact about them linked to its source",
    "An address only if a page Beaker read shows it",
    "Send from your Gmail with send-only permission, or copy it",
    "A board from To contact to Closed, with follow-ups in the same thread",
  ] },
  { name: "Quill", stamp: "scroll", items: [
    "Areas to write about, drawn from your record and asked as questions",
    "A guided brainstorm, one question at a time",
    "A plain editor that saves as you write, with versions",
    "The seven Common App prompts, plus your own supplements and word limits",
    "A review against seven checks, with notes that quote your draft",
    "Never writes, rewrites or corrects a word",
    "No spelling or grammar notes; a teacher or counselor is the right reader for that",
  ] },
  { name: "Your control", stamp: "lock", items: [
    "Edit or delete anything in your record",
    "Pick your own accent color",
    "Delete your account at any time",
  ] },
];

const NOTES = [
  "Where the facts come from: school figures from the U.S. Department of Education's College Scorecard; scholarships and programs from each provider's own page. The advisor's rules draw on published guidance from NACAC and ASCA.",
  "Free to use. The AI features have limits on how often you can use them.",
];

const INDEX_CSS = `
.lp-index summary { list-style: none; cursor: pointer; }
.lp-index summary::-webkit-details-marker { display: none; }
.lp-index details[open] .lp-index-caret { transform: rotate(90deg); }
.lp-index summary:focus-visible { outline: 3px solid ${C.accent}; outline-offset: 2px; border-radius: 6px; }
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-lp-index]")) {
  const el = document.createElement("style");
  el.dataset.lpIndex = "";
  el.textContent = INDEX_CSS;
  document.head.appendChild(el);
}

function Items({ items }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((text) => (
        <li key={text} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontFamily: SANS, fontSize: "1rem", fontWeight: 500,
          lineHeight: 1.5, color: C.mid }}>
          <span aria-hidden="true" style={{ width: 6, height: 6, background: C.accent, flexShrink: 0, marginTop: 9 }} />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

function GroupName({ group }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontFamily: SANS, fontSize: "1.125rem", fontWeight: 700, color: C.ink }}>
      <span aria-hidden="true" style={{ display: "inline-flex", color: C.accent, flexShrink: 0 }}><PixelStamp kind={group.stamp} size={16} /></span>
      {group.name}
    </span>
  );
}

function Group({ group }) {
  return (
    <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 20 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: "1.125rem", lineHeight: 1.3 }}><GroupName group={group} /></h3>
      <Items items={group.items} />
    </div>
  );
}

function GroupDetails({ group, open }) {
  return (
    <details open={open || undefined} style={{ borderTop: `1px solid ${C.line}` }}>
      <summary style={{ minHeight: 48, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 0" }}>
        <h3 style={{ margin: 0, fontSize: "1.125rem", lineHeight: 1.3 }}><GroupName group={group} /></h3>
        <span aria-hidden="true" className="lp-index-caret" style={{ display: "inline-flex", color: C.muted, flexShrink: 0, transition: "transform 150ms" }}>
          <PixelArrow size={16} />
        </span>
      </summary>
      <div style={{ padding: "4px 0 20px" }}><Items items={group.items} /></div>
    </details>
  );
}

export default function EverythingIndex() {
  const phone = useMedia(`(max-width: ${MOBILE_MAX}px)`);
  const wide = useMedia("(min-width: 1100px)");
  return (
    <section id="everything" aria-label="Everything it does" className="lp-index"
      style={{ background: C.page, padding: `${phone ? 80 : 120}px ${GUTTER}` }}>
      <div style={{ maxWidth: CONTAINER, margin: "0 auto" }}>
        <Signpost stamp="sparkle">Everything</Signpost>
        <TwoTone as="h2" lead="Everything it does today." rest="All of it free." style={{ marginTop: 12 }} />

        {phone ? (
          <div style={{ marginTop: 32, borderBottom: `1px solid ${C.line}` }}>
            {GROUPS.map((g, i) => <GroupDetails key={g.name} group={g} open={i === 0} />)}
          </div>
        ) : (
          <div style={{ marginTop: 48, display: "grid", gridTemplateColumns: wide ? "repeat(4, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))",
            gap: "40px 24px" }}>
            {GROUPS.map((g) => <Group key={g.name} group={g} />)}
          </div>
        )}

        <div style={{ marginTop: phone ? 32 : 56, display: "flex", flexDirection: "column", gap: 10, maxWidth: "62rem" }}>
          {NOTES.map((n) => <p key={n} style={{ ...TYPE.caption }}>{n}</p>)}
        </div>
      </div>
    </section>
  );
}
