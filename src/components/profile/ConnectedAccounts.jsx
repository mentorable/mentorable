import { useCallback, useEffect, useState } from "react";
import { agentsApi } from "../../lib/agentsApi.js";

// "Connected accounts" on Profile: the Gmail send permission Beaker (the
// outreach agent) uses. Connecting happens in Beaker's flow, where the reason is
// obvious; this is where a student can see it and take it back.

const SANS = "'Raleway', sans-serif";
const INK = "#141413";
const MUTED = "#6a6760";
const DANGER = "#dc2626";
const DANGER_LINE = "#fca5a5";

export default function ConnectedAccounts({ onToast, navigate, api = agentsApi }) {
  const [state, setState] = useState({ loading: true, failed: false, configured: false, connected: false, email: null });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api.googleStatus();
      setState({ loading: false, failed: false, configured: !!s?.configured, connected: !!s?.connected, email: s?.email || null });
    } catch {
      setState((prev) => ({ ...prev, loading: false, failed: true }));
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const disconnect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.googleDisconnect();
      setState((prev) => ({ ...prev, connected: false, email: null }));
      onToast?.("Gmail disconnected");
    } catch {
      onToast?.("Couldn't disconnect Gmail. Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  if (state.loading) {
    return <p style={{ fontFamily: SANS, fontSize: "0.9rem", color: MUTED }}>Checking your connections...</p>;
  }
  if (state.failed) {
    return (
      <p style={{ fontFamily: SANS, fontSize: "0.9rem", color: MUTED }}>
        Couldn't check your connections right now.{" "}
        <button type="button" onClick={() => { setState((p) => ({ ...p, loading: true })); load(); }}
          style={{ fontFamily: SANS, fontSize: "0.9rem", fontWeight: 700, color: INK, background: "none", border: "none",
            padding: 0, cursor: "pointer", textDecoration: "underline" }}>
          Try again
        </button>
      </p>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <p style={{ fontFamily: SANS, fontSize: "0.9375rem", fontWeight: 700, color: INK }}>Gmail</p>
        <p style={{ fontFamily: SANS, fontSize: "0.85rem", color: MUTED, marginTop: "0.25rem", lineHeight: 1.55, overflowWrap: "anywhere" }}>
          {state.connected
            ? `Connected as ${state.email}. Beaker can send only the emails you approve, and can never read your inbox.`
            : state.configured
              ? "Not connected. Beaker offers to connect it when you send your first email. You can always copy an email and send it yourself."
              : "Sending from Gmail is not available yet. You can copy any email Beaker drafts and send it yourself."}
        </p>
      </div>
      {state.connected ? (
        <button type="button" onClick={disconnect} disabled={busy}
          style={{ minHeight: 44, padding: "0.55rem 1.1rem", background: "transparent", border: `1.5px solid ${DANGER_LINE}`,
            borderRadius: "0.5rem", fontFamily: SANS, fontSize: "0.85rem", fontWeight: 600, color: DANGER,
            cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, whiteSpace: "nowrap" }}>
          {busy ? "Disconnecting..." : "Disconnect"}
        </button>
      ) : state.configured && navigate ? (
        <button type="button" onClick={() => navigate("/agents/outreach")}
          style={{ minHeight: 44, padding: "0.55rem 1.1rem", background: "transparent", border: "1.5px solid #e2e8f0",
            borderRadius: "0.5rem", fontFamily: SANS, fontSize: "0.85rem", fontWeight: 600, color: "#3d3d3a",
            cursor: "pointer", whiteSpace: "nowrap" }}>
          Open Beaker
        </button>
      ) : null}
    </div>
  );
}
