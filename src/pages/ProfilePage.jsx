import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase.js";
import { getCache, setCache, invalidateCache, getKnownUserId, setKnownUserId } from "../lib/cache.js";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCENT = "#3b82f6";

const PROFILE_COLORS = [
  { hex: "#3b82f6", label: "Blue" },
  { hex: "#8b5cf6", label: "Violet" },
  { hex: "#10b981", label: "Emerald" },
  { hex: "#f43f5e", label: "Rose" },
  { hex: "#f59e0b", label: "Amber" },
  { hex: "#0ea5e9", label: "Sky" },
  { hex: "#ec4899", label: "Pink" },
  { hex: "#6366f1", label: "Indigo" },
];

const RESPONSE_STYLES = [
  { value: "encouraging", label: "Encouraging", desc: "Warm, motivational, celebrates wins" },
  { value: "balanced",    label: "Balanced",    desc: "Mix of support and directness" },
  { value: "direct",      label: "Direct",      desc: "Straight to the point, no filler" },
  { value: "concise",     label: "Concise",     desc: "Short replies unless detail is needed" },
];

// ─── Atom components ──────────────────────────────────────────────────────────

const SG = "'Inter', -apple-system, sans-serif";
const JK = "'Inter', -apple-system, sans-serif";

function Label({ children }) {
  return (
    <p style={{ fontFamily: SG, fontSize: "0.9375rem", fontWeight: 700, color: "#141413", marginBottom: "0.5rem" }}>
      {children}
    </p>
  );
}

function Hint({ children }) {
  return (
    <p style={{ fontFamily: SG, fontSize: "0.75rem", color: "#8e8b82", marginTop: "0.35rem", lineHeight: 1.5 }}>
      {children}
    </p>
  );
}

function SectionHeading({ children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "1.25rem" }}>
      <p style={{ fontFamily: SG, fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#3b82f6", margin: 0 }}>
        {children}
      </p>
      <div style={{ flex: 1, height: 1, background: "#e6dfd8" }} />
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "#f5f0e8", margin: "1.25rem 0" }} />;
}

const inputStyle = {
  width: "100%",
  padding: "0.875rem 1rem",
  border: "1.5px solid #e2e8f0",
  borderRadius: "0.75rem",
  fontSize: "1rem",
  fontFamily: "'Inter', -apple-system, sans-serif",
  color: "#141413",
  background: "#faf9f5",
  outline: "none",
  transition: "border-color 0.15s, box-shadow 0.15s",
  boxSizing: "border-box",
};

function PillSelector({ options, value, onChange, accent = ACCENT }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            title={opt.desc}
            style={{
              padding: "0.55rem 1.125rem",
              borderRadius: "2rem",
              border: active ? `2px solid ${accent}` : "1.5px solid #e2e8f0",
              background: active ? `${accent}12` : "#fafbff",
              color: active ? accent : "#3d3d3a",
              fontSize: "0.9rem",
              fontWeight: active ? 700 : 500,
              cursor: "pointer",
              fontFamily: "'Inter', -apple-system, sans-serif",
              transition: "all 0.14s",
              whiteSpace: "nowrap",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── ProfilePage ──────────────────────────────────────────────────────────────

export default function ProfilePage({ navigate }) {
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(() => !getCache(`profile:${getKnownUserId()}`));
  const [userId, setUserId]   = useState(getKnownUserId);
  const [userEmail, setUserEmail] = useState("");

  // Initialise fields from cache synchronously so the form renders immediately
  const _cp = getCache(`profile:${getKnownUserId()}`);

  // Identity
  const [preferredName, setPreferredName] = useState(_cp?.full_name || "");
  const [bio, setBio] = useState(_cp?.bio || "");
  const [profileColor, setProfileColor] = useState(_cp?.profile_color || ACCENT);

  // Agent behavior
  const [agentResponseStyle, setAgentResponseStyle] = useState(_cp?.agent_response_style || "balanced");
  const [agentInstructions, setAgentInstructions] = useState(_cp?.agent_instructions || "");

  // Save state
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Danger zone
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const nav = navigate || ((p) => { window.location.href = p; });
  const toastTimer = useRef(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    const applyProfile = (p) => {
      setPreferredName(p.full_name || "");
      setBio(p.bio || "");
      setProfileColor(p.profile_color || ACCENT);
      setAgentResponseStyle(p.agent_response_style || "balanced");
      setAgentInstructions(p.agent_instructions || "");
      if (p.profile_color) localStorage.setItem("profileColor", p.profile_color);
    };

    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { nav("/auth"); return; }
        setUserId(user.id);
        setKnownUserId(user.id);
        setUserEmail(user.email || "");

        const { data: p } = await supabase.from("profiles")
          .select("full_name, bio, profile_color, agent_response_style, agent_instructions")
          .eq("id", user.id).single();

        if (p) { applyProfile(p); setCache(`profile:${user.id}`, p); }
      } catch {
        // show page anyway
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => clearTimeout(toastTimer.current);
  }, []);

  const handleSave = async () => {
    if (saving || !userId) return;
    setSaving(true);
    try {
      // Save core identity fields first — these columns always exist
      const { error: coreErr } = await supabase.from("profiles").update({
        full_name: preferredName.trim() || null,
      }).eq("id", userId);
      if (coreErr) throw coreErr;

      const extendedPayload = {
        bio: bio.trim() || null,
        profile_color: profileColor || null,
        agent_response_style: agentResponseStyle || null,
        agent_instructions: agentInstructions.trim() || null,
      };
      const { error: extErr } = await supabase.from("profiles").update(extendedPayload).eq("id", userId);
      if (extErr) {
        // Migration likely not applied — name still saved, warn user
        showToast("Name saved. Run the migration to save all settings.", "warn");
      } else {
        localStorage.setItem("profileColor", profileColor);
        invalidateCache(`profile:${userId}`);
        showToast("Settings saved");
      }
    } catch {
      showToast("Couldn't save. Try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    await supabase.auth.signOut();
    nav("/");
  };

  const handleDeleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const { data: deleteData, error } = await supabase.functions.invoke("delete-account");
      if (error) throw error;
      if (deleteData?.error) throw new Error(deleteData.error);
      await supabase.auth.signOut();
      nav("/");
    } catch (err) {
      console.error("[delete-account]", err);
      setDeleteError(err?.message || "Couldn't delete account. Contact support if this persists.");
      setDeleting(false);
    }
  };

  // Active accent for this page = chosen profile color
  const accent = profileColor || ACCENT;

  const card = {
    background: "#faf9f5",
    border: "1px solid rgba(29,78,216,0.1)",
    borderTop: `3px solid ${accent}`,
    borderRadius: "1rem",
    padding: "1.5rem",
    marginBottom: "1rem",
    boxShadow: `0 4px 20px rgba(29,78,216,0.07), 0 1px 4px rgba(15,23,42,0.04), 0 0 0 0 ${accent}`,
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div data-sidebar-offset style={{
      minHeight: "100vh",
      background: "#faf9f5",
      backgroundImage: "radial-gradient(circle, rgba(29,78,216,0.06) 1px, transparent 1px)",
      backgroundSize: "28px 28px",
      fontFamily: "'Inter', -apple-system, sans-serif",
      paddingLeft: isMobile ? 0 : SIDEBAR_WIDTH,
      paddingBottom: isMobile ? 96 : 0,
      position: "relative",
    }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @import
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .pf-input:focus  { border-color: ${accent} !important; box-shadow: 0 0 0 4px ${accent}18, 0 2px 12px ${accent}20 !important; }
        .pf-ta:focus     { border-color: ${accent} !important; box-shadow: 0 0 0 4px ${accent}18, 0 2px 12px ${accent}20 !important; }
        .pf-del:focus    { border-color: #ef4444 !important; box-shadow: 0 0 0 4px rgba(239,68,68,0.15) !important; }
        .pf-pill-btn:hover { border-color: #94a3b8 !important; }
        @keyframes pf-shimmer { 0% { background-position: -400px 0 } 100% { background-position: 400px 0 } }
        @keyframes spinner-rotate { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 620, margin: "0 auto", padding: "3rem 1.5rem 6rem", position: "relative" }}>

        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          {!loading && (
            <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", marginBottom: "0.5rem" }}>
              {/* Avatar with glow halo */}
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{
                  position: "absolute", inset: -6, borderRadius: "50%",
                  background: `radial-gradient(circle, ${accent}30, transparent 70%)`,
                  filter: "blur(8px)",
                }} />
                <div style={{
                  position: "relative",
                  width: 58, height: 58, borderRadius: "50%",
                  background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: `0 0 0 2px ${accent}22, 0 6px 24px ${accent}40`,
                  fontFamily: "'Inter', -apple-system, sans-serif",
                  fontWeight: 800, fontSize: "1.35rem", color: "white",
                }}>
                  {(preferredName || userEmail || "?").charAt(0).toUpperCase()}
                </div>
              </div>
              <div>
                <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.9rem", fontWeight: 600, color: "#141413", letterSpacing: "-0.01em", lineHeight: 1.15 }}>
                  {preferredName || "Your Profile"}
                </h1>
                {userEmail && <p style={{ fontFamily: "'Inter', -apple-system, sans-serif", fontSize: "0.82rem", color: "#8e8b82", marginTop: "0.25rem" }}>{userEmail}</p>}
              </div>
            </div>
          )}
          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#e6dfd8" }} />
              <div>
                <div style={{ width: 140, height: 20, background: "#e6dfd8", borderRadius: "0.4rem", marginBottom: 6 }} />
                <div style={{ width: 180, height: 12, background: "#e6dfd8", borderRadius: "0.4rem" }} />
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <SkeletonCards />
        ) : (
          <>
            {/* ── Identity ─────────────────────────────────────────────────── */}
            <div style={card}>
              <SectionHeading>Identity</SectionHeading>

              <div style={{ marginBottom: "1.25rem" }}>
                <Label>Preferred name</Label>
                <input
                  className="pf-input"
                  style={inputStyle}
                  value={preferredName}
                  onChange={(e) => setPreferredName(e.target.value)}
                  placeholder="What should we call you?"
                  maxLength={80}
                />
                <Hint>Used by the Mentorable Agent when addressing you.</Hint>
              </div>

              <div style={{ marginBottom: "1.25rem" }}>
                <Label>Bio</Label>
                <textarea
                  className="pf-ta"
                  style={{ ...inputStyle, minHeight: 72, resize: "vertical", lineHeight: 1.6 }}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="A sentence or two about yourself, your goals, or what you're working toward…"
                  maxLength={280}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.3rem" }}>
                  <Hint>Optional. Shown on your profile.</Hint>
                  <span style={{ fontSize: "0.72rem", color: bio.length > 240 ? "#f59e0b" : "#d4ccbf" }}>{bio.length}/280</span>
                </div>
              </div>

              <div>
                <Label>Profile color</Label>
                <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                  {PROFILE_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      title={c.label}
                      onClick={() => setProfileColor(c.hex)}
                      style={{
                        width: 28, height: 28, borderRadius: "50%",
                        background: c.hex, border: "none",
                        cursor: "pointer", padding: 0, flexShrink: 0,
                        boxShadow: profileColor === c.hex
                          ? `0 0 0 2.5px #f8faff, 0 0 0 4.5px ${c.hex}`
                          : "none",
                        transform: profileColor === c.hex ? "scale(1.18)" : "scale(1)",
                        transition: "transform 0.14s, box-shadow 0.14s",
                      }}
                    />
                  ))}
                </div>
                <Hint>Sets the accent color for your avatar and highlights.</Hint>
              </div>
            </div>

            {/* ── Agent behavior ───────────────────────────────────────────── */}
            <div style={card}>
              <SectionHeading>Mentorable Agent</SectionHeading>

              <div style={{ marginBottom: "1.25rem" }}>
                <Label>Response style</Label>
                <div style={{ marginTop: "0.5rem" }}>
                  <PillSelector
                    options={RESPONSE_STYLES}
                    value={agentResponseStyle}
                    onChange={setAgentResponseStyle}
                    accent={accent}
                  />
                </div>
                {(() => {
                  const style = RESPONSE_STYLES.find((s) => s.value === agentResponseStyle);
                  return style ? <Hint>{style.desc}</Hint> : null;
                })()}
              </div>

              <div>
                <Label>Custom instructions</Label>
                <textarea
                  className="pf-ta"
                  style={{ ...inputStyle, minHeight: 110, resize: "vertical", lineHeight: 1.6 }}
                  value={agentInstructions}
                  onChange={(e) => setAgentInstructions(e.target.value)}
                  placeholder={`Anything the agent should always keep in mind.\n\nExamples:\n• Always suggest free or low-cost resources.\n• I want to go pre-med — keep advice focused there.\n• I have very limited time after 5pm on weekdays.`}
                  maxLength={1000}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: "0.3rem" }}>
                  <Hint>Applied to every conversation. Max 1000 characters.</Hint>
                  <span style={{ fontSize: "0.72rem", color: agentInstructions.length > 900 ? "#f59e0b" : "#d4ccbf", flexShrink: 0, marginLeft: "0.5rem" }}>
                    {agentInstructions.length}/1000
                  </span>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: "2.5rem" }} />

            {/* ── Danger zone ──────────────────────────────────────────────── */}
            <div style={{ ...card, border: "1px solid #fecaca" }}>
              <SectionHeading>Account</SectionHeading>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
                <div>
                  <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "#141413" }}>Log out</p>
                  <p style={{ fontSize: "0.78rem", color: "#8e8b82", marginTop: "0.15rem" }}>Sign out on this device.</p>
                </div>
                <button
                  className="pf-pill-btn"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  style={{
                    padding: "0.55rem 1.1rem",
                    background: "transparent", border: "1.5px solid #e2e8f0",
                    borderRadius: "0.5rem", fontSize: "0.85rem", fontWeight: 600,
                    color: "#3d3d3a", fontFamily: "'Inter', -apple-system, sans-serif",
                    cursor: loggingOut ? "not-allowed" : "pointer",
                    opacity: loggingOut ? 0.6 : 1, whiteSpace: "nowrap",
                    flexShrink: 0, marginLeft: "1rem",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                >
                  {loggingOut ? "Logging out…" : "Log out"}
                </button>
              </div>

              <Divider />

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "#ef4444" }}>Delete account</p>
                  <p style={{ fontSize: "0.78rem", color: "#8e8b82", marginTop: "0.15rem" }}>Permanently deletes all your data.</p>
                </div>
                <button
                  onClick={() => { setDeleteModal(true); setDeleteConfirmText(""); setDeleteError(null); }}
                  style={{
                    padding: "0.55rem 1.1rem", background: "transparent",
                    border: "1.5px solid #fca5a5", borderRadius: "0.5rem",
                    fontSize: "0.85rem", fontWeight: 600, color: "#ef4444",
                    fontFamily: "'Inter', -apple-system, sans-serif", cursor: "pointer",
                    whiteSpace: "nowrap", flexShrink: 0, marginLeft: "1rem",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.borderColor = "#ef4444"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "#fca5a5"; }}
                >
                  Delete account
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Delete modal ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {deleteModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}
            onClick={(e) => { if (e.target === e.currentTarget && !deleting) setDeleteModal(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              style={{ background: "#fff", borderRadius: "1rem", padding: "2rem", width: "100%", maxWidth: 440, boxShadow: "0 25px 60px rgba(0,0,0,0.2)" }}
            >
              <p style={{ fontSize: "1.05rem", fontWeight: 700, color: "#141413", marginBottom: "0.5rem" }}>Delete your account?</p>
              <p style={{ fontSize: "0.875rem", color: "#6c6a64", lineHeight: 1.6, marginBottom: "1.25rem" }}>
                This permanently deletes your account, profile, and chat history. This cannot be undone.
              </p>

              <div style={{ marginBottom: "1.25rem" }}>
                <Label>Type <strong>delete my account</strong> to confirm</Label>
                <input
                  className="pf-del"
                  style={{ ...inputStyle, border: "1.5px solid #fca5a5" }}
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="delete my account"
                  autoFocus
                />
              </div>

              {deleteError && <p style={{ fontSize: "0.82rem", color: "#ef4444", fontWeight: 500, marginBottom: "1rem" }}>{deleteError}</p>}

              <div style={{ display: "flex", gap: "0.625rem", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setDeleteModal(false)}
                  disabled={deleting}
                  style={{ padding: "0.6rem 1.1rem", background: "transparent", border: "1.5px solid #e2e8f0", borderRadius: "0.5rem", fontSize: "0.875rem", fontWeight: 600, color: "#3d3d3a", cursor: "pointer", fontFamily: "'Inter', -apple-system, sans-serif" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText.trim().toLowerCase() !== "delete my account" || deleting}
                  style={{
                    padding: "0.6rem 1.1rem",
                    background: deleteConfirmText.trim().toLowerCase() === "delete my account" && !deleting ? "#ef4444" : "#fca5a5",
                    border: "none", borderRadius: "0.5rem",
                    fontSize: "0.875rem", fontWeight: 700, color: "white",
                    cursor: deleteConfirmText.trim().toLowerCase() === "delete my account" && !deleting ? "pointer" : "not-allowed",
                    fontFamily: "'Inter', -apple-system, sans-serif", transition: "background 0.15s",
                  }}
                >
                  {deleting ? "Deleting…" : "Delete account"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toast ─────────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ position: "fixed", bottom: "2rem", left: 0, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 600 }}
          >
            <div style={{
              background: toast.type === "error" ? "#fef2f2" : toast.type === "warn" ? "#fffbeb" : "#141413",
              color: toast.type === "error" ? "#dc2626" : toast.type === "warn" ? "#92400e" : "white",
              border: toast.type === "success" ? "none" : `1px solid ${toast.type === "error" ? "#fca5a5" : "#fcd34d"}`,
              padding: "0.9rem 1.5rem", borderRadius: "0.75rem",
              fontSize: "0.9375rem", fontWeight: 600,
              boxShadow: "0 8px 28px rgba(0,0,0,0.14)",
              display: "flex", alignItems: "center", gap: "0.5rem",
            }}>
              {toast.type === "success" && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              )}
              {toast.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sticky save button ─────────────────────────────────────────────── */}
      <motion.button
        onClick={handleSave}
        disabled={saving}
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.4, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: "fixed",
          right: "1.5rem",
          bottom: "2rem",
          zIndex: 100,
          padding: "0.9rem 1.75rem",
          background: saving ? `${accent}99` : accent,
          color: "white",
          border: "none",
          borderRadius: "0.875rem",
          fontSize: "1rem",
          fontWeight: 700,
          fontFamily: "'Inter', -apple-system, sans-serif",
          cursor: saving ? "not-allowed" : "pointer",
          boxShadow: saving ? "none" : `0 6px 24px ${accent}55, 0 2px 8px rgba(0,0,0,0.12)`,
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          transition: "background 0.15s, box-shadow 0.15s",
        }}
      >
        {saving ? (
          <>
            <div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "white", borderRadius: "50%", animation: "spinner-rotate 0.7s linear infinite", flexShrink: 0 }} />
            Saving…
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            Save changes
          </>
        )}
      </motion.button>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function SkeletonCards() {
  const shimmer = {
    background: "linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)",
    backgroundSize: "400px 100%",
    animation: "pf-shimmer 1.5s infinite",
    borderRadius: "0.4rem",
  };
  return (
    <>
      <style>{`@keyframes pf-shimmer { 0% { background-position: -400px 0 } 100% { background-position: 400px 0 } }`}</style>
      {[
        [60, 10, 38, 72, 10, 32],
        [80, 10, 120, 10, 28, 28, 28],
        [90, 10, 28, 28, 28, 10, 28, 28],
      ].map((heights, ci) => (
        <div key={ci} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "0.875rem", padding: "1.5rem", marginBottom: "1rem" }}>
          {heights.map((h, i) => (
            <div key={i} style={{ ...shimmer, width: i === 0 ? 80 : "100%", height: h, marginBottom: i < heights.length - 1 ? 10 : 0 }} />
          ))}
        </div>
      ))}
    </>
  );
}
