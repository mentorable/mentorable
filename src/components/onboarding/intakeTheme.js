// Shared design tokens for the onboarding intake flow.
//
// Titles follow the pattern the rest of the app settled on: a small black
// eyebrow label above an accent-colored headline. Everything is scaled up from
// the first pass, which read as too small and too bland.

export const SANS = "'Raleway', sans-serif";

export const BG      = "#fafbff";
export const CARD    = "#ffffff";
export const TEXT    = "#0e1019";
export const TEXT2   = "#4b5470";
export const TEXT3   = "#5b6188";
export const ACCENT  = "#1d4ed8";
export const ACCENT2 = "#3b82f6";
export const BORDER  = "rgba(59,91,252,0.18)";
export const PANEL   = "rgba(59,91,252,0.04)";

/** Small black label that sits above every headline. */
export const eyebrowStyle = {
  fontFamily: SANS, fontSize: "0.82rem", fontWeight: 700,
  letterSpacing: "0.02em", color: TEXT, marginBottom: 10,
};

/** The accent headline. */
export const titleStyle = {
  fontFamily: SANS, fontWeight: 700, fontSize: "2.6rem", color: ACCENT,
  letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: "0.7rem",
};

export const subtitleStyle = {
  fontFamily: SANS, fontSize: "1.12rem", color: TEXT2,
  lineHeight: 1.6, marginBottom: "2.2rem",
};

export const labelStyle = {
  fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700,
  color: ACCENT, display: "block", marginBottom: 10,
};

export const inputStyle = {
  width: "100%", fontFamily: SANS, fontSize: "1.08rem", color: TEXT,
  border: `1.5px solid ${BORDER}`, borderRadius: 13, padding: "15px 17px",
  outline: "none", background: "#fff", boxSizing: "border-box",
};

export const cardStyle = {
  background: CARD, border: `1px solid ${BORDER}`, borderRadius: 22,
  padding: "2rem", boxShadow: "0 2px 16px rgba(15,23,42,0.06)",
};

export const primaryButton = (enabled = true) => ({
  width: "100%", fontFamily: SANS, fontSize: "1.1rem", fontWeight: 700,
  cursor: enabled ? "pointer" : "not-allowed", padding: "17px",
  borderRadius: 14, border: "none",
  background: enabled ? ACCENT : "#c7d2e8", color: "#fff",
  boxShadow: enabled ? "0 8px 24px rgba(29,78,216,0.3)" : "none",
  transition: "all 0.15s",
});
