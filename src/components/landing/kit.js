import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

// The landing page's shared layer: tokens, the small pure helpers every
// scripted screen derives its state from, and the hooks that drive playback.
// No JSX here; the frames live in frames.jsx.
//
// Every scripted screen is a pure function of (step, t). In sticky mode `t`
// is scroll progress inside the step; in time mode it comes from
// `useTimeline`. Nothing on the page starts moving on its own and keeps
// moving past SETTLE_MS unless the visitor is scrolling it or poked it.

// ─── Tokens ──────────────────────────────────────────────────────────────────

export const C = {
  page: "#faf8f4",        // page background (set on the landing root explicitly)
  ink: "#141413",         // headings, lead text
  mid: "#3d3d3a",         // body
  muted: "#494742",       // captions, two-tone continuations; the lightest text allowed
  faint: "#6a6760",       // icons and hairline glyphs only, never text
  line: "#e6dfd8",        // 1px warm borders
  surface: "#faf9f5",     // inset panels, sidebar
  stone: "#e6e3de",       // empty pixel markers
  accent: "#1d4ed8",      // links, primary button, markers
  accentDark: "#15389c",  // headline accent on photo b only
  soft: "#dfe6fa",        // tiles
  softer: "#eff3fc",      // flashes
  onBlue: "#ffffff",      // text on the blue band
  onBlueSoft: "#d2dcf7",  // the soft text on the blue band (4.9:1)
};

// Story plates, in page order (Record, Chat, College List, Quest).
export const TINT = {
  morning: "#eaf1f8",
  lateMorning: "#e1ecf8",
  afternoon: "#f6eee2",
  golden: "#f6e4d3",
};

// The only shadow in the landing chrome.
export const SHADOW = {
  device: "0 1px 2px rgba(20,20,19,.06), 0 24px 48px -24px rgba(20,20,19,.28)",
};

export const SANS = "'Raleway', sans-serif";

// Raleway only, 700 the heaviest. Sizes are the plan's; nothing under 0.9rem
// outside mockups.
export const TYPE = {
  h1: { fontFamily: SANS, fontSize: "clamp(2.5rem, 1.2rem + 3.6vw, 4rem)", fontWeight: 700, lineHeight: 1.02,
    letterSpacing: "-0.035em", textWrap: "balance", color: C.ink, margin: 0 },
  h2: { fontFamily: SANS, fontSize: "clamp(1.875rem, 1.2rem + 1.8vw, 2.5rem)", fontWeight: 700, lineHeight: 1.1,
    letterSpacing: "-0.025em", color: C.ink, margin: 0 },
  body: { fontFamily: SANS, fontSize: "1.125rem", fontWeight: 500, lineHeight: 1.6, color: C.mid, maxWidth: "40rem", margin: 0 },
  bodyMobile: { fontSize: "1.0625rem" },
  stepTitle: { fontFamily: SANS, fontSize: "1.125rem", fontWeight: 700, lineHeight: 1.35, color: C.ink, margin: 0 },
  stepDesc: { fontFamily: SANS, fontSize: "1rem", fontWeight: 500, lineHeight: 1.55, color: C.mid, margin: 0 },
  signpost: { fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: C.accent, margin: 0 },
  caption: { fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, lineHeight: 1.5, color: C.muted, margin: 0 },
};

export const EASE = [0.2, 0, 0, 1];
export const EASE_CSS = "cubic-bezier(.2,0,0,1)";

export const NAV_H = 64;
export const CONTAINER = 1312;
export const GUTTER = "clamp(16px, 4.4vw, 64px)";
export const TODAY = "2026-10-20";   // the frozen day every mockup lives on
export const SETTLE_MS = 5000;

export const STICKY_QUERY = "(min-width: 1100px) and (min-height: 740px)";
export const STAGE_QUERY = "(min-width: 1400px) and (min-height: 740px)";
export const MOBILE_MAX = 767;

// ─── Pure helpers ────────────────────────────────────────────────────────────

/** x clamped to [0, 1]. */
export function clamp01(x) {
  const n = Number(x);
  if (!(n > 0)) return 0;
  return n > 1 ? 1 : n;
}

/** Progress of t inside [a, b], clamped to [0, 1]. */
export function seg(t, a, b) {
  if (b <= a) return t >= b ? 1 : 0;
  return clamp01((t - a) / (b - a));
}

/** Smoothstep. */
export function smooth(x) {
  const v = clamp01(x);
  return v * v * (3 - 2 * v);
}

/** x rounded to the nearest 1/n. */
export function quantize(x, n = 100) {
  return Math.round(Number(x) * n) / n;
}

/** The prefix of `text` at fraction t, by code points. */
export function typed(text, t) {
  const cps = Array.from(String(text ?? ""));
  return cps.slice(0, Math.round(clamp01(t) * cps.length)).join("");
}

/**
 * blocks: string[]. The first `streamed` blocks reveal character by character
 * over t in [0, .5]; the rest land whole, evenly over (.5, 1].
 * Returns { shown: string[], streaming: boolean }.
 */
export function streamBlocks(blocks, t, { streamed = 2 } = {}) {
  const list = Array.isArray(blocks) ? blocks : [];
  const tt = clamp01(t);
  const s = Math.max(0, Math.min(streamed, list.length));
  const lengths = list.slice(0, s).map((b) => Array.from(String(b ?? "")).length);
  const total = lengths.reduce((a, b) => a + b, 0);
  let budget = Math.round(seg(tt, 0, 0.5) * total);
  const shown = [];
  for (let i = 0; i < s; i += 1) {
    if (budget >= lengths[i]) { shown.push(list[i]); budget -= lengths[i]; continue; }
    if (budget > 0) shown.push(Array.from(String(list[i] ?? "")).slice(0, budget).join(""));
    budget = 0;
    break;
  }
  const streaming = total > 0 && tt > 0 && tt < 0.5;
  const rest = list.length - s;
  if (tt > 0.5 && rest > 0 && shown.length === s) {
    for (let k = 1; k <= rest; k += 1) {
      const at = 0.5 + k * (0.5 / rest);
      if (tt + 1e-9 >= at) shown.push(list[s + k - 1]);
      else break;
    }
  }
  return { shown, streaming };
}

/** Client-side navigation, as the landing page has always done it. */
export function go(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function prefersReduce() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Scroll to an element by id, under the fixed nav (auto under reduced motion). */
export function scrollToId(id) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - NAV_H;
  window.scrollTo({ top: Math.max(0, top), behavior: prefersReduce() ? "auto" : "smooth" });
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/** True under prefers-reduced-motion (framer's hook). */
export function useReduce() {
  return !!useReducedMotion();
}

/** matchMedia as state, SSR-safe. */
export function useMedia(query) {
  const [on, setOn] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const read = () => setOn(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, [query]);
  return on;
}

/** True while (or, with `once`, once) `amount` of the element is in view.
 *  An element taller than the viewport counts as in view once `amount` of
 *  the viewport is covered by it. */
export function useInView(ref, { amount = 0.5, once = true } = {}) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const need = Math.min(amount, 0.999);
    const io = new IntersectionObserver(([entry]) => {
      const viewport = entry.rootBounds?.height || window.innerHeight || 1;
      const covered = entry.intersectionRect.height / viewport;
      const on = entry.isIntersecting && (entry.intersectionRatio >= need || covered >= need);
      if (on) {
        setInView(true);
        if (once) io.disconnect();
      } else if (!once) {
        setInView(false);
      }
    }, { threshold: Array.from({ length: 21 }, (_, i) => i / 20) });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, amount, once]);
  return inView;
}

/** True once the element is within one viewport of the screen; stays true. */
export function useNear(ref) {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === "undefined") { setNear(true); return undefined; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setNear(true); io.disconnect(); }
    }, { rootMargin: "100% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return near;
}

/**
 * A step timeline driven by requestAnimationFrame.
 * durations: ms per step. play: runs while true (default true). reduce: show
 * the last step at t = 1 at once (defaults to the visitor's setting).
 * -> { step, t, done, playing, pause(), resume(), replay(), jump(i) }.
 * t is quantised to .01. jump(i) under reduce shows step i at t = 1.
 */
export function useTimeline({ durations, play = true, reduce } = {}) {
  const systemReduce = useReduce();
  const cut = reduce === undefined ? systemReduce : !!reduce;
  const list = Array.isArray(durations) && durations.length ? durations : [1];
  const last = list.length - 1;
  const durRef = useRef(list);
  durRef.current = list;

  const [state, setState] = useState(() => (cut
    ? { step: last, t: 1, done: true, playing: false }
    : { step: 0, t: 0, done: false, playing: true }));
  // Where the clock is inside the current step, kept across pauses.
  const pos = useRef({ step: 0, elapsed: 0 });

  useEffect(() => {
    if (cut) {
      const l = durRef.current.length - 1;
      pos.current = { step: l, elapsed: durRef.current[l] };
      setState({ step: l, t: 1, done: true, playing: false });
    }
  }, [cut]);

  useEffect(() => {
    if (cut || !play || !state.playing || state.done) return undefined;
    let raf = 0;
    let lastNow = performance.now();
    const tick = (now) => {
      const d = durRef.current;
      const p = pos.current;
      p.elapsed += now - lastNow;
      lastNow = now;
      let step = p.step;
      while (step < d.length && p.elapsed >= d[step]) { p.elapsed -= d[step]; step += 1; }
      if (step >= d.length) {
        p.step = d.length - 1;
        p.elapsed = d[p.step];
        setState({ step: p.step, t: 1, done: true, playing: false });
        return;
      }
      p.step = step;
      const t = quantize(p.elapsed / d[step]);
      setState((prev) => (prev.step === step && prev.t === t ? prev : { ...prev, step, t }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cut, play, state.playing, state.done]);

  const pause = useCallback(() => setState((s) => (s.playing ? { ...s, playing: false } : s)), []);
  const resume = useCallback(() => setState((s) => (s.done || s.playing ? s : { ...s, playing: true })), []);
  const replay = useCallback(() => {
    if (cut) {
      const l = durRef.current.length - 1;
      pos.current = { step: l, elapsed: durRef.current[l] };
      setState({ step: l, t: 1, done: true, playing: false });
      return;
    }
    pos.current = { step: 0, elapsed: 0 };
    setState({ step: 0, t: 0, done: false, playing: true });
  }, [cut]);
  const jump = useCallback((i) => {
    const d = durRef.current;
    const step = Math.max(0, Math.min(d.length - 1, Math.floor(Number(i) || 0)));
    if (cut) {
      pos.current = { step, elapsed: d[step] };
      setState({ step, t: 1, done: step === d.length - 1, playing: false });
      return;
    }
    pos.current = { step, elapsed: 0 };
    setState({ step, t: 0, done: false, playing: true });
  }, [cut]);

  return { step: state.step, t: state.t, done: state.done, playing: state.playing, pause, resume, replay, jump };
}

/**
 * The 5-second rule. -> { settled, poke() }: false while the element is in
 * view for the first `ms` after entering view or after poke(); true off
 * screen and under reduced motion.
 */
export function useSettle(ref, { ms = SETTLE_MS } = {}) {
  const reduce = useReduce();
  const [inView, setInView] = useState(false);
  const [settled, setSettled] = useState(true);
  const timer = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.01 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (reduce || !inView) { setSettled(true); return undefined; }
    setSettled(false);
    timer.current = setTimeout(() => setSettled(true), ms);
    return () => clearTimeout(timer.current);
  }, [inView, reduce, ms]);

  const poke = useCallback(() => {
    if (reduce) return;
    clearTimeout(timer.current);
    setSettled(false);
    timer.current = setTimeout(() => setSettled(true), ms);
  }, [reduce, ms]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { settled, poke };
}

/** A page option from the query string, read once on mount. An unknown or
 *  missing value falls back. */
export function useOption(name, allowed, fallback) {
  const [value] = useState(() => {
    if (typeof window === "undefined") return fallback;
    try {
      const v = new URLSearchParams(window.location.search).get(name);
      return v !== null && (allowed || []).includes(v) ? v : fallback;
    } catch {
      return fallback;
    }
  });
  return value;
}
