import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { questApi } from "./quest.js";

// The streak and level shown in the nav on every page. Held here rather than
// fetched by each nav component so the Quest page can update it the moment a
// check-in lands, without a second request.
const QuestContext = createContext({ summary: null, refresh: () => {}, setSummary: () => {} });

export function QuestProvider({ enabled, children }) {
  const [summary, setSummary] = useState(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      setSummary(await questApi.summary());
    } catch {
      // Keep whatever we last had; the chip is a convenience, not a gate.
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) { setSummary(null); return; }
    refresh();
  }, [enabled, refresh]);

  // A tab left open overnight should not show yesterday's flame.
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, refresh]);

  const value = useMemo(() => ({ summary, refresh, setSummary }), [summary, refresh]);
  return <QuestContext.Provider value={value}>{children}</QuestContext.Provider>;
}

export function useQuest() {
  return useContext(QuestContext);
}
