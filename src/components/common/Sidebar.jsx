import { useState } from "react";
import { motion } from "framer-motion";
import FeedbackModal from "./FeedbackModal.jsx";

const FONT = "'Raleway', sans-serif";
export const SIDEBAR_WIDTH = 220;

const TOP_NAV = [
  {
    key: "scorecard", label: "Scorecard", path: "/scorecard",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    ),
  },
  {
    key: "quest", label: "Quest", path: "/quest",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
  {
    key: "roadmap", label: "Roadmap", path: "/roadmap",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
      </svg>
    ),
  },
  {
    key: "chat", label: "Chat", path: "/chat",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
  {
    key: "research", label: "Research", path: "/research",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
    ),
  },
  {
    key: "portfolio", label: "Portfolio", path: "/portfolio",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
      </svg>
    ),
  },
];

const BOTTOM_NAV = [
  {
    key: "profile", label: "Profile", path: "/profile",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
];

function NavBtn({ item, activePath, navigate }) {
  const isActive = activePath === item.path || activePath?.startsWith(item.path + "/");
  return (
    <motion.button
      onClick={() => navigate(item.path)}
      whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.12 }}
      style={{
        display: "flex", alignItems: "center", gap: "0.75rem",
        padding: "0.7rem 1rem", borderRadius: "0.75rem",
        border: "none", cursor: "pointer",
        background: isActive ? "rgba(37,99,235,0.08)" : "transparent",
        color: isActive ? "#1d4ed8" : "#4b5470",
        fontFamily: FONT, fontWeight: isActive ? 700 : 600,
        fontSize: "0.9rem", transition: "background 0.15s, color 0.15s",
        textAlign: "left", width: "100%",
      }}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "rgba(37,99,235,0.04)"; }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }}>{item.icon}</span>
      {item.label}
    </motion.button>
  );
}

function FeedbackBtn({ onClick }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.12 }}
      style={{
        display: "flex", alignItems: "center", gap: "0.75rem",
        padding: "0.7rem 1rem", borderRadius: "0.75rem",
        border: "none", cursor: "pointer",
        background: "transparent", color: "#4b5470",
        fontFamily: FONT, fontWeight: 600,
        fontSize: "0.9rem", transition: "background 0.15s, color 0.15s",
        textAlign: "left", width: "100%",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(37,99,235,0.04)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ flexShrink: 0, opacity: 0.7 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </span>
      Feedback
    </motion.button>
  );
}

export default function Sidebar({ activePath, navigate }) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <div id="main-sidebar" style={{
      position: "fixed",
      left: 0, top: 0, bottom: 0,
      width: SIDEBAR_WIDTH,
      background: "#faf9f5",
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

      {/* Top nav */}
      <nav style={{ flex: 1, padding: "0.25rem 0.75rem", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
        {TOP_NAV.map((item) => <NavBtn key={item.key} item={item} activePath={activePath} navigate={navigate} />)}
      </nav>

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "0 1rem" }} />

      {/* Bottom nav */}
      <nav style={{ padding: "0.5rem 0.75rem 1rem", display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
        {BOTTOM_NAV.map((item) => <NavBtn key={item.key} item={item} activePath={activePath} navigate={navigate} />)}
        <FeedbackBtn onClick={() => setFeedbackOpen(true)} />
      </nav>

      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </div>
  );
}
