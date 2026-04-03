function IconBook() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

export default function UnitBanner({ title = "Order at a café", section = "Section 1, Unit 1" }) {
  return (
    <section
      style={{
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "space-between",
        borderRadius:    "1rem",
        padding:         "1.25rem 1.5rem",
        background:      "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
        borderBottom:    "4px solid #3730a3",
        boxShadow:       "0 4px 20px rgba(99,102,241,0.22)",
        fontFamily:      "'Plus Jakarta Sans', sans-serif",
      }}
    >
      <div>
        <p style={{
          fontSize:      "0.72rem",
          fontWeight:    700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color:         "rgba(255,255,255,0.75)",
          margin:        "0 0 0.3rem 0",
        }}>
          {section}
        </p>
        <h1 style={{
          fontWeight:  900,
          fontSize:    "1.35rem",
          color:       "#fff",
          margin:      0,
          lineHeight:  1.25,
          textShadow:  "0 1px 4px rgba(0,0,0,0.12)",
        }}>
          {title}
        </h1>
      </div>

      <button
        type="button"
        style={{
          display:       "flex",
          alignItems:    "center",
          gap:           "0.5rem",
          borderRadius:  "0.75rem",
          borderBottom:  "4px solid rgba(0,0,0,0.22)",
          border:        "none",
          background:    "rgba(255,255,255,0.15)",
          color:         "#fff",
          fontFamily:    "'Plus Jakarta Sans', sans-serif",
          fontWeight:    800,
          fontSize:      "0.8rem",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          padding:       "0.6rem 1.1rem",
          cursor:        "pointer",
          transition:    "transform 0.15s ease",
          boxShadow:     "0 4px 0 rgba(0,0,0,0.2)",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
      >
        <IconBook />
        GUIDEBOOK
      </button>
    </section>
  );
}
