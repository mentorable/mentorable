import { useEffect, useRef, useState } from "react";
import BeakerAtWork from "../../components/agents/outreach/BeakerAtWork.jsx";
import TalonAtWork from "../../components/agents/finder/TalonAtWork.jsx";
import ChatHandoffCard from "../../components/agents/outreach/ChatHandoffCard.jsx";
import OpenDocSheet from "../../components/agents/essay/editor/OpenDocSheet.jsx";
import { mergeProgress } from "../../components/agents/outreach/ProgressChecklist.jsx";
import { mergeScreen } from "../../components/agents/screen/screenModel.js";
import { Button, ChoiceChips, PageHeader, pageStyle } from "../../components/ui/kit.jsx";
import { useAgentInk } from "../../components/ui/tokens.js";
import { useIsMobile } from "../../hooks/useIsMobile.js";
import { AnimatePresence } from "framer-motion";

// Dev only (mounted under import.meta.env.DEV in App.jsx): the agent screens
// fed a recorded event stream in the shape the backend sends, so they can be
// looked at without signing in or spending a try. Not reachable in production.

const PROFILE = "https://www.usf.edu/marine-science/people/faculty/lee-maria.aspx";
const LAB = "https://leelab.marine.usf.edu/research";
const EXCERPT = "Dr. Maria Lee is an Associate Professor in the College of Marine Science at the University of South Florida. "
  + "Her lab builds low-cost sensors that track coral bleaching along the Florida Keys, and works with Mote Marine Laboratory "
  + "on long-term reef monitoring. She teaches Biological Oceanography and runs a summer outreach program that brings local "
  + "high school students onto research cruises. Recent work: open-source temperature loggers for citizen science reef surveys "
  + "(2025), and a study of heat stress across 40 reef sites.";
const BODY = "Dear Dr. Lee,\n\nI'm a junior at Plant High School in Tampa, and I read about your lab's low-cost sensors for tracking "
  + "coral bleaching in the Keys. I built a temperature logger for my school's marine biology club last spring, so the "
  + "open-source loggers in your 2025 work caught my eye.\n\nWould you have 15 minutes in the next few weeks to tell me how a "
  + "high school student could help with reef monitoring, or what you'd suggest I learn first?\n\nThank you for your time,\nJordan";

const BEAKER = [
  [400, { type: "progress", id: "record", label: "Reading your record", status: "active" }],
  [900, { type: "progress", id: "record", label: "Read your record: 6 activities, 2 awards", status: "done" }],
  [300, { type: "progress", id: "search-1", label: "Searching: Maria Lee University of South Florida", status: "active" }],
  [0, { type: "screen", id: "search-1", kind: "search", status: "active", query: "Maria Lee University of South Florida marine science", results: [] }],
  [1800, { type: "screen", id: "search-1", kind: "search", status: "done", query: "Maria Lee University of South Florida marine science", results: [
    { title: "Maria Lee, PhD | College of Marine Science | USF", url: PROFILE, domain: "usf.edu", snippet: "Associate Professor. Research: coral reef ecology, low-cost environmental sensing, citizen science." },
    { title: "Research | Lee Lab", url: LAB, domain: "leelab.marine.usf.edu", snippet: "We build open, cheap tools to measure heat stress on reefs and share them with the people who dive them." },
    { title: "Heat stress across 40 Florida reef sites (2025)", url: "https://doi.org/10.1000/reef.2025.114", domain: "doi.org", snippet: "Lee M., Ortiz B. Temperature anomalies and bleaching at 40 sites in the Florida Keys National Marine Sanctuary." },
    { title: "Mote Marine Laboratory partners", url: "https://mote.org/research/partners", domain: "mote.org", snippet: "Long-term reef monitoring partners include the University of South Florida." },
  ] }],
  [0, { type: "progress", id: "search-1", label: "Found 4 pages on usf.edu, leelab.marine.usf.edu, doi.org", status: "done" }],
  [500, { type: "progress", id: "read-1", label: "Reading usf.edu", status: "active" }],
  [0, { type: "screen", id: "page-2", kind: "page", status: "active", url: PROFILE }],
  [1700, { type: "screen", id: "page-2", kind: "page", status: "done", url: PROFILE, title: "Maria Lee, PhD | College of Marine Science", excerpt: EXCERPT }],
  [0, { type: "progress", id: "read-1", label: "Read Maria Lee, PhD | College of Marine Science", status: "done" }],
  [400, { type: "screen", id: "page-3", kind: "page", status: "active", url: "https://doi.org/10.1000/reef.2025.114" }],
  [1500, { type: "screen", id: "page-3", kind: "page", status: "failed", url: "https://doi.org/10.1000/reef.2025.114" }],
  [300, { type: "screen", id: "page-4", kind: "page", status: "active", url: LAB }],
  [1600, { type: "screen", id: "page-4", kind: "page", status: "done", url: LAB, title: "Research | Lee Lab",
    excerpt: "The Lee Lab studies how heat waves reach reefs and what that does to corals. We design temperature and light loggers that cost under $40 to build, publish every design openly, and train volunteer divers to place them. Contact: mlee@usf.edu." }],
  [400, { type: "progress", id: "email", label: "Email confirmed on usf.edu", status: "done" }],
  [300, { type: "screen", id: "notes", kind: "notes", status: "done", title: "What checked out about Maria Lee", notes: [
    { text: "Her lab builds low-cost sensors that track coral bleaching along the Florida Keys.", url: PROFILE },
    { text: "She runs a summer outreach program that brings high school students onto research cruises.", url: PROFILE },
    { text: "The lab's loggers cost under $40 to build and every design is published openly.", url: LAB },
  ] }],
  [500, { type: "progress", id: "write", label: "Writing your draft", status: "active" }],
  [2200, { type: "screen", id: "compose", kind: "compose", status: "done", to: "mlee@usf.edu",
    subject: "A high school student interested in your reef sensors", body: BODY }],
  [0, { type: "progress", id: "write", label: "Draft written and checked", status: "done" }],
];

const TALON = [
  [400, { type: "progress", id: "queries", label: "Turning your brief into searches", status: "done" }],
  [200, { type: "progress", id: "search-1", label: "Searching: marine science summer program high school Florida", status: "active" }],
  [0, { type: "screen", id: "search-1", kind: "search", status: "active", query: "marine science summer program high school Florida 2027" }],
  [1400, { type: "screen", id: "search-1", kind: "search", status: "done", query: "marine science summer program high school Florida 2027", results: [
    { title: "High School Summer Research Program | Mote Marine Laboratory", url: "https://mote.org/education/high-school-research", snippet: "A six-week paid research internship for rising juniors and seniors. Applications open in January." },
    { title: "SeaTech Summer Camp for Teens | Florida Tech", url: "https://www.fit.edu/seatech", snippet: "Two-week residential program in ocean engineering and marine biology." },
  ] }],
  [0, { type: "progress", id: "search-1", label: "Found 2 pages", status: "done" }],
  [200, { type: "progress", id: "read", label: "Reading 2 pages", status: "active" }],
  [0, { type: "screen", id: "page-1", kind: "page", status: "active", url: "https://mote.org/education/high-school-research" }],
  [1500, { type: "screen", id: "page-1", kind: "page", status: "done", url: "https://mote.org/education/high-school-research",
    title: "High School Summer Research Program", excerpt: "Mote's High School Summer Research Program places rising juniors and seniors with a Mote scientist for six weeks. Interns are paid a stipend. Applications are due March 1. Eligibility: Florida residents aged 16 or older." }],
  [0, { type: "progress", id: "read", label: "Read 1 page", status: "done" }],
];

function useReplay(script, run) {
  const [state, setState] = useState({ lines: [], shots: [], done: false });
  useEffect(() => {
    setState({ lines: [], shots: [], done: false });
    let t;
    let i = 0;
    const next = () => {
      if (i >= script.length) { setState((s) => ({ ...s, done: true })); return; }
      const [wait, ev] = script[i++];
      t = setTimeout(() => {
        setState((s) => ({ ...s, lines: mergeProgress(s.lines, ev), shots: mergeScreen(s.shots, ev) }));
        next();
      }, wait);
    };
    next();
    return () => clearTimeout(t);
  }, [script, run]);
  return state;
}

const VIEWS = [
  { key: "beaker", label: "Beaker" },
  { key: "talon", label: "Talon" },
  { key: "chat", label: "In chat" },
  { key: "quill", label: "Quill" },
];

export default function AgentScreenPreview() {
  const ink = useAgentInk();
  const isMobile = useIsMobile();
  const [view, setView] = useState(() => new URLSearchParams(window.location.search).get("view") || "beaker");
  const [run, setRun] = useState(0);
  const [sheet, setSheet] = useState(false);
  const beaker = useReplay(BEAKER, `${view}-${run}`);
  const talon = useReplay(TALON, `${view}-${run}`);
  const fakeGoogle = useRef(async () => {
    await new Promise((r) => setTimeout(r, 1300));
    return { source: "google", title: "Common App personal statement", url: "https://docs.google.com/document/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ0123/edit",
      text: "The first sensor I built leaked.\n\nI had sealed it with hot glue and a sandwich bag, and when I pulled it out of the canal behind my grandmother's house, the board was a small green swamp.\n\nI kept the dead board on my desk for a year." };
  });

  return (
    <div style={pageStyle({ isMobile, ink })}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <PageHeader title="Agent screen" isMobile={isMobile}
          action={<Button kind="secondary" onClick={() => setRun((n) => n + 1)}>Replay</Button>}>
          A recorded run in the backend's real event shape. Dev only.
        </PageHeader>
        <ChoiceChips label="Agent" options={VIEWS} value={view} onChange={setView} isMobile={isMobile} />
        <div style={{ marginTop: 20 }}>
          {view === "beaker" && <BeakerAtWork lines={beaker.lines} shots={beaker.shots} isMobile={isMobile}
            note="This usually takes under a minute. You can leave this page: Beaker keeps working, and the draft lands on your board." />}
          {view === "talon" && <TalonAtWork lines={talon.lines} shots={talon.shots} isMobile={isMobile} onLeave={() => {}} />}
          {view === "chat" && (
            <ChatHandoffCard isMobile={isMobile} run={{ lines: beaker.lines, shots: beaker.shots,
              outcome: beaker.done ? { outcome: "draft", link: "/agents/outreach", name: "Dr. Maria Lee",
                subject: "A high school student interested in your reef sensors" } : null }} />
          )}
          {view === "quill" && <Button kind="primary" onClick={() => setSheet(true)}>Open from Google Docs or Word</Button>}
        </div>
      </div>
      <AnimatePresence>
        {sheet && (
          <OpenDocSheet key="doc" onClose={() => setSheet(false)} hasWords isMobile={isMobile}
            openGoogleDoc={fakeGoogle.current}
            onUse={async () => { await new Promise((r) => setTimeout(r, 600)); setSheet(false); }} />
        )}
      </AnimatePresence>
    </div>
  );
}
