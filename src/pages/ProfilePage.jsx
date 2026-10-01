import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase.js";
import { getCache, setCache, invalidateCache, getKnownUserId, setKnownUserId } from "../lib/cache.js";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { useTheme } from "../lib/ThemeContext.jsx";
import MemorySection from "../components/profile/MemorySection.jsx";
import ConnectedAccounts from "../components/profile/ConnectedAccounts.jsx";
import { isEnabled } from "../lib/features.js";
import { agentsApi } from "../lib/agentsApi.js";
import {
  AMBER_TEXT, BORDER, DANGER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MUTED, WHITE, useAgentInk,
} from "../components/ui/tokens.js";
import {
  Button, Card, ChoiceChips, FieldLabel, Heading, INPUT_CLASS, Notice, PageHeader, StampTile, inputStyle, pageStyle,
} from "../components/ui/kit.jsx";

// ─── Constants ────────────────────────────────────────────────────────────────

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

// The saved value when a student has never picked one (the first swatch).
// Data only: every control on the page takes its colour from useAgentInk.
const DEFAULT_COLOR = PROFILE_COLORS[0].hex;

const RESPONSE_STYLES = [
  { value: "encouraging", label: "Encouraging", desc: "Warm, motivational, celebrates wins" },
  { value: "balanced",    label: "Balanced",    desc: "Mix of support and directness" },
  { value: "direct",      label: "Direct",      desc: "Straight to the point, no filler" },
  { value: "concise",     label: "Concise",     desc: "Short replies unless detail is needed" },
];
const STYLE_CHOICES = RESPONSE_STYLES.map((s) => ({ key: s.value, label: s.label }));

// ─── Atom components ──────────────────────────────────────────────────────────

const TEXT_SM = { fontFamily: SANS, fontSize: "0.92rem", color: TEXT_MUTED, lineHeight: 1.5, margin: 0 };

function Hint({ children, style }) {
  return <p style={{ ...TEXT_SM, marginTop: "0.4rem", ...style }}>{children}</p>;
}

/** A label for something that is not a single input (a group of buttons). */
function GroupLabel({ id, children }) {
  return (
    <p id={id} style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1rem", color: TEXT, margin: "0 0 8px" }}>
      {children}
    </p>
  );
}

/** A character count under a field: amber once it is close to the limit. */
function Count({ value, max, warnAt }) {
  const near = value > warnAt;
  return (
    <span style={{ ...TEXT_SM, flexShrink: 0, marginLeft: "0.75rem", marginTop: "0.4rem", fontWeight: near ? 700 : 500,
      color: near ? AMBER_TEXT : TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
      {value}/{max}
    </span>
  );
}

/** One settings section: a white card with a pixel mark beside its heading. */
function Section({ stamp, title, id, children, style }) {
  return (
    <Card as="section" aria-labelledby={id} style={{ padding: "1.25rem 1.3rem 1.4rem", ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "1.25rem" }}>
        <StampTile kind={stamp} />
        <Heading id={id}>{title}</Heading>
      </div>
      {children}
    </Card>
  );
}

/** A label and line on the left, an action on the right (wraps on a phone). */
function ActionRow({ title, line, titleColor = TEXT, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem 1rem", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <p style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 700, color: titleColor, margin: 0 }}>{title}</p>
        <Hint style={{ marginTop: "0.2rem" }}>{line}</Hint>
      </div>
      {children}
    </div>
  );
}

// ─── ProfilePage ──────────────────────────────────────────────────────────────

export default function ProfilePage({ navigate }) {
  const isMobile = useIsMobile();
  const ink = useAgentInk();
  const [loading, setLoading] = useState(() => !getCache(`profile:${getKnownUserId()}`));
  const [userId, setUserId]   = useState(getKnownUserId);
  const [userEmail, setUserEmail] = useState("");

  // Initialise fields from cache synchronously so the form renders immediately
  const _cp = getCache(`profile:${getKnownUserId()}`);

  // Identity
  const [preferredName, setPreferredName] = useState(_cp?.full_name || "");
  const [bio, setBio] = useState(_cp?.bio || "");
  const [profileColor, setProfileColor] = useState(_cp?.profile_color || DEFAULT_COLOR);
  const { setAccent: setGlobalAccent } = useTheme();

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
      setProfileColor(p.profile_color || DEFAULT_COLOR);
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
      // Save core identity fields first: these columns always exist
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
        // Migration likely not applied: name still saved, warn user
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
      // Take back Beaker's Gmail permission at Google before the account goes
      // (best effort: a failure must not stop the deletion).
      try { await agentsApi.googleDisconnect(); } catch { /* not connected, or the backend is asleep */ }
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

  // The chosen profile colour, handed to the memory switch (the rest of the
  // page reads the live accent through useAgentInk, which the swatches set).
  const accent = profileColor || DEFAULT_COLOR;
  const confirmed = deleteConfirmText.trim().toLowerCase() === "delete my account";
  const styleDesc = RESPONSE_STYLES.find((s) => s.value === agentResponseStyle)?.desc;
  const initial = (preferredName || userEmail || "?").charAt(0).toUpperCase();
  // The fixed save button and the toast clear the 60px MobileNav on a phone.
  const floatBottom = isMobile ? "calc(72px + env(safe-area-inset-bottom, 0px))" : "2rem";

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div data-sidebar-offset className="ui-page" style={pageStyle({ isMobile, sidebar: SIDEBAR_WIDTH, ink })}>
      <div style={{ maxWidth: 880, margin: "0 auto", width: "100%", paddingBottom: isMobile ? "3rem" : "4rem" }}>

        {/* Header */}
        {loading ? (
          <div aria-hidden="true" style={{ margin: "0 0 1.6rem" }}>
            <div style={{ width: 220, maxWidth: "70%", height: 40, background: BORDER, borderRadius: 10, marginBottom: 12 }} />
            <div style={{ width: 180, height: 16, background: BORDER, borderRadius: 6 }} />
          </div>
        ) : (
          <PageHeader title={preferredName || "Your Profile"} isMobile={isMobile}
            action={(
              <span aria-hidden="true" style={{ flexShrink: 0, width: 56, height: 56, borderRadius: RADIUS.card,
                background: ink.softer, border: `1px solid ${ink.soft}`, color: ink.onSoft, display: "inline-flex",
                alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 800, fontSize: "1.5rem" }}>
                {initial}
              </span>
            )}>
            {userEmail && <p style={{ margin: 0, overflowWrap: "anywhere" }}>{userEmail}</p>}
          </PageHeader>
        )}

        {loading ? (
          <SkeletonCards />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {/* ── Identity ─────────────────────────────────────────────────── */}
            <Section stamp="person" title="Identity" id="pf-identity">
              <div style={{ marginBottom: "1.4rem" }}>
                <FieldLabel htmlFor="pf-name">Preferred name</FieldLabel>
                <input
                  id="pf-name"
                  className={INPUT_CLASS}
                  style={inputStyle}
                  value={preferredName}
                  onChange={(e) => setPreferredName(e.target.value)}
                  placeholder="What should we call you?"
                  maxLength={80}
                />
                <Hint>Used by your advisor when addressing you.</Hint>
              </div>

              <div style={{ marginBottom: "1.4rem" }}>
                <FieldLabel htmlFor="pf-bio">Bio</FieldLabel>
                <textarea
                  id="pf-bio"
                  className={INPUT_CLASS}
                  style={{ ...inputStyle, minHeight: 84, resize: "vertical", lineHeight: 1.6 }}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="A sentence or two about yourself, your goals, or what you're working toward…"
                  maxLength={280}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <Hint>Optional. Shown on your profile.</Hint>
                  <Count value={bio.length} max={280} warnAt={240} />
                </div>
              </div>

              <div>
                <GroupLabel id="pf-color-label">Profile color</GroupLabel>
                <div role="group" aria-labelledby="pf-color-label" style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "0 -8px" }}>
                  {PROFILE_COLORS.map((c) => {
                    const on = profileColor === c.hex;
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        title={c.label}
                        aria-label={c.label}
                        aria-pressed={on}
                        className={FOCUS_CLASS}
                        onClick={() => { setProfileColor(c.hex); setGlobalAccent(c.hex); }}
                        style={{ width: 44, height: 44, padding: 0, border: "none", background: "transparent",
                          borderRadius: RADIUS.control, cursor: "pointer", display: "inline-flex", alignItems: "center",
                          justifyContent: "center", flexShrink: 0 }}
                      >
                        <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: "50%", background: c.hex,
                          display: "inline-flex", alignItems: "center", justifyContent: "center", color: WHITE,
                          boxShadow: on ? `0 0 0 2px ${WHITE}, 0 0 0 4px ${c.hex}` : "none", transition: "box-shadow 0.14s" }}>
                          {on && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2"
                              strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <Hint>Sets the accent color across Mentorable: your avatar, nav, and highlights everywhere.</Hint>
              </div>
            </Section>

            {/* ── Agent behavior ───────────────────────────────────────────── */}
            <Section stamp="chat" title="Your advisor" id="pf-advisor">
              <div style={{ marginBottom: "1.4rem" }}>
                <GroupLabel>Response style</GroupLabel>
                <ChoiceChips label="Response style" hideLabel options={STYLE_CHOICES} value={agentResponseStyle}
                  onChange={setAgentResponseStyle} />
                {styleDesc ? <Hint>{styleDesc}</Hint> : null}
              </div>

              <div>
                <FieldLabel htmlFor="pf-instructions">Custom instructions</FieldLabel>
                <textarea
                  id="pf-instructions"
                  className={INPUT_CLASS}
                  style={{ ...inputStyle, minHeight: 130, resize: "vertical", lineHeight: 1.6 }}
                  value={agentInstructions}
                  onChange={(e) => setAgentInstructions(e.target.value)}
                  placeholder={`Anything the agent should always keep in mind.\n\nExamples:\n• Always suggest free or low-cost resources.\n• I want to go pre-med, keep advice focused there.\n• I have very limited time after 5pm on weekdays.`}
                  maxLength={1000}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <Hint>Applied to every conversation. Max 1000 characters.</Hint>
                  <Count value={agentInstructions.length} max={1000} warnAt={900} />
                </div>
              </div>
            </Section>

            {/* ── Memory ───────────────────────────────────────────────────── */}
            <Section stamp="sparkle" title="What Mentorable remembers" id="pf-memory">
              <MemorySection userId={userId} accent={accent} onToast={showToast} />
            </Section>

            {/* ── Connected accounts ───────────────────────────────────────── */}
            {isEnabled("agents") && (
              <Section stamp="letter" title="Connected accounts" id="pf-accounts">
                <ConnectedAccounts onToast={showToast} navigate={nav} />
              </Section>
            )}

            {/* ── Danger zone ──────────────────────────────────────────────── */}
            <Section stamp="lock" title="Account" id="pf-account" style={{ marginTop: "1.5rem" }}>
              <ActionRow title="Log out" line="Sign out on this device.">
                <Button onClick={handleLogout} disabled={loggingOut} style={{ whiteSpace: "nowrap" }}>
                  {loggingOut ? "Logging out…" : "Log out"}
                </Button>
              </ActionRow>

              <div style={{ height: 1, background: BORDER, margin: "1.25rem 0" }} />

              <ActionRow title="Delete account" line="Permanently deletes all your data." titleColor={DANGER}>
                <Button kind="danger" style={{ whiteSpace: "nowrap" }}
                  onClick={() => { setDeleteModal(true); setDeleteConfirmText(""); setDeleteError(null); }}>
                  Delete account
                </Button>
              </ActionRow>
            </Section>
          </div>
        )}
      </div>

      {/* ── Delete modal ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {deleteModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(20,20,19,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
            onClick={(e) => { if (e.target === e.currentTarget && !deleting) setDeleteModal(false); }}
          >
            <motion.div
              role="dialog" aria-modal="true" aria-labelledby="pf-delete-title"
              initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.97, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card, padding: "1.5rem",
                width: "100%", maxWidth: 460, boxSizing: "border-box", boxShadow: "0 18px 48px rgba(20,20,19,0.18)" }}
            >
              <Heading id="pf-delete-title" style={{ marginBottom: "0.5rem" }}>Delete your account?</Heading>
              <p style={{ fontFamily: SANS, fontSize: "1rem", color: TEXT_MUTED, lineHeight: 1.6, margin: "0 0 1.25rem" }}>
                This permanently deletes your account, profile, and chat history. This cannot be undone.
              </p>

              <div style={{ marginBottom: "1.25rem" }}>
                <FieldLabel htmlFor="pf-delete-confirm">Type <strong>delete my account</strong> to confirm</FieldLabel>
                <input
                  id="pf-delete-confirm"
                  className={INPUT_CLASS}
                  style={{ ...inputStyle, borderColor: "#f4c7c2" }}
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="delete my account"
                  autoFocus
                />
              </div>

              {deleteError && <Notice tone="error" style={{ marginBottom: "1rem" }}>{deleteError}</Notice>}

              <div style={{ display: "flex", gap: "0.625rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                <Button onClick={() => setDeleteModal(false)} disabled={deleting}>
                  Cancel
                </Button>
                <Button kind="danger" onClick={handleDeleteAccount} disabled={!confirmed || deleting}
                  style={{ background: DANGER, color: WHITE }}>
                  {deleting ? "Deleting…" : "Delete account"}
                </Button>
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
            style={{ position: "fixed", bottom: floatBottom, left: isMobile ? 12 : SIDEBAR_WIDTH + 16, right: 12, display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 600 }}
          >
            <div style={{ maxWidth: 480, borderRadius: RADIUS.control, boxShadow: "0 14px 36px rgba(20,20,19,0.16)" }}>
              <Notice tone={toast.type === "error" ? "error" : toast.type === "warn" ? "warn" : "info"}
                style={toast.type === "success" ? { background: WHITE } : undefined}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {toast.type === "success" && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ink.text} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12" /></svg>
                  )}
                  {toast.message}
                </span>
              </Notice>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sticky save button ─────────────────────────────────────────────── */}
      <Button kind="primary" busy={saving} onClick={handleSave}
        style={{ position: "fixed", right: isMobile ? "1rem" : "1.5rem", bottom: floatBottom, zIndex: 110,
          padding: "12px 22px", boxShadow: "0 8px 24px rgba(20,20,19,0.14)" }}>
        {saving ? "Saving…" : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            Save changes
          </>
        )}
      </Button>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function SkeletonCards() {
  const shimmer = {
    background: "linear-gradient(90deg, #ece6de 25%, #f5f1ec 50%, #ece6de 75%)",
    backgroundSize: "400px 100%",
    animation: "pf-shimmer 1.5s infinite",
    borderRadius: 8,
  };
  return (
    <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <style>{`@keyframes pf-shimmer { 0% { background-position: -400px 0 } 100% { background-position: 400px 0 } }
        @media (prefers-reduced-motion: reduce) { .pf-skel { animation: none !important; } }`}</style>
      {[
        [60, 10, 38, 72, 10, 32],
        [80, 10, 120, 10, 28, 28, 28],
        [90, 10, 28, 28, 28, 10, 28, 28],
      ].map((heights, ci) => (
        <Card key={ci} style={{ padding: "1.25rem 1.3rem" }}>
          {heights.map((h, i) => (
            <div key={i} className="pf-skel" style={{ ...shimmer, width: i === 0 ? 80 : "100%", height: h, marginBottom: i < heights.length - 1 ? 10 : 0 }} />
          ))}
        </Card>
      ))}
    </div>
  );
}
