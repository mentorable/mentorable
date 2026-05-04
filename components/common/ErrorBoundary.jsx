import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(180deg, #e8f0ff 0%, #f8faff 100%)",
        padding: "2rem",
        fontFamily: "system-ui, sans-serif",
      }}>
        <div style={{
          background: "#fff",
          borderRadius: "1.25rem",
          padding: "2.5rem 2rem",
          maxWidth: 400,
          width: "100%",
          textAlign: "center",
          boxShadow: "0 8px 40px rgba(0,0,0,0.1)",
          border: "1px solid #fecaca",
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: "50%",
            background: "rgba(239,68,68,0.06)", border: "1.5px solid rgba(239,68,68,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 1.25rem",
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <h2 style={{ fontWeight: 700, fontSize: "1.1rem", color: "#0f172a", marginBottom: "0.5rem" }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: "0.875rem", color: "#64748b", marginBottom: "1.5rem", lineHeight: 1.6 }}>
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: "0.6rem 1.5rem",
              background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
              color: "white", border: "none", borderRadius: "0.625rem",
              fontSize: "0.875rem", fontWeight: 700, cursor: "pointer",
              marginRight: "0.5rem",
            }}
          >
            Try again
          </button>
          <button
            onClick={() => { window.location.href = "/"; }}
            style={{
              padding: "0.6rem 1.25rem",
              background: "transparent", color: "#64748b",
              border: "1.5px solid #e2e8f0", borderRadius: "0.625rem",
              fontSize: "0.875rem", fontWeight: 600, cursor: "pointer",
            }}
          >
            Go home
          </button>
        </div>
      </div>
    );
  }
}
