import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../../lib/supabase.js";

export default function ModeSwitchModal({ currentMode, userId, onConfirm, onCancel }) {
  const [careerDirection, setCareerDirection] = useState("");
  const [previousCareerPlans, setPreviousCareerPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null); // null = new plan

  const switchingToCareer = currentMode === "discovery";

  // Load previous career roadmaps when switching to career mode
  useEffect(() => {
    if (!switchingToCareer || !userId) return;
    const loadPrevious = async () => {
      const { data } = await supabase
        .from("roadmaps")
        .select("id, career_direction, current_phase_number, confidence_score, created_at")
        .eq("user_id", userId)
        .eq("mode", "career")
        .order("created_at", { ascending: false });
      setPreviousCareerPlans(data || []);
    };
    loadPrevious();
  }, [switchingToCareer, userId]);

  const handleConfirm = () => {
    if (switchingToCareer) {
      if (selectedPlan) {
        // Continue an existing career roadmap
        onConfirm("career", selectedPlan.career_direction, selectedPlan.id);
      } else {
        // Start a new career roadmap
        if (!careerDirection.trim()) return;
        onConfirm("career", careerDirection.trim(), null);
      }
    } else {
      onConfirm("discovery", null, null);
    }
  };

  const confirmDisabled = switchingToCareer && !selectedPlan && !careerDirection.trim();

  return (
    <AnimatePresence>
      <div style={{ position: "fixed", inset: 0, zIndex: 300 }}>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(15,23,42,0.55)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
          }}
        />

        {/* Modal */}
        <div style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          pointerEvents: "none",
        }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 16 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            style={{
              background: "#ffffff",
              borderRadius: "1.25rem",
              boxShadow: "0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)",
              padding: "2rem",
              width: "min(460px, 100%)",
              pointerEvents: "auto",
              maxHeight: "85vh",
              overflowY: "auto",
            }}
          >
            {/* Icon */}
            <div style={{
              width: 48,
              height: 48,
              borderRadius: "0.875rem",
              background: switchingToCareer ? "#6366f110" : "#3b82f610",
              border: `1.5px solid ${switchingToCareer ? "#6366f130" : "#3b82f630"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "1.25rem",
              fontSize: "1.4rem",
            }}>
              {switchingToCareer ? "\u{1F3AF}" : "\u{1F9ED}"}
            </div>

            {/* Title */}
            <h2 style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 800,
              fontSize: "1.2rem",
              color: "#0f172a",
              margin: "0 0 0.625rem 0",
              lineHeight: 1.3,
            }}>
              {switchingToCareer
                ? "Ready to commit to a direction?"
                : "Want to explore more options?"}
            </h2>

            {/* Body text */}
            <p style={{
              fontSize: "0.875rem",
              color: "#64748b",
              lineHeight: 1.6,
              margin: "0 0 1.25rem 0",
            }}>
              {switchingToCareer
                ? "Career Mode focuses your roadmap on a specific field. Every task and milestone is tailored to that path. You can always switch back to exploration later."
                : "Discovery Mode opens up your roadmap to explore multiple career directions at once. This is great if you're still figuring out what fits you best."}
            </p>

            {/* Career mode options */}
            {switchingToCareer && (
              <div style={{ marginBottom: "1.5rem" }}>
                {/* Previous career plans */}
                {previousCareerPlans.length > 0 && (
                  <div style={{ marginBottom: "1.25rem" }}>
                    <label style={{
                      display: "block",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      color: "#374151",
                      marginBottom: "0.5rem",
                      letterSpacing: "0.02em",
                    }}>
                      Continue a previous plan
                    </label>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {previousCareerPlans.map((plan) => (
                        <button
                          key={plan.id}
                          onClick={() => {
                            setSelectedPlan(selectedPlan?.id === plan.id ? null : plan);
                            if (selectedPlan?.id !== plan.id) setCareerDirection("");
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "0.75rem 1rem",
                            borderRadius: "0.75rem",
                            border: selectedPlan?.id === plan.id
                              ? "2px solid #6366f1"
                              : "1.5px solid #e2e8f0",
                            background: selectedPlan?.id === plan.id
                              ? "#6366f108"
                              : "#ffffff",
                            cursor: "pointer",
                            textAlign: "left",
                            width: "100%",
                            outline: "none",
                            transition: "border-color 0.15s",
                          }}
                        >
                          <div>
                            <span style={{
                              fontFamily: "'Plus Jakarta Sans', sans-serif",
                              fontWeight: 700,
                              fontSize: "0.875rem",
                              color: "#0f172a",
                            }}>
                              {plan.career_direction}
                            </span>
                            <span style={{
                              display: "block",
                              fontSize: "0.75rem",
                              color: "#94a3b8",
                              marginTop: "0.15rem",
                            }}>
                              Phase {plan.current_phase_number}
                            </span>
                          </div>
                          {selectedPlan?.id === plan.id && (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Divider if there are previous plans */}
                {previousCareerPlans.length > 0 && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    marginBottom: "1rem",
                  }}>
                    <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
                    <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      or start new
                    </span>
                    <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
                  </div>
                )}

                {/* New career direction input */}
                <div>
                  <label style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "#374151",
                    marginBottom: "0.5rem",
                    letterSpacing: "0.02em",
                  }}>
                    {previousCareerPlans.length > 0 ? "New direction" : "What field are you gravitating toward?"}
                  </label>
                  <input
                    type="text"
                    value={careerDirection}
                    onChange={(e) => {
                      setCareerDirection(e.target.value);
                      if (e.target.value.trim()) setSelectedPlan(null);
                    }}
                    placeholder="e.g. Software Engineering, Medicine, Law..."
                    autoFocus={previousCareerPlans.length === 0}
                    style={{
                      width: "100%",
                      padding: "0.7rem 1rem",
                      borderRadius: "0.75rem",
                      border: selectedPlan ? "1.5px solid #e2e8f0" : "1.5px solid #6366f1",
                      fontSize: "0.875rem",
                      color: "#0f172a",
                      fontFamily: "system-ui, sans-serif",
                      outline: "none",
                      transition: "border-color 0.2s",
                      boxSizing: "border-box",
                      opacity: selectedPlan ? 0.5 : 1,
                    }}
                    onFocus={(e) => {
                      setSelectedPlan(null);
                      e.target.style.borderColor = "#6366f1";
                      e.target.style.opacity = "1";
                    }}
                    onBlur={(e) => {
                      if (!careerDirection.trim()) {
                        e.target.style.borderColor = "#e2e8f0";
                      }
                    }}
                  />
                </div>
              </div>
            )}

            {/* Buttons */}
            <div style={{
              display: "flex",
              gap: "0.625rem",
              flexDirection: "column",
            }}>
              <button
                onClick={handleConfirm}
                disabled={confirmDisabled}
                style={{
                  padding: "0.75rem 1.25rem",
                  borderRadius: "0.875rem",
                  border: "none",
                  background: switchingToCareer ? "#6366f1" : "#3b82f6",
                  color: "white",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  cursor: confirmDisabled ? "not-allowed" : "pointer",
                  opacity: confirmDisabled ? 0.5 : 1,
                  transition: "opacity 0.2s, transform 0.15s",
                  width: "100%",
                }}
              >
                {switchingToCareer
                  ? (selectedPlan ? `Continue ${selectedPlan.career_direction}` : "Start Career Mode")
                  : "Go back to exploring"}
              </button>

              <button
                onClick={onCancel}
                style={{
                  padding: "0.75rem 1.25rem",
                  borderRadius: "0.875rem",
                  border: "1.5px solid #e2e8f0",
                  background: "transparent",
                  color: "#64748b",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  cursor: "pointer",
                  transition: "background 0.15s, color 0.15s",
                  width: "100%",
                }}
              >
                {switchingToCareer ? "Not yet, keep exploring" : "Stay in Career Mode"}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}
