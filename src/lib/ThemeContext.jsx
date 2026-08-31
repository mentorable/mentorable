import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";
import { DEFAULT_ACCENT, hexToRgbString, lighten } from "./theme.js";

const ThemeContext = createContext(null);

function readStoredAccent() {
  try {
    return localStorage.getItem("profileColor") || DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

// App-wide accent color, sourced from the user's `profile_color`. Applies to
// every post-login page (Sidebar/MobileNav + page chrome); the landing and
// auth pages never read this context, so they stay on the fixed brand blue.
export function ThemeProvider({ children }) {
  const [accent, setAccent] = useState(readStoredAccent);

  // Expose the accent as CSS custom properties too, for decorative CSS
  // (pseudo-elements, static keyframe stylesheets) that can't take JS props.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--accent", accent);
    root.setProperty("--accent-light", lighten(accent, 0.35));
    root.setProperty("--accent-rgb", hexToRgbString(accent));
  }, [accent]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data: p } = await supabase.from("profiles").select("profile_color").eq("id", user.id).single();
        if (!cancelled && p?.profile_color) {
          setAccent(p.profile_color);
          localStorage.setItem("profileColor", p.profile_color);
        }
      } catch {
        // No session, or the column isn't there yet — keep the local/default value.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const value = useMemo(() => ({
    accent,
    accentLight: lighten(accent, 0.35),
    accentRgb: hexToRgbString(accent),
    setAccent,
  }), [accent]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

const FALLBACK = {
  accent: DEFAULT_ACCENT,
  accentLight: lighten(DEFAULT_ACCENT, 0.35),
  accentRgb: hexToRgbString(DEFAULT_ACCENT),
  setAccent: () => {},
};

export function useTheme() {
  return useContext(ThemeContext) || FALLBACK;
}
