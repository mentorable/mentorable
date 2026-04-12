import { motion } from "framer-motion";

const FONT = "'Space Grotesk', sans-serif";
export const SIDEBAR_WIDTH = 220;

const NAV_ITEMS = [
  {
    key: "roadmap",
    label: "Roadmap",
    path: "/roadmap",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12h4l3-9 4 18 3-9h4" />
      </svg>
    ),
  },
  {
    key: "chat",
    label: "Chat",
    path: "/chat",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    key: "scorecard",
    label: "Scorecard",
    path: "/scorecard",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    key: "profile",
    label: "Profile",
    path: "/profile",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    key: "community",
    label: "Community",
    path: "/community",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
];

export default function Sidebar({ activePath, navigate, onModeClick, roadmapMode }) {
  const modeLabel = roadmapMode === "career" ? "Career Mode" : "Discovery Mode";

  return (
    <div style={{
      position: "fixed",
      left: 0, top: 0, bottom: 0,
      width: SIDEBAR_WIDTH,
      background: "#ffffff",
      borderRight: "1px solid rgba(37,99,235,0.08)",
      display: "flex",
      flexDirection: "column",
      zIndex: 30,
      boxShadow: "2px 0 12px rgba(37,99,235,0.04)",
    }}>
      {/* Logo */}
      <div style={{ padding: "1.5rem 1.25rem 1rem", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontFamily: FONT, fontWeight: 700, fontSize: "1.1rem",
            color: "#1d4ed8", letterSpacing: "-0.04em",
          }}>
            mentorable
          </span>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "linear-gradient(135deg, #1d4ed8, #60a5fa)",
            boxShadow: "0 0 6px rgba(37,99,235,0.45)",
            flexShrink: 0, marginBottom: 1,
          }} />
        </div>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: "0.25rem 0.75rem", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
        {NAV_ITEMS.map((item) => {
          const isActive = activePath === item.path || activePath?.startsWith(item.path + "/");
          return (
            <motion.button
              key={item.key}
              onClick={() => navigate(item.path)}
              whileHover={{ x: 2 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.12 }}
              style={{
                display: "flex", alignItems: "center", gap: "0.75rem",
                padding: "0.7rem 1rem",
                borderRadius: "0.75rem",
                border: "none", cursor: "pointer",
                background: isActive ? "rgba(37,99,235,0.08)" : "transparent",
                color: isActive ? "#1d4ed8" : "#4b5470",
                fontFamily: FONT, fontWeight: isActive ? 700 : 600,
                fontSize: "0.9rem",
                transition: "background 0.15s, color 0.15s",
                textAlign: "left", width: "100%",
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "rgba(37,99,235,0.04)"; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }}>
                {item.icon}
              </span>
              {item.label}
            </motion.button>
          );
        })}
      </nav>

      {/* Roadmap mode — bottom */}
      <div style={{ padding: "0.75rem", borderTop: "1px solid rgba(37,99,235,0.07)", flexShrink: 0 }}>
        <button
          onClick={onModeClick || undefined}
          disabled={!onModeClick}
          style={{
            display: "flex", alignItems: "center", gap: "0.625rem",
            width: "100%", padding: "0.65rem 0.875rem",
            background: "rgba(37,99,235,0.05)",
            border: "1.5px solid rgba(37,99,235,0.12)",
            borderRadius: "0.75rem",
            cursor: onModeClick ? "pointer" : "default",
            fontFamily: FONT, transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { if (onModeClick) e.currentTarget.style.background = "rgba(37,99,235,0.1)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(37,99,235,0.05)"; }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontFamily: FONT, fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#9199b8", lineHeight: 1 }}>
              Mode
            </div>
            <div style={{ fontFamily: FONT, fontSize: "0.82rem", fontWeight: 700, color: "#1d4ed8", marginTop: 2 }}>
              {modeLabel}
            </div>
          </div>
          {onModeClick && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9199b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
