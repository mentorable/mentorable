import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./lib/supabase.js";
import { SIDEBAR_WIDTH } from "./components/common/Sidebar.jsx";
import { useIsMobile } from "./hooks/useIsMobile.js";

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG        = "#faf9f5";
const WHITE     = "#ffffff";
const BLUE      = "#1d4ed8";
const BLUE_MID  = "#3b82f6";
const BLUE_SOFT = "#dbeafe";
const BLUE_TINT = "#f0f5ff";
const GREEN     = "#059669";
const GREEN_SOFT= "#d1fae5";
const AMBER     = "#d97706";
const AMBER_SOFT= "#fef3c7";
const TEXT      = "#141413";
const TEXT_MID  = "#3d3d3a";
const TEXT_MUTED= "#6c6a64";
const TEXT_FAINT= "#8e8b82";
const BORDER    = "#e6dfd8";
const BORDER_MID= "#d4ccbf";
const FONT      = "'Inter', -apple-system, sans-serif";
const BODY      = "'Inter', -apple-system, sans-serif";
const SERIF     = "'Cormorant Garamond', Georgia, serif";

// ─── Category badge config ────────────────────────────────────────────────────
const CATEGORY_STYLES = {
  Project:     { bg: BLUE_TINT,   color: BLUE },
  Research:    { bg: AMBER_SOFT,  color: AMBER },
  Application: { bg: GREEN_SOFT,  color: GREEN },
  Learning:    { bg: "#ede9fe",   color: "#7c3aed" },
  Other:       { bg: BORDER,      color: TEXT_MUTED },
};

function CategoryBadge({ category }) {
  const style = CATEGORY_STYLES[category] || CATEGORY_STYLES.Other;
  return (
    <span style={{
      fontFamily: FONT, fontSize: 11, fontWeight: 700,
      letterSpacing: "0.04em", textTransform: "uppercase",
      background: style.bg, color: style.color,
      borderRadius: 7, padding: "3px 9px",
    }}>
      {category || "Other"}
    </span>
  );
}

// ─── Quest card ───────────────────────────────────────────────────────────────
function QuestCard({ item, onAction, actioning }) {
  const isActioning = actioning === item.id;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      style={{
        background: WHITE,
        borderRadius: 20,
        border: `1px solid ${BORDER}`,
        padding: "18px 20px",
        boxShadow: "0 1px 6px rgba(15,23,42,0.05)",
      }}
    >
      {/* Top row: category + time */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <CategoryBadge category={item.category} />
        {item.estimated_time && (
          <span style={{
            fontFamily: FONT, fontSize: 11, fontWeight: 700,
            color: TEXT_FAINT, letterSpacing: "0.03em",
            background: BG, borderRadius: 6, padding: "2px 8px",
            border: `1px solid ${BORDER}`,
          }}>
            {item.estimated_time}
          </span>
        )}
      </div>

      {/* Title */}
      <div style={{
        fontFamily: FONT, fontWeight: 700, fontSize: 16,
        color: TEXT, lineHeight: 1.35, marginBottom: 6,
      }}>
        {item.title}
      </div>

      {/* Description — 2-line clamp */}
      {item.description && (
        <p style={{
          fontFamily: BODY, fontSize: 14, color: TEXT_MUTED,
          lineHeight: 1.55, margin: "0 0 14px",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>
          {item.description}
        </p>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginTop: item.description ? 0 : 14 }}>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => onAction(item.id, "complete")}
          disabled={isActioning}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            fontFamily: FONT, fontSize: 13, fontWeight: 600,
            color: GREEN, background: GREEN_SOFT,
            border: "none", borderRadius: 10, padding: "7px 14px",
            cursor: isActioning ? "default" : "pointer",
            opacity: isActioning ? 0.6 : 1,
            transition: "opacity 0.15s",
          }}
        >
          {isActioning
            ? <span style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid rgba(5,150,105,0.3)`, borderTopColor: GREEN, animation: "quest-spin 0.7s linear infinite", display: "inline-block" }} />
            : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          }
          Complete
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => onAction(item.id, "delete")}
          disabled={isActioning}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            fontFamily: FONT, fontSize: 13, fontWeight: 600,
            color: TEXT_MUTED, background: BG,
            border: `1px solid ${BORDER}`, borderRadius: 10, padding: "7px 14px",
            cursor: isActioning ? "default" : "pointer",
            opacity: isActioning ? 0.6 : 1,
            transition: "opacity 0.15s",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/>
            <path d="M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
          Remove
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Completed quest card ─────────────────────────────────────────────────────
function CompletedQuestCard({ item }) {
  return (
    <div style={{
      background: "#f6fdf9",
      borderRadius: 16,
      border: `1px solid ${GREEN_SOFT}`,
      padding: "14px 18px",
      opacity: 0.85,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{
          fontFamily: FONT, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.04em", textTransform: "uppercase",
          background: GREEN_SOFT, color: GREEN,
          borderRadius: 7, padding: "3px 9px",
        }}>
          Completed
        </span>
        {item.completed_at && (
          <span style={{ fontFamily: FONT, fontSize: 11, color: TEXT_FAINT }}>
            {new Date(item.completed_at).toLocaleDateString()}
          </span>
        )}
      </div>
      <div style={{
        fontFamily: FONT, fontWeight: 600, fontSize: 15,
        color: TEXT_MID, lineHeight: 1.35,
      }}>
        {item.title}
      </div>
    </div>
  );
}

// ─── Generating spinner ───────────────────────────────────────────────────────
function GeneratingOverlay() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "48px 24px", gap: 16,
    }}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
        style={{
          width: 40, height: 40, borderRadius: "50%",
          border: `3px solid ${BLUE_SOFT}`,
          borderTopColor: BLUE,
        }}
      />
      <div style={{ fontFamily: FONT, fontSize: 14, color: TEXT_MUTED, fontWeight: 500 }}>
        Building your quests…
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function RoadmapPage({ navigate }) {
  const isMobile = useIsMobile();
  const [userId, setUserId]         = useState(null);
  const [items, setItems]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [generating, setGenerating] = useState(false);
  const [actioning, setActioning]   = useState(null); // itemId being actioned
  const [showCompleted, setShowCompleted] = useState(false);

  const loadItems = useCallback(async (uid) => {
    const { data } = await supabase
      .from("quest_items")
      .select("*")
      .eq("user_id", uid)
      .in("status", ["active", "completed"])
      .order("created_at", { ascending: true });
    if (data) setItems(data);
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }
      if (cancelled) return;
      setUserId(user.id);
      await loadItems(user.id);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [loadItems]);

  const handleGenerate = useCallback(async () => {
    if (!userId || generating) return;
    setGenerating(true);
    try {
      const { error } = await supabase.functions.invoke("generate-quest-items", { body: {} });
      if (error) throw error;
      await loadItems(userId);
    } catch (e) {
      console.error("[Quest] generate error:", e);
    } finally {
      setGenerating(false);
    }
  }, [userId, generating, loadItems]);

  const handleAction = useCallback(async (itemId, action) => {
    if (actioning) return;
    setActioning(itemId);

    // Optimistic update
    setItems(prev => prev.map(item => item.id !== itemId ? item : {
      ...item,
      status: action === "complete" ? "completed" : "deleted",
      completed_at: action === "complete" ? new Date().toISOString() : item.completed_at,
    }));

    try {
      const { error } = await supabase.functions.invoke("update-quest-item", {
        body: { itemId, action },
      });
      if (error) throw error;
    } catch (e) {
      console.error("[Quest] action error:", e);
      // Revert on error
      await loadItems(userId);
    } finally {
      setActioning(null);
    }
  }, [actioning, userId, loadItems]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const activeItems    = items.filter(i => i.status === "active");
  const completedItems = items.filter(i => i.status === "completed").reverse();

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: BG, paddingLeft: isMobile ? 0 : SIDEBAR_WIDTH, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Cormorant+Garamond:wght@400;600&display=swap');
          @keyframes quest-spin { to { transform: rotate(360deg); } }
        `}</style>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          style={{ width: 36, height: 36, borderRadius: "50%", border: `3px solid ${BLUE_SOFT}`, borderTopColor: BLUE }}
        />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: BG,
      backgroundImage: "radial-gradient(circle, rgba(29,78,216,0.07) 1px, transparent 1px)",
      backgroundSize: "28px 28px",
      backgroundAttachment: "local",
      paddingLeft: isMobile ? 0 : SIDEBAR_WIDTH,
      paddingBottom: isMobile ? 96 : 48,
      position: "relative",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Cormorant+Garamond:wght@400;600&display=swap');
        @keyframes quest-spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: isMobile ? "0 16px" : "0 24px", position: "relative" }}>

        {/* ── Sticky header ─────────────────────────────────────────────── */}
        <div style={{
          position: "sticky", top: 0, zIndex: 20,
          background: "rgba(238,244,255,0.88)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          padding: isMobile ? "14px 16px 12px" : "18px 24px 14px",
          margin: isMobile ? "0 -16px" : "0 -24px",
          borderBottom: `1px solid rgba(29,78,216,0.12)`,
          marginBottom: 24,
          boxShadow: "0 1px 0 0 rgba(29,78,216,0.06), 0 4px 24px rgba(29,78,216,0.04)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            {/* Title */}
            <h1 style={{
              fontFamily: SERIF, fontWeight: 600, fontSize: isMobile ? 26 : 32,
              margin: 0, letterSpacing: "-0.01em",
              background: "linear-gradient(135deg, #0f172a 30%, #1d4ed8)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              Quest
            </h1>

            {/* Right side: stat pills + generate button */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {/* Active pill */}
              <div style={{
                fontFamily: FONT, fontSize: 12, fontWeight: 600, color: BLUE,
                background: BLUE_TINT, border: `1px solid ${BLUE_SOFT}`,
                borderRadius: 9, padding: "5px 12px",
                display: "flex", alignItems: "baseline", gap: 4,
              }}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>{activeItems.length}</span>
                active
              </div>

              {/* Completed pill */}
              <div style={{
                fontFamily: FONT, fontSize: 12, fontWeight: 600, color: GREEN,
                background: GREEN_SOFT, border: `1px solid rgba(5,150,105,0.2)`,
                borderRadius: 9, padding: "5px 12px",
                display: "flex", alignItems: "baseline", gap: 4,
              }}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>{completedItems.length}</span>
                completed
              </div>

              {/* Generate button */}
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleGenerate}
                disabled={generating}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontFamily: FONT, fontSize: 13, fontWeight: 700,
                  color: WHITE,
                  background: generating ? BLUE_MID : `linear-gradient(135deg, ${BLUE}, ${BLUE_MID})`,
                  border: "none", borderRadius: 11, padding: "9px 16px",
                  cursor: generating ? "default" : "pointer",
                  boxShadow: "0 3px 14px rgba(29,78,216,0.28)",
                  transition: "opacity 0.15s",
                  opacity: generating ? 0.75 : 1,
                }}
              >
                {generating ? (
                  <>
                    <span style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid rgba(255,255,255,0.3)`, borderTopColor: WHITE, animation: "quest-spin 0.7s linear infinite", display: "inline-block" }} />
                    Generating…
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"/>
                      <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    {activeItems.length > 0 ? "3 more" : "Generate 3 Quests"}
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </div>

        {/* ── Generating spinner (inline) ────────────────────────────────── */}
        {generating && <GeneratingOverlay />}

        {/* ── Empty state ────────────────────────────────────────────────── */}
        {!generating && activeItems.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", padding: "64px 24px", gap: 16, textAlign: "center",
            }}
          >
            <div style={{ fontSize: 48, lineHeight: 1 }}>🗺️</div>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 20, color: TEXT }}>
              No quests yet
            </div>
            <p style={{ fontFamily: BODY, fontSize: 14, color: TEXT_MUTED, maxWidth: 320, lineHeight: 1.6, margin: 0 }}>
              Generate your first batch of personalised quests based on your profile and goals.
            </p>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleGenerate}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                fontFamily: FONT, fontSize: 14, fontWeight: 700,
                color: WHITE,
                background: `linear-gradient(135deg, ${BLUE}, ${BLUE_MID})`,
                border: "none", borderRadius: 13, padding: "12px 22px",
                cursor: "pointer",
                boxShadow: "0 4px 18px rgba(29,78,216,0.3)",
              }}
            >
              Generate your first 3 quests →
            </motion.button>
          </motion.div>
        )}

        {/* ── Active quest cards ─────────────────────────────────────────── */}
        {activeItems.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            <AnimatePresence mode="popLayout">
              {activeItems.map(item => (
                <QuestCard
                  key={item.id}
                  item={item}
                  onAction={handleAction}
                  actioning={actioning}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* ── Completed section ─────────────────────────────────────────── */}
        {completedItems.length > 0 && !generating && (
          <div style={{ marginTop: activeItems.length > 0 ? 8 : 0 }}>
            {/* Toggle */}
            <button
              onClick={() => setShowCompleted(v => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: FONT, fontSize: 13, fontWeight: 600,
                color: TEXT_MUTED, background: "none", border: "none",
                cursor: "pointer", padding: "8px 0", marginBottom: 10,
              }}
            >
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
                style={{ transform: showCompleted ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
              {completedItems.length} completed
            </button>

            {/* Completed list */}
            <AnimatePresence>
              {showCompleted && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  style={{ overflow: "hidden" }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 8 }}>
                    {completedItems.map(item => (
                      <CompletedQuestCard key={item.id} item={item} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ── Ask AI nudge ────────────────────────────────────────────────── */}
        {activeItems.length > 0 && !generating && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            style={{
              marginTop: 28,
              padding: "20px 22px",
              borderRadius: 18,
              background: "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)",
              border: `1.5px solid ${BLUE_SOFT}`,
              display: "flex", alignItems: "center",
              justifyContent: "space-between", gap: 14,
              boxShadow: "0 2px 12px rgba(29,78,216,0.06)",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 14, color: TEXT, marginBottom: 3 }}>
                Need guidance on a quest?
              </div>
              <p style={{ fontFamily: BODY, fontSize: 13, color: TEXT_MUTED, margin: 0, lineHeight: 1.5 }}>
                Ask Mentora for personalised advice on any quest.
              </p>
            </div>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate("/chat")}
              style={{
                flexShrink: 0,
                padding: "11px 20px", borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
                color: WHITE,
                fontFamily: FONT, fontWeight: 700, fontSize: 13,
                cursor: "pointer",
                display: "flex", alignItems: "center", gap: 7,
                boxShadow: "0 3px 14px rgba(29,78,216,0.28)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              Ask Mentora
            </motion.button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
