/* SVG icon helpers — no emojis */
function IconHome()        { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>; }
function IconMap()         { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>; }
function IconTarget()      { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>; }
function IconUser()        { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>; }
function IconSettings()    { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }

const NAV = [
  { label: "ROADMAP",  Icon: IconHome,     active: true },
  { label: "PHASES",   Icon: IconMap },
  { label: "GOALS",    Icon: IconTarget },
  { label: "PROFILE",  Icon: IconUser },
  { label: "SETTINGS", Icon: IconSettings },
];

export default function Sidebar() {
  return (
    <aside
      style={{
        position:    "fixed",
        left:        0,
        top:         0,
        zIndex:      40,
        display:     "flex",
        flexDirection: "column",
        height:      "100vh",
        width:       270,
        background:  "#fff",
        borderRight: "2px solid rgb(var(--m-border))",
        boxShadow:   "2px 0 12px rgba(0,0,0,0.04)",
      }}
    >
      {/* Wordmark */}
      <div style={{ padding: "2rem 1.5rem 1.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{
            fontFamily:    "'Plus Jakarta Sans', sans-serif",
            fontWeight:    900,
            fontSize:      "1.35rem",
            color:         "rgb(var(--m-indigo))",
            letterSpacing: "-0.03em",
          }}>
            mentorable
          </span>
          <span style={{
            width:        6, height:     6,
            borderRadius: "50%",
            background:   "rgb(var(--m-indigo))",
            boxShadow:    "0 0 6px rgba(99,102,241,0.7)",
            marginBottom: 3,
            flexShrink:   0,
            display:      "inline-block",
          }} />
        </div>
        <p style={{
          marginTop:  "0.25rem",
          fontSize:   "0.72rem",
          fontWeight: 600,
          color:      "rgb(var(--m-slate))",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}>
          Your learning roadmap
        </p>
      </div>

      {/* Nav */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 12px" }}>
        {NAV.map(({ label, Icon, active }) => (
          <button
            key={label}
            type="button"
            style={{
              display:        "flex",
              alignItems:     "center",
              height:         52,
              gap:            "0.9rem",
              borderRadius:   "0.875rem",
              border:         active ? "2px solid rgba(99,102,241,0.2)" : "2px solid transparent",
              background:     active ? "rgba(99,102,241,0.08)" : "transparent",
              color:          active ? "rgb(var(--m-indigo))" : "rgb(var(--m-slate))",
              cursor:         "pointer",
              padding:        "0 1rem",
              fontSize:       "0.82rem",
              fontWeight:     800,
              letterSpacing:  "0.05em",
              textTransform:  "uppercase",
              transition:     "background 0.15s, color 0.15s",
              fontFamily:     "'Plus Jakarta Sans', sans-serif",
            }}
          >
            <span style={{ flexShrink: 0 }}><Icon /></span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
