import { useCallback, useEffect, useState } from "react";
import { agentsApi } from "../../lib/agentsApi.js";
import { FOCUS_CLASS, SANS, TEXT, TEXT_MUTED } from "../ui/tokens.js";
import { Button, LINK_CLASS } from "../ui/kit.jsx";

// "Connected accounts" on Profile: the Gmail send permission Beaker (the
// outreach agent) uses. Connecting happens in Beaker's flow, where the reason is
// obvious; this is where a student can see it and take it back.

const LINE_STYLE = { fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.55, margin: 0 };

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
    return <p role="status" style={LINE_STYLE}>Checking your connections...</p>;
  }
  if (state.failed) {
    return (
      <p style={LINE_STYLE}>
        Couldn't check your connections right now.{" "}
        <button type="button" className={`${FOCUS_CLASS} ${LINK_CLASS}`}
          onClick={() => { setState((p) => ({ ...p, loading: true })); load(); }}
          style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: TEXT, background: "none", border: "none",
            padding: "4px 2px", borderRadius: 6, cursor: "pointer" }}>
          Try again
        </button>
      </p>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem 1rem", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <p style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 700, color: TEXT, margin: 0 }}>Gmail</p>
        <p style={{ ...LINE_STYLE, marginTop: "0.25rem", overflowWrap: "anywhere" }}>
          {state.connected
            ? `Connected as ${state.email}. Beaker can send only the emails you approve, and can never read your inbox.`
            : state.configured
              ? "Not connected. Beaker offers to connect it when you send your first email. You can always copy an email and send it yourself."
              : "Sending from Gmail is not available yet. You can copy any email Beaker drafts and send it yourself."}
        </p>
      </div>
      {state.connected ? (
        <Button kind="danger" onClick={disconnect} disabled={busy} style={{ whiteSpace: "nowrap" }}>
          {busy ? "Disconnecting..." : "Disconnect"}
        </Button>
      ) : state.configured && navigate ? (
        <Button onClick={() => navigate("/agents/outreach")} style={{ whiteSpace: "nowrap" }}>
          Open Beaker
        </Button>
      ) : null}
    </div>
  );
}
