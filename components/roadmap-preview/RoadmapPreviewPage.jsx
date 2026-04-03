import Header from "./Header.jsx";
import Sidebar from "./BottomNav.jsx";
import LessonNode from "./LessonNode.jsx";
import PathConnector from "./PathConnector.jsx";
import "./duoReference.css";

/* ── Dummy lesson data ──────────────────────────────────────── */
const LESSONS = [
  { id: "1", type: "star",   state: "active",    badge: "START" },
  { id: "2", type: "star",   state: "locked" },
  { id: "3", type: "chest",  state: "chest" },
  { id: "4", type: "star",   state: "locked" },
  { id: "5", type: "trophy", state: "locked" },
];

/* Sine-wave horizontal offsets matching the real roadmap curve */
const OFFSETS = [0, 70, 90, 50, -20];

/* ── Confidence Card ─────────────────────────────────────────── */
function getConfidenceLabel(score) {
  if (score <= 35) return { text: "Still exploring", color: "#94a3b8" };
  if (score <= 60) return { text: "Building direction", color: "#6366f1" };
  if (score <= 80) return { text: "Getting clearer",   color: "#4f46e5" };
  return              { text: "Strong career fit",   color: "#10b981" };
}

function ConfidenceCard({ score = 62 }) {
  const { text, color } = getConfidenceLabel(score);
  const pct = Math.min(100, score);
  return (
    <div
      style={{
        borderRadius: "var(--m-card-radius)",
        border:       "1.5px solid rgb(var(--m-border))",
        background:   "#fff",
        padding:      "1.25rem",
        boxShadow:    "0 2px 12px rgba(0,0,0,0.04)",
        fontFamily:   "'Plus Jakarta Sans', sans-serif",
      }}
    >
      <p style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgb(var(--m-slate))", margin: "0 0 0.75rem 0" }}>
        Career Confidence
      </p>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <span style={{ fontSize: "2.5rem", fontWeight: 900, color, lineHeight: 1 }}>{score}%</span>
        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "rgb(var(--m-slate))", paddingBottom: "0.35rem" }}>{text}</span>
      </div>
      {/* Progress bar */}
      <div style={{ height: 8, background: "rgb(var(--m-bg))", borderRadius: 9999, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${color}, ${color}cc)`, borderRadius: 9999, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

/* ── Phase Progress Card ─────────────────────────────────────── */
const PHASES = [
  { label: "Exploration",   pct: 100, done: true },
  { label: "Skill Building",pct: 45,  done: false },
  { label: "Application",   pct: 0,   done: false },
];

function PhaseProgressCard() {
  return (
    <div
      style={{
        borderRadius: "var(--m-card-radius)",
        border:       "1.5px solid rgb(var(--m-border))",
        background:   "#fff",
        padding:      "1.25rem",
        boxShadow:    "0 2px 12px rgba(0,0,0,0.04)",
        fontFamily:   "'Plus Jakarta Sans', sans-serif",
      }}
    >
      <p style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgb(var(--m-slate))", margin: "0 0 1rem 0" }}>
        Phase Progress
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
        {PHASES.map((ph) => (
          <div key={ph.label}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 700, color: ph.done ? "#10b981" : "rgb(var(--m-ink))" }}>
                {ph.label}
              </span>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "rgb(var(--m-slate))" }}>
                {ph.pct}%
              </span>
            </div>
            <div style={{ height: 8, background: "rgb(var(--m-bg))", borderRadius: 9999, overflow: "hidden" }}>
              <div style={{
                width:        `${ph.pct}%`,
                height:       "100%",
                background:   ph.done ? "linear-gradient(90deg, #34d399, #10b981)" : "linear-gradient(90deg, #818cf8, #6366f1)",
                borderRadius: 9999,
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Top bar (streak + progress) ─────────────────────────────── */
function TopBar() {
  return (
    <div style={{
      position:     "fixed",
      top:          0,
      left:         270,
      right:        0,
      height:       64,
      background:   "rgba(255,255,255,0.96)",
      backdropFilter: "blur(10px)",
      borderBottom: "1.5px solid rgb(var(--m-border))",
      display:      "flex",
      alignItems:   "center",
      justifyContent: "flex-end",
      gap:          "1.25rem",
      padding:      "0 2rem",
      zIndex:       30,
      fontFamily:   "'Plus Jakarta Sans', sans-serif",
      boxShadow:    "0 1px 8px rgba(0,0,0,0.04)",
    }}>
      {/* Streak */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#f97316" stroke="none">
          <path d="M13 2 3 14h9l-1 8 10-12h-9z"/>
        </svg>
        <span style={{ fontSize: "0.9rem", fontWeight: 800, color: "#f97316" }}>3</span>
        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "rgb(var(--m-slate))" }}>day streak</span>
      </div>
      {/* Tasks completed */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <span style={{ fontSize: "0.9rem", fontWeight: 800, color: "#10b981" }}>7</span>
        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "rgb(var(--m-slate))" }}>tasks done</span>
      </div>
    </div>
  );
}

/* ── Section divider ─────────────────────────────────────────── */
function SectionDivider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1rem", margin: "3rem 0 1rem" }}>
      <div style={{ flex: 1, height: 1.5, background: "rgb(var(--m-border))" }} />
      <span style={{
        fontFamily:    "'Plus Jakarta Sans', sans-serif",
        fontSize:      "0.82rem",
        fontWeight:    700,
        color:         "rgb(var(--m-slate))",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        whiteSpace:    "nowrap",
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1.5, background: "rgb(var(--m-border))" }} />
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────── */
export default function RoadmapPreviewPage() {
  return (
    <div className="m-page" style={{ minHeight: "100vh" }}>
      <Sidebar />
      <TopBar />

      <main style={{ marginLeft: 270, minHeight: "100vh", paddingTop: 64, background: "#f8fafc" }}>
        <div style={{
          maxWidth:  960,
          margin:    "0 auto",
          display:   "grid",
          gridTemplateColumns: "1fr 300px",
          gap:       "2.5rem",
          padding:   "2rem 2rem 8rem",
        }}>
          {/* ── Left: banner + path ── */}
          <div>
            <Header title="Order at a café" section="Section 1, Unit 1" />

            <div style={{ marginTop: "3rem" }}>
              {LESSONS.map((lesson, idx) => (
                <div key={lesson.id}>
                  {idx > 0 && <PathConnector />}
                  <LessonNode
                    lesson={lesson}
                    offset={OFFSETS[idx]}
                    onClick={() => {}}
                  />
                </div>
              ))}
            </div>

            <SectionDivider label="Unit 2 — Greet people" />
          </div>

          {/* ── Right: cards ── */}
          <div style={{ paddingTop: "6rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <ConfidenceCard score={62} />
            <PhaseProgressCard />
          </div>
        </div>
      </main>
    </div>
  );
}
