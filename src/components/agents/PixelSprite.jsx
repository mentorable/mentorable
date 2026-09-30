import { memo, useEffect, useMemo, useRef, useState } from "react";

// Draws a pixel sprite (see sprites/beaker.js for the format) as crisp SVG
// rects, one per horizontal run of a color, so a 32 by 32 frame is a couple
// of hundred rects rather than a thousand. Every frame is mounted once and
// only the visible one is shown, so a frame change touches two attributes.
//
// Frames advance only while the sprite is on screen, the tab is visible and
// the student has not asked for reduced motion (then it holds frame 0).
//
// `scale` is rounded down to a whole number (at least 1): a fractional one
// draws art pixels of uneven width on 1x and 1.25x screens.

// palette -> (rows -> runs). Frames are module constants, so this fills once.
const RUNS = new WeakMap();

function runsFor(rows, palette) {
  let byRows = RUNS.get(palette);
  if (!byRows) { byRows = new WeakMap(); RUNS.set(palette, byRows); }
  let runs = byRows.get(rows);
  if (runs) return runs;
  runs = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end += 1;
      const fill = palette[ch];
      if (fill) runs.push({ x, y, w: end - x, fill });
      x = end;
    }
  });
  byRows.set(rows, runs);
  return runs;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mql = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mql) return undefined;
    const onChange = (e) => setReduced(e.matches);
    setReduced(mql.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

function usePageVisible() {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

/** True while the element is at least partly in the viewport. */
function useOnScreen(ref) {
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return onScreen;
}

const Frame = memo(function Frame({ runs, shown }) {
  return (
    <g display={shown ? undefined : "none"}>
      {runs.map((r) => <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />)}
    </g>
  );
});

export default function PixelSprite({ sprite, state = "idle", scale = 4, title, flip = false, animate = true, style }) {
  const st = sprite.states[state] || sprite.states.idle || Object.values(sprite.states)[0];
  const order = useMemo(() => st.sequence || st.frames.map((_, i) => i), [st]);
  const frames = useMemo(() => st.frames.map((rows) => runsFor(rows, sprite.palette)), [st, sprite.palette]);

  const ref = useRef(null);
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  const onScreen = useOnScreen(ref);
  const [step, setStep] = useState(0);

  const still = !animate || reduced || order.length < 2;
  const running = !still && visible && onScreen;

  // A new state starts from its first frame.
  useEffect(() => { setStep(0); }, [st]);

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setStep((s) => (s + 1) % order.length), 1000 / (st.fps || 4));
    return () => clearInterval(id);
  }, [running, order, st]);

  const frame = still ? 0 : order[step % order.length];
  const w = sprite.width;
  const h = sprite.height;
  const px = Math.max(1, Math.floor(Number(scale) || 1));

  return (
    <svg ref={ref} width={w * px} height={h * px} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges"
      role={title ? "img" : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : true}
      focusable="false" style={{ display: "block", flexShrink: 0, overflow: "visible", ...style }}>
      {title && <title>{title}</title>}
      <g transform={flip ? `translate(${w} 0) scale(-1 1)` : undefined}>
        {frames.map((runs, i) => <Frame key={i} runs={runs} shown={i === frame} />)}
      </g>
    </svg>
  );
}
