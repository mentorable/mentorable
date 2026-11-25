// Small line icons, drawn in `currentColor` so they take the color of the
// text or nav item around them. The same family as the Sidebar's icons: a
// 24-unit box, rounded 1.9 strokes, no fills except a soft tint (`soft`) on
// the record icons, which read as small documents. Paths follow Lucide's
// shapes (ISC licence) where it has one.

const s = (d) => <path d={d} />;
const soft = (el) => <g fill="currentColor" fillOpacity={0.14} stroke="none">{el}</g>;

const GLYPHS = {
  letter: <>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    {s("M3.5 7.5 12 13l8.5-5.5")}
  </>,
  check: s("M20 6 9 17l-5-5"),
  clock: <>
    <circle cx="12" cy="12" r="9" />
    {s("M12 7v5l3.2 2")}
  </>,
  star: s("M12 3.2l2.7 5.5 6 .9-4.35 4.25 1.03 6-5.38-2.83-5.38 2.83 1.03-6L3.3 9.6l6-.9z"),
  sparkle: <>
    {s("M11 3.5c.7 4.6 2.4 6.3 7 7-4.6.7-6.3 2.4-7 7-.7-4.6-2.4-6.3-7-7 4.6-.7 6.3-2.4 7-7z")}
    {s("M19 15.5c.3 1.7.8 2.2 2.5 2.5-1.7.3-2.2.8-2.5 2.5-.3-1.7-.8-2.2-2.5-2.5 1.7-.3 2.2-.8 2.5-2.5z")}
  </>,
  peak: <>
    {s("M2.5 20 9 8.5l3.6 6.2")}
    {s("M10.5 20l5-8.5 6 8.5z")}
    {s("M2.5 20h19")}
  </>,
  target: <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
  </>,
  flag: <>
    {s("M5 21V4")}
    {s("M5 4.5h12.5l-2.5 4 2.5 4H5")}
  </>,
  scroll: <>
    {s("M19 17V5a2 2 0 0 0-2-2H5.5")}
    {s("M8 21h11.5a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v1.5a1 1 0 0 0 1 1h3")}
    {s("M10.5 8h5M10.5 12h5")}
  </>,
  chat: <>
    {s("M21 14.5a2 2 0 0 1-2 2H8l-4.5 4V5a2 2 0 0 1 2-2H19a2 2 0 0 1 2 2z")}
    {s("M8 8.5h8M8 12h5")}
  </>,
  person: <>
    <circle cx="12" cy="8" r="4" />
    {s("M4.5 20.5a7.5 7.5 0 0 1 15 0")}
  </>,
  lock: <>
    <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
    {s("M8 10.5V7a4 4 0 0 1 8 0v3.5")}
    {s("M12 14.5v2.5")}
  </>,
  question: <>
    <circle cx="12" cy="12" r="9" />
    {s("M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.6-2.7 2.6")}
    {s("M12 16.8h.01")}
  </>,
  // Kinds of work (the Quest stones' pictures).
  code: s("M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"),
  search: <>
    <circle cx="10.5" cy="10.5" r="6.5" />
    {s("M15.5 15.5 20.5 20.5")}
  </>,
  book: <>
    {s("M12 6.5C10.3 5 7.8 4.3 3.5 4.5v14c4.3-.2 6.8.5 8.5 2 1.7-1.5 4.2-2.2 8.5-2v-14c-4.3-.2-6.8.5-8.5 2z")}
    {s("M12 6.5v14")}
  </>,
  pencil: <>
    {s("M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4.5 1.5L5 15z")}
    {s("M14.5 5.5l3 3")}
  </>,
  flask: <>
    {s("M9.5 3.5h5M10 3.5v6L4.6 18.4A1.4 1.4 0 0 0 5.8 20.5h12.4a1.4 1.4 0 0 0 1.2-2.1L14 9.5v-6")}
    {s("M7.2 15h9.6")}
  </>,
  chart: s("M4 4v16h16M8.5 16v-4M12.5 16V8M16.5 16v-6"),
  list: <>
    {s("M10 6.5h10M10 12h10M10 17.5h10")}
    {s("M3.8 6.5l1.2 1.2 2.2-2.4M3.8 12l1.2 1.2 2.2-2.4")}
    <circle cx="5.3" cy="17.5" r="1.3" />
  </>,
  hammer: <>
    {s("M13.5 10.5 5 19a1.8 1.8 0 0 1-2.5-2.5L11 8")}
    {s("M10 6.5 13.5 3l7.5 7.5-3.5 3.5z")}
  </>,
  upcoming: <circle cx="12" cy="12" r="3" />,
  // The record icons (Portfolio's sections and the like): small documents
  // with a soft tint so they read a little heavier than the marks above.
  reportcard: <>
    {soft(<rect x="4" y="3" width="16" height="18" rx="2.5" />)}
    <rect x="4" y="3" width="16" height="18" rx="2.5" />
    {s("M8 13l2-5.5 2 5.5M8.7 11.2h2.6")}
    {s("M15.5 8.5v3.5M13.75 10.25h3.5")}
    {s("M8 16.8h8")}
  </>,
  answersheet: <>
    {soft(<rect x="4" y="3" width="16" height="18" rx="2.5" />)}
    <rect x="4" y="3" width="16" height="18" rx="2.5" />
    <circle cx="9" cy="8" r="1.3" fill="currentColor" />
    <circle cx="15" cy="8" r="1.3" />
    <circle cx="9" cy="12.5" r="1.3" />
    <circle cx="15" cy="12.5" r="1.3" fill="currentColor" />
    <circle cx="9" cy="17" r="1.3" fill="currentColor" />
    <circle cx="15" cy="17" r="1.3" />
  </>,
  notebook: <>
    {soft(<rect x="5.5" y="3" width="14" height="18" rx="2.5" />)}
    <rect x="5.5" y="3" width="14" height="18" rx="2.5" />
    {s("M3 7.5h4.5M3 12h4.5M3 16.5h4.5")}
    {s("M10.5 8h5.5M10.5 12h5.5M10.5 16h3")}
  </>,
  rocket: <>
    {soft(s("M12 15.5 8.5 12a22 22 0 0 1 2-4A12.9 12.9 0 0 1 21.5 2.5c0 2.7-.8 7.4-6 11a22 22 0 0 1-3.5 2z"))}
    {s("M4.6 16.6c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z")}
    {s("M12 15.5 8.5 12a22 22 0 0 1 2-4A12.9 12.9 0 0 1 21.5 2.5c0 2.7-.8 7.4-6 11a22 22 0 0 1-3.5 2z")}
    {s("M8.5 12H4s.6-3 2-4c1.6-1.1 5 0 5 0")}
    {s("M12 15.5V20s3-.6 4-2c1.1-1.6 0-5 0-5")}
  </>,
  trophy: <>
    {soft(s("M7 3.5h10V10a5 5 0 0 1-10 0z"))}
    {s("M7 3.5h10V10a5 5 0 0 1-10 0z")}
    {s("M7 5.5H4.5a1 1 0 0 0-1 1V8a3.5 3.5 0 0 0 3.6 3.5M17 5.5h2.5a1 1 0 0 1 1 1V8a3.5 3.5 0 0 1-3.6 3.5")}
    {s("M12 15v3M8 21h8M9.5 18h5v3h-5z")}
  </>,
  resume: <>
    {soft(s("M14.5 3H6.5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"))}
    {s("M14.5 3H6.5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z")}
    {s("M14.5 3v5h5")}
    <circle cx="9.5" cy="10" r="2" />
    {s("M8 14.5h8M8 17.5h5")}
  </>,
};

function Svg({ size, title, style, strokeWidth = 1.9, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" focusable="false"
      role={title ? "img" : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : true}
      style={{ display: "block", flexShrink: 0, ...style }}>
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

/** kind: "letter" | "check" | "clock" | "star" | "sparkle" | "question" |
 *  "peak" | "target" | "flag" | "scroll" | "chat" | "person" | "lock", and the
 *  record icons "reportcard" | "answersheet" | "notebook" | "rocket" |
 *  "trophy" | "resume". Decorative unless given a `title`. */
export function Glyph({ kind, size = 16, title, style }) {
  // Small icons get a slightly heavier line so they hold up at 16px.
  return (
    <Svg size={size} title={title} style={style} strokeWidth={size <= 16 ? 2.2 : 1.9}>
      {GLYPHS[kind] || GLYPHS.sparkle}
    </Svg>
  );
}

/** An arrow pointing right, for "Open" and "Continue" buttons. */
export function ArrowGlyph({ size = 16, style }) {
  return <Svg size={size} style={style} strokeWidth={2.2}>{s("M5 12h14M13 6l6 6-6 6")}</Svg>;
}
