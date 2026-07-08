import { useState } from "react";
import { motion } from "framer-motion";
import FeedbackModal from "./FeedbackModal.jsx";

const FONT = "'Space Grotesk', sans-serif";

const NAV_ITEMS = [
  {
    key: "scorecard",
    label: "Scorecard",
    path: "/scorecard",
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    ),
  },
  {
    key: "quest",
    label: "Quest",
    path: "/quest",
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
  {
    key: "roadmap",
    label: "Roadmap",
    path: "/roadmap",
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
        <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
      </svg>
    ),
  },
  {
    key: "chat",
    label: "Chat",
    path: "/chat",
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    key: "research",
    label: "Research",
    path: "/research",
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
    ),
  },
  {
    key: "portfolio",
    label: "Portfolio",
    path: "/portfolio",
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
      </svg>
    ),
  },
  {
    key: "profile",
    label: "Profile",
    path: "/profile",
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
];

export default function MobileNav({ activePath, navigate }) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <>
    <button
      onClick={() => setFeedbackOpen(true)}
      style={{
        position: "fixed",
        left: 12, bottom: "calc(60px + env(safe-area-inset-bottom, 0px) + 12px)",
        width: 44, height: 44, borderRadius: "50%",
        background: "#1d4ed8", border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 4px 16px rgba(29,78,216,0.35)",
        zIndex: 101,
      }}
      aria-label="Feedback"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    </button>
    {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    <nav style={{
      position: "fixed",
      bottom: 0, left: 0, right: 0,
      height: 60,
      background: "rgba(255,255,255,0.96)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      borderTop: "1px solid rgba(37,99,235,0.08)",
      display: "flex", alignItems: "stretch",
      zIndex: 100,
      boxShadow: "0 -2px 16px rgba(15,23,42,0.06)",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
    }}>
      {NAV_ITEMS.map((item) => {
        const isActive = activePath === item.path || activePath?.startsWith(item.path + "/");
        return (
          <motion.button
            key={item.key}
            onClick={() => navigate(item.path)}
            whileTap={{ scale: 0.9 }}
            transition={{ duration: 0.1 }}
            style={{
              flex: 1,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: 2,
              border: "none", background: "transparent",
              cursor: "pointer",
              color: isActive ? "#1d4ed8" : "#6a6760",
              padding: "4px 0",
              minWidth: 44, minHeight: 44,
            }}
          >
            {item.icon(isActive)}
            <span style={{
              fontFamily: FONT,
              fontSize: 9,
              fontWeight: isActive ? 700 : 500,
              letterSpacing: "0.03em",
              lineHeight: 1,
            }}>
              {item.label}
            </span>
          </motion.button>
        );
      })}
    </nav>
    </>
  );
}
