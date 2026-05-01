import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./lib/supabase.js";
import Sidebar, { SIDEBAR_WIDTH } from "./components/common/Sidebar.jsx";

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

const HOURS_OPTIONS = [
  { value: "1-2", label: "1–2 hrs/week", desc: "Light touch" },
  { value: "3-5", label: "3–5 hrs/week", desc: "Steady pace" },
  { value: "6+",  label: "6+ hrs/week",  desc: "Full commitment" },
];

const TASK_STYLES = [
  { value: "mix",      label: "Mix it up",         desc: "Variety of formats" },
  { value: "reading",  label: "Research & Reading", desc: "Articles, docs, deep dives" },
  { value: "hands_on", label: "Hands-on",           desc: "Projects & building" },
  { value: "videos",   label: "Video-based",        desc: "Tutorials & talks" },
];

const DIFFICULTY_OPTIONS = [
  { value: "gradual",     label: "Gradual",     desc: "Ease in, build slowly" },
  { value: "balanced",    label: "Balanced",    desc: "Mix of easy and hard" },
  { value: "challenging", label: "Challenging", desc: "Push me from day one" },
];

// ─── Atom components ──────────────────────────────────────────────────────────

function Label({ children }) {
  return (
    <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>
      {children}
    </p>
  );
}

function Hint({ children }) {
  return (
    <p style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.35rem", lineHeight: 1.5 }}>
      {children}
    </p>
  );
}

function SectionHeading({ children }) {
  return (
    <p style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#94a3b8", marginBottom: "1.25rem" }}>
      {children}
    </p>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "#f1f5f9", margin: "1.25rem 0" }} />;
}

const inputStyle = {
  width: "100%",
  padding: "0.6rem 0.85rem",
  border: "1.5px solid #e2e8f0",
  borderRadius: "0.5rem",
  fontSize: "0.9rem",
  fontFamily: "system-ui, sans-serif",
  color: "#0f172a",
  background: "#fafbff",
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
              padding: "0.45rem 1rem",
              borderRadius: "2rem",
              border: active ? `2px solid ${accent}` : "1.5px solid #e2e8f0",
              background: active ? `${accent}12` : "#fafbff",
              color: active ? accent : "#475569",
              fontSize: "0.82rem",
              fontWeight: active ? 700 : 500,
              cursor: "pointer",
              fontFamily: "system-ui, sans-serif",
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
  const [loading, setLoading] = useState(true);
  const [hasRoadmap, setHasRoadmap] = useState(false);
  const [userId, setUserId] = useState(null);
  const [userEmail, setUserEmail] = useState("");

  // Identity
  const [preferredName, setPreferredName] = useState("");
  const [bio, setBio] = useState("");
  const [profileColor, setProfileColor] = useState(ACCENT);

  // Agent behavior
  const [agentResponseStyle, setAgentResponseStyle] = useState("balanced");
  const [agentInstructions, setAgentInstructions] = useState("");

  // Roadmap prefs
  const [hoursPerWeek, setHoursPerWeek] = useState("");
  const [taskStyle, setTaskStyle] = useState("mix");
  const [difficulty, setDifficulty] = useState("balanced");

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
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { nav("/auth"); return; }
        setUserId(user.id);
        setUserEmail(user.email || "");

        const [profileRes, roadmapRes] = await Promise.all([
          supabase.from("profiles")
            .select("full_name, bio, profile_color, agent_response_style, agent_instructions, roadmap_hours_per_week, roadmap_task_style, roadmap_difficulty")
            .eq("id", user.id).single(),
          supabase.from("roadmaps").select("id").eq("user_id", user.id).eq("is_active", true).limit(1),
        ]);

        const p = profileRes.data;
        if (p) {
          setPreferredName(p.full_name || "");
          setBio(p.bio || "");
          setProfileColor(p.profile_color || ACCENT);
          setAgentResponseStyle(p.agent_response_style || "balanced");
          setAgentInstructions(p.agent_instructions || "");
          setHoursPerWeek(p.roadmap_hours_per_week || "");
          setTaskStyle(p.roadmap_task_style || "mix");
          setDifficulty(p.roadmap_difficulty || "balanced");
          // persist color to localStorage for immediate use in other pages
          if (p.profile_color) localStorage.setItem("profileColor", p.profile_color);
        }
        setHasRoadmap((roadmapRes.data?.length ?? 0) > 0);
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

      // Save extended fields — columns added by migration
      // Wrapped separately so a missing migration doesn't block name save
      const extendedPayload = {
        bio: bio.trim() || null,
        profile_color: profileColor || null,
        agent_response_style: agentResponseStyle || null,
        agent_instructions: agentInstructions.trim() || null,
        roadmap_hours_per_week: hoursPerWeek || null,
        roadmap_task_style: taskStyle || null,
        roadmap_difficulty: difficulty || null,
      };
      const { error: extErr } = await supabase.from("profiles").update(extendedPayload).eq("id", userId);
      if (extErr) {
        // Migration likely not applied — name still saved, warn user
        showToast("Name saved. Run the migration to save all settings.", "warn");
      } else {
        localStorage.setItem("profileColor", profileColor);
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
      const { error } = await supabase.functions.invoke("delete-account");
      if (error) throw error;
      await supabase.auth.signOut();
      nav("/");
    } catch {
      setDeleteError("Couldn't delete account. Contact support if this persists.");
      setDeleting(false);
    }
  };

  // Active accent for this page = chosen profile color
  const accent = profileColor || ACCENT;

  const card = {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "0.875rem",
    padding: "1.5rem",
    marginBottom: "1rem",
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #e8f0ff 0%, #f4f8ff 25%, #f8faff 100%)",
      fontFamily: "system-ui, -apple-system, sans-serif",
      paddingLeft: hasRoadmap ? SIDEBAR_WIDTH : 0,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .pf-input:focus  { border-color: ${accent} !important; box-shadow: 0 0 0 3px ${accent}22 !important; }
        .pf-ta:focus     { border-color: ${accent} !important; box-shadow: 0 0 0 3px ${accent}22 !important; }
        .pf-del:focus    { border-color: #ef4444 !important; box-shadow: 0 0 0 3px rgba(239,68,68,0.15) !important; }
        .pf-pill-btn:hover { border-color: #94a3b8 !important; }
      `}</style>

      {hasRoadmap && (
        <Sidebar activePath="/profile" navigate={nav} onModeClick={null} roadmapMode={localStorage.getItem("roadmapMode") || "discovery"} />
      )}

      <div style={{ maxWidth: 620, margin: "0 auto", padding: "3rem 1.5rem 6rem" }}>

        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          {!loading && (
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.5rem" }}>
              {/* Avatar */}
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                background: `linear-gradient(135deg, ${accent}, ${accent}bb)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, boxShadow: `0 4px 14px ${accent}44`,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 800, fontSize: "1.1rem", color: "white",
              }}>
                {(preferredName || userEmail || "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: "1.3rem", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
                  {preferredName || "Your Profile"}
                </h1>
                {userEmail && <p style={{ fontSize: "0.82rem", color: "#94a3b8", marginTop: "0.1rem" }}>{userEmail}</p>}
              </div>
            </div>
          )}
          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#e2e8f0" }} />
              <div>
                <div style={{ width: 140, height: 20, background: "#e2e8f0", borderRadius: "0.4rem", marginBottom: 6 }} />
                <div style={{ width: 180, height: 12, background: "#e2e8f0", borderRadius: "0.4rem" }} />
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
                  <span style={{ fontSize: "0.72rem", color: bio.length > 240 ? "#f59e0b" : "#cbd5e1" }}>{bio.length}/280</span>
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
                  <span style={{ fontSize: "0.72rem", color: agentInstructions.length > 900 ? "#f59e0b" : "#cbd5e1", flexShrink: 0, marginLeft: "0.5rem" }}>
                    {agentInstructions.length}/1000
                  </span>
                </div>
              </div>
            </div>

            {/* ── Roadmap preferences ──────────────────────────────────────── */}
            <div style={card}>
              <SectionHeading>Roadmap Preferences</SectionHeading>
              <Hint style={{ marginBottom: "1.25rem", display: "block" }}>
                These shape how new roadmap phases are generated for you.
              </Hint>

              <div style={{ marginBottom: "1.25rem", marginTop: "0.75rem" }}>
                <Label>Weekly time available</Label>
                <div style={{ marginTop: "0.5rem" }}>
                  <PillSelector options={HOURS_OPTIONS} value={hoursPerWeek} onChange={setHoursPerWeek} accent={accent} />
                </div>
                <Hint>Helps size your tasks realistically.</Hint>
              </div>

              <Divider />

              <div style={{ marginBottom: "1.25rem" }}>
                <Label>Learning style</Label>
                <div style={{ marginTop: "0.5rem" }}>
                  <PillSelector options={TASK_STYLES} value={taskStyle} onChange={setTaskStyle} accent={accent} />
                </div>
                {(() => {
                  const s = TASK_STYLES.find((o) => o.value === taskStyle);
                  return s ? <Hint>{s.desc}</Hint> : null;
                })()}
              </div>

              <Divider />

              <div>
                <Label>Difficulty preference</Label>
                <div style={{ marginTop: "0.5rem" }}>
                  <PillSelector options={DIFFICULTY_OPTIONS} value={difficulty} onChange={setDifficulty} accent={accent} />
                </div>
                {(() => {
                  const d = DIFFICULTY_OPTIONS.find((o) => o.value === difficulty);
                  return d ? <Hint>{d.desc}</Hint> : null;
                })()}
              </div>
            </div>

            {/* ── Save ─────────────────────────────────────────────────────── */}
            <div style={{ marginBottom: "2.5rem" }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: "0.7rem 1.75rem",
                  background: saving ? `${accent}99` : accent,
                  color: "white", border: "none",
                  borderRadius: "0.625rem",
                  fontSize: "0.9rem", fontWeight: 700,
                  fontFamily: "system-ui, sans-serif",
                  cursor: saving ? "not-allowed" : "pointer",
                  boxShadow: saving ? "none" : `0 3px 10px ${accent}44`,
                  transition: "opacity 0.15s, background 0.15s",
                }}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>

            {/* ── Danger zone ──────────────────────────────────────────────── */}
            <div style={{ ...card, border: "1px solid #fecaca" }}>
              <SectionHeading>Account</SectionHeading>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
                <div>
                  <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "#0f172a" }}>Log out</p>
                  <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.15rem" }}>Sign out on this device.</p>
                </div>
                <button
                  className="pf-pill-btn"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  style={{
                    padding: "0.55rem 1.1rem",
                    background: "transparent", border: "1.5px solid #e2e8f0",
                    borderRadius: "0.5rem", fontSize: "0.85rem", fontWeight: 600,
                    color: "#374151", fontFamily: "system-ui, sans-serif",
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
                  <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.15rem" }}>Permanently deletes all your data.</p>
                </div>
                <button
                  onClick={() => { setDeleteModal(true); setDeleteConfirmText(""); setDeleteError(null); }}
                  style={{
                    padding: "0.55rem 1.1rem", background: "transparent",
                    border: "1.5px solid #fca5a5", borderRadius: "0.5rem",
                    fontSize: "0.85rem", fontWeight: 600, color: "#ef4444",
                    fontFamily: "system-ui, sans-serif", cursor: "pointer",
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
              <p style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0f172a", marginBottom: "0.5rem" }}>Delete your account?</p>
              <p style={{ fontSize: "0.875rem", color: "#64748b", lineHeight: 1.6, marginBottom: "1.25rem" }}>
                This permanently deletes your account, profile, roadmap, and all chat history. This cannot be undone.
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
                  style={{ padding: "0.6rem 1.1rem", background: "transparent", border: "1.5px solid #e2e8f0", borderRadius: "0.5rem", fontSize: "0.875rem", fontWeight: 600, color: "#374151", cursor: "pointer", fontFamily: "system-ui, sans-serif" }}
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
                    fontFamily: "system-ui, sans-serif", transition: "background 0.15s",
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
              background: toast.type === "error" ? "#fef2f2" : toast.type === "warn" ? "#fffbeb" : "#0f172a",
              color: toast.type === "error" ? "#dc2626" : toast.type === "warn" ? "#92400e" : "white",
              border: toast.type === "success" ? "none" : `1px solid ${toast.type === "error" ? "#fca5a5" : "#fcd34d"}`,
              padding: "0.75rem 1.25rem", borderRadius: "0.75rem",
              fontSize: "0.875rem", fontWeight: 600,
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
