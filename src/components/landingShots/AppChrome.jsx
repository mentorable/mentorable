import { lighten } from "../../lib/theme.js";
import { PixelBeakIcon } from "../ui/PixelIcons.jsx";
import { Flame, TreasureMapIcon } from "../quest/questUi.jsx";

// The app's shell, recreated with static state for the landing page's device
// mockups: the desktop sidebar (common/Sidebar.jsx) and the phone's bottom tab
// bar (common/MobileNav.jsx). Recreated rather than rendered, because the real
// ones route, read the session and float a Feedback button.

const SANS = "'Raleway', sans-serif";
const ACCENT = "#1d4ed8";
const SURFACE = "#faf9f5";
const SOFT = "#dfe6fa";
const SOFTER = "#eff3fc";
const LINE = "#e6dfd8";
const MUTED = "#494742";
const FAINT = "#6a6760";

const ICON = {
  colleges: (size, sw = 2) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z" /><path d="M22 10v6" /><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
    </svg>
  ),
  chat: (size, sw = 2) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  portfolio: (size, sw = 2) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),
  profile: (size, sw = 2) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  ),
};

const SIDEBAR_ITEMS = [
  { key: "quest", label: "Quest", icon: () => <TreasureMapIcon /> },
  { key: "colleges", label: "College List", icon: () => ICON.colleges(20) },
  { key: "chat", label: "Chat", icon: () => ICON.chat(20) },
  { key: "portfolio", label: "Portfolio", icon: () => ICON.portfolio(20) },
  { key: "agents", label: "Agents", icon: () => <PixelBeakIcon size={20} /> },
];
const SIDEBAR_BOTTOM = [
  { key: "profile", label: "Profile", icon: () => ICON.profile(20) },
  { key: "feedback", label: "Feedback", icon: () => ICON.chat(20) },
];

function SidebarRow({ item, active }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.7rem 1rem", borderRadius: "0.75rem",
      background: active ? "rgba(29,78,216,0.08)" : "transparent", color: active ? ACCENT : "#4b5470",
      fontFamily: SANS, fontWeight: active ? 700 : 600, fontSize: "0.9rem", width: "100%", boxSizing: "border-box" }}>
      <span style={{ flexShrink: 0, opacity: active ? 1 : 0.7, display: "inline-flex" }}>{item.icon()}</span>
      {item.label}
    </div>
  );
}

/** The desktop sidebar: the wordmark, the streak chip, the five live
 *  sections, Profile and Feedback. `active` is the section's key. */
export function AppSidebar({ active, streak = 3, lit = false, level = 1, width = 200 }) {
  return (
    <div style={{ width, flexShrink: 0, height: "100%", background: SURFACE, borderRight: "1px solid rgba(29,78,216,0.08)",
      display: "flex", flexDirection: "column", boxSizing: "border-box", fontFamily: SANS }}>
      <div style={{ padding: "1.5rem 1.25rem 1rem", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.1rem", color: ACCENT, letterSpacing: "-0.04em" }}>mentorable</span>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: `linear-gradient(135deg, ${ACCENT}, ${lighten(ACCENT, 0.35)})`,
            flexShrink: 0, marginBottom: 1 }} />
        </div>
        <div style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
          background: lit ? SOFTER : "#ffffff", borderRadius: 12, padding: "6px 10px", minHeight: 40,
          border: `1px solid ${lit ? SOFT : LINE}`, boxSizing: "border-box" }}>
          <Flame size={20} lit={lit} animate={false} streak={streak} />
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: "0.98rem", color: lit ? ACCENT : MUTED, fontVariantNumeric: "tabular-nums" }}>{streak}</span>
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: "0.9rem", color: "#ffffff", background: ACCENT, borderRadius: 7,
            padding: "1px 7px", marginLeft: 2, lineHeight: 1.35 }}>Lv {level}</span>
        </div>
      </div>
      <div style={{ flex: 1, padding: "0.25rem 0.75rem", display: "flex", flexDirection: "column", gap: 2, minHeight: 0 }}>
        {SIDEBAR_ITEMS.map((item) => <SidebarRow key={item.key} item={item} active={active === item.key} />)}
      </div>
      <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "0 1rem", flexShrink: 0 }} />
      <div style={{ padding: "0.5rem 0.75rem 1rem", display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
        {SIDEBAR_BOTTOM.map((item) => <SidebarRow key={item.key} item={item} active={false} />)}
      </div>
    </div>
  );
}

const TAB_ITEMS = [
  { key: "quest", label: "Quest" },
  { key: "colleges", label: "Colleges" },
  { key: "chat", label: "Chat" },
  { key: "portfolio", label: "Portfolio" },
  { key: "agents", label: "Agents" },
  { key: "profile", label: "Profile" },
];

function TabIcon({ item, active, streak, lit }) {
  const sw = active ? 2.5 : 2;
  if (item.key === "quest") {
    return (
      <span style={{ position: "relative", display: "inline-flex" }}>
        <TreasureMapIcon size={22} strokeWidth={sw} />
        {streak > 0 && (
          <span style={{ position: "absolute", right: -14, top: -7, height: 17, display: "inline-flex", alignItems: "center", gap: 1,
            padding: "0 5px 0 3px", borderRadius: 99, background: "#fff", boxSizing: "border-box",
            border: `1.5px solid ${lit ? "#FF8A00" : "#d6d5d2"}`, color: lit ? "#C24E00" : "#8a877f",
            fontFamily: SANS, fontWeight: 800, fontSize: 10, lineHeight: 1 }}>
            <Flame size={11} lit={lit} streak={streak} animate={false} />{streak}
          </span>
        )}
      </span>
    );
  }
  if (item.key === "agents") return <PixelBeakIcon size={22} />;
  // The app draws the active tab's icon a touch heavier.
  return <span style={{ display: "inline-flex" }}>{ICON[item.key](22, sw)}</span>;
}

/** The phone's bottom tab bar: six tabs, 22px icons, 9px labels, the streak
 *  badge on Quest. Sits at the bottom of its positioned parent. */
export function MobileTabBar({ active = "quest", streak = 3, lit = false }) {
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 60, background: "rgba(255,255,255,0.96)",
      borderTop: "1px solid rgba(29,78,216,0.08)", display: "flex", alignItems: "stretch", boxSizing: "border-box",
      boxShadow: "0 -2px 16px rgba(15,23,42,0.06)", zIndex: 30 }}>
      {TAB_ITEMS.map((item) => {
        const on = active === item.key;
        return (
          <div key={item.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 2, color: on ? ACCENT : FAINT, padding: "4px 0" }}>
            <TabIcon item={item} active={on} streak={streak} lit={lit} />
            <span style={{ fontFamily: SANS, fontSize: 9, fontWeight: on ? 700 : 500, letterSpacing: "0.03em", lineHeight: 1 }}>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}
