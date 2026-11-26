import { useEffect, useState } from "react";
import FeedbackModal from "./FeedbackModal.jsx";
import { useTheme } from "../../lib/ThemeContext.jsx";
import { isEnabled } from "../../lib/features.js";
import { readableOn } from "../../lib/theme.js";
import { useQuest } from "../../lib/QuestContext.jsx";
import { Flame, TreasureMapIcon } from "../quest/questUi.jsx";
import { PixelBeakIcon } from "../agents/PixelIcons.jsx";

const FONT = "'Outfit', 'Raleway', sans-serif";
const INK = "#141413";
const INK_2 = "#494742";
const LINE = "rgba(20,20,19,0.07)";

// The panel floats GAP px in from the window's edges. Pages offset their
// content by SIDEBAR_WIDTH, a CSS variable this component keeps equal to the
// space the panel takes (open or collapsed), so collapsing it widens every
// page at once. Use it inside calc(), never as a number.
const GAP = 12;
const OPEN_W = 244;
const SHUT_W = 80;
export const SIDEBAR_WIDTH = `var(--sidebar-w, ${OPEN_W + GAP * 2}px)`;

const COLLAPSED_KEY = "mentorable_sidebar_collapsed";

// One of the three illustrations, picked when the app loads: it stays the same
// through collapsing, reopening and moving between pages, and changes on a
// refresh. Each file animates itself (public/art/sidebar-N.svg, built by
// .claude/mockups/build_sidebar_art.py).
const ART = `/art/sidebar-${1 + Math.floor(Math.random() * 3)}.svg`;

const icon = (children) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

const TOP_NAV = [
  { key: "scorecard", label: "Scorecard", path: "/scorecard",
    icon: icon(<><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>) },
  { key: "quest", label: "Quest", path: "/quest", icon: <TreasureMapIcon strokeWidth={1.8} /> },
  { key: "colleges", label: "College List", path: "/college-list",
    icon: icon(<><path d="M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z" /><path d="M22 10v6" /><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" /></>) },
  { key: "roadmap", label: "Roadmap", path: "/roadmap",
    icon: icon(<><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></>) },
  { key: "chat", label: "Chat", path: "/chat",
    icon: icon(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />) },
  { key: "portfolio", label: "Portfolio", path: "/portfolio",
    icon: icon(<><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>) },
  { key: "agents", label: "Agents", path: "/agents", icon: <PixelBeakIcon size={20} /> },
];

const PROFILE = { key: "profile", label: "Profile", path: "/profile",
  icon: icon(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>) };
const FEEDBACK_ICON = icon(<><path d="M4 5h16v11H8l-4 4z" /><path d="M8 9h8M8 12h5" /></>);

function readCollapsed() {
  try { return localStorage.getItem(COLLAPSED_KEY) === "1"; } catch { return false; }
}

function NavItem({ label, icon: glyph, active, onClick, collapsed, accentRgb, activeText }) {
  return (
    <button type="button" onClick={onClick} title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined} aria-current={active ? "page" : undefined}
      className="sidebar-item"
      style={{
        display: "flex", alignItems: "center", gap: 12, height: 44, width: collapsed ? 48 : "100%",
        padding: collapsed ? 0 : "0 12px", justifyContent: collapsed ? "center" : "flex-start",
        borderRadius: 14, border: "none", cursor: "pointer", textAlign: "left", flexShrink: 0,
        background: active ? `rgba(${accentRgb},0.09)` : "transparent",
        color: active ? activeText : INK_2,
        fontFamily: FONT, fontSize: 15, fontWeight: active ? 700 : 600,
        "--hover": `rgba(${accentRgb},0.05)`,
      }}>
      <span style={{ display: "flex", flexShrink: 0 }}>{glyph}</span>
      {!collapsed && <span style={{ whiteSpace: "nowrap" }}>{label}</span>}
    </button>
  );
}

/** The streak: a live campfire and the count beside it, no chip. Lit once
 *  today's task is done (or it is a rest day), dim while it is still open. */
function Streak({ collapsed, onClick }) {
  const { summary } = useQuest();
  if (!summary || (!summary.ever && !summary.has_quest)) return null;
  const lit = ["done", "rest"].includes(summary.today_state);
  const open = ["open", "blocked"].includes(summary.today_state);
  const label = `${summary.streak} day streak, level ${summary.level}.${open ? " Today's task is still open." : ""} Open Quest`;
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="sidebar-item"
      style={{
        display: "flex", flexDirection: collapsed ? "column" : "row", alignItems: "center",
        gap: collapsed ? 2 : 10, margin: "16px 0 4px", padding: collapsed ? "6px 0" : "6px 8px",
        background: "transparent", border: "none", borderRadius: 14, cursor: "pointer", fontFamily: FONT,
        width: collapsed ? 56 : "100%", flexShrink: 0, "--hover": "rgba(20,20,19,0.04)",
      }}>
      <Flame size={collapsed ? 32 : 44} lit={lit} animate={lit} streak={summary.streak} />
      <span style={{ display: "flex", flexDirection: "column", alignItems: collapsed ? "center" : "flex-start" }}>
        <span style={{ fontSize: collapsed ? 19 : 30, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em",
          color: lit ? INK : "#6a6760" }}>
          {summary.streak}
        </span>
        {!collapsed && (
          <span style={{ fontSize: 13, fontWeight: 700, color: INK_2, marginTop: 4, whiteSpace: "nowrap" }}>
            day streak
          </span>
        )}
      </span>
    </button>
  );
}

export default function Sidebar({ activePath, navigate }) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const { accent, accentRgb } = useTheme();
  const activeText = readableOn(accent, "#f1f4fd", 4.5);

  // Keep every page's offset in step with the panel.
  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-w", `${(collapsed ? SHUT_W : OPEN_W) + GAP * 2}px`);
  }, [collapsed]);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0"); } catch { /* not kept; fine */ }
      return next;
    });
  };

  const isActive = (path) => activePath === path || activePath?.startsWith(path + "/");
  const item = (it) => (
    <NavItem key={it.key} label={it.label} icon={it.icon} active={isActive(it.path)} collapsed={collapsed}
      onClick={() => navigate(it.path)} accentRgb={accentRgb} activeText={activeText} />
  );

  return (
    <aside id="main-sidebar" aria-label="Main" style={{
      position: "fixed", top: GAP, left: GAP, bottom: GAP, zIndex: 30,
      width: collapsed ? SHUT_W : OPEN_W, transition: "width 0.22s cubic-bezier(0.22,1,0.36,1)",
      background: "#ffffff", borderRadius: 24, border: `1px solid ${LINE}`,
      boxShadow: "0 1px 2px rgba(20,20,19,0.04), 0 12px 32px rgba(20,20,19,0.06)",
      display: "flex", flexDirection: "column", alignItems: collapsed ? "center" : "stretch",
      padding: collapsed ? "20px 12px 16px" : "20px 14px 0", boxSizing: "border-box", fontFamily: FONT,
    }}>
      <button type="button" onClick={toggle} className="sidebar-toggle"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}
        title={collapsed ? "Expand" : "Collapse"}
        style={{
          position: "absolute", right: -13, top: 30, width: 26, height: 26, borderRadius: "50%",
          background: "#ffffff", border: "1px solid rgba(20,20,19,0.12)", boxShadow: "0 2px 8px rgba(20,20,19,0.08)",
          display: "grid", placeItems: "center", cursor: "pointer", color: INK, padding: 0,
        }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
        </svg>
      </button>

      <button type="button" onClick={() => navigate("/quest")} aria-label="Mentorable home"
        style={{ display: "flex", alignItems: "center", gap: 10, padding: collapsed ? 0 : "0 8px", background: "none",
          border: "none", cursor: "pointer", flexShrink: 0 }}>
        <img src="/favicon.png" alt="" width={34} height={34} style={{ display: "block", borderRadius: "50%" }} />
        {!collapsed && (
          <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 19, letterSpacing: "-0.035em", color: INK }}>
            mentorable
          </span>
        )}
      </button>

      {isEnabled("quest") && <Streak collapsed={collapsed} onClick={() => navigate("/quest")} />}

      <nav style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8, alignItems: collapsed ? "center" : "stretch" }}>
        {TOP_NAV.filter((i) => isEnabled(i.key)).map(item)}
      </nav>

      <div style={{ height: 1, background: LINE, margin: "10px 6px", alignSelf: "stretch", flexShrink: 0 }} />

      <nav style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: collapsed ? "center" : "stretch" }}>
        {item(PROFILE)}
        <NavItem label="Feedback" icon={FEEDBACK_ICON} active={false} collapsed={collapsed}
          onClick={() => setFeedbackOpen(true)} accentRgb={accentRgb} activeText={activeText} />
      </nav>

      {collapsed ? <div style={{ flex: 1 }} /> : (
        <div className="sidebar-art" aria-hidden="true"
          style={{ flex: "1 1 0", minHeight: 0, display: "flex", alignItems: "flex-end", justifyContent: "center",
            margin: "8px -6px 0", padding: "0 0 16px", overflow: "hidden" }}>
          <img src={ART} alt="" style={{ display: "block", width: "100%", maxHeight: "100%", maxWidth: 260,
            objectFit: "contain", objectPosition: "bottom" }} />
        </div>
      )}

      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </aside>
  );
}
