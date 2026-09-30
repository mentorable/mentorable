import { RADIUS, WHITE, BORDER } from "../agentUi.js";
import { COLUMN_BG, COLUMN_GAP, COLUMN_MIN, SKEL_CLASS } from "./BoardUi.js";

// The board's shape while the cards load: six wells on desktop, the tab
// strip and a few cards on a phone. Decorative; the page says "Loading" to
// screen readers. The shimmer stops under reduced motion (BoardUi's CSS).

function Bar({ w, h = 14, style }) {
  return <div className={SKEL_CLASS} style={{ width: w, height: h, borderRadius: 7, ...style }} />;
}

function CardShape({ lines = 2 }) {
  return (
    <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.control, padding: 12 }}>
      <Bar w="70%" h={16} />
      {lines > 1 && <Bar w="50%" style={{ marginTop: 9 }} />}
      <Bar w="40%" style={{ marginTop: 9 }} />
      <Bar w={72} h={26} style={{ marginTop: 14, borderRadius: 999 }} />
    </div>
  );
}

export default function BoardSkeleton({ mobile = false }) {
  if (mobile) {
    return (
      <div aria-hidden="true">
        <div style={{ display: "flex", gap: 8, overflow: "hidden", padding: "4px 0 10px" }}>
          {[112, 96, 78, 110].map((w, i) => <Bar key={i} w={w} h={44} style={{ flexShrink: 0, borderRadius: 999 }} />)}
        </div>
        <Bar w="75%" style={{ margin: "4px 0 16px" }} />
        <div style={{ display: "grid", gap: 10 }}>
          <CardShape /><CardShape lines={1} /><CardShape />
        </div>
      </div>
    );
  }
  return (
    <div aria-hidden="true" style={{ overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(6, minmax(${COLUMN_MIN}px, 1fr))`, gap: COLUMN_GAP }}>
        {[2, 1, 2, 0, 1, 0].map((n, i) => (
          <div key={i} style={{ background: COLUMN_BG, borderRadius: RADIUS.card, padding: 12, minHeight: 260,
            display: "grid", alignContent: "start", gap: 8 }}>
            <Bar w="55%" h={16} />
            <Bar w="85%" style={{ marginBottom: 8 }} />
            {Array.from({ length: n }, (_, k) => <CardShape key={k} lines={k % 2 ? 1 : 2} />)}
          </div>
        ))}
      </div>
    </div>
  );
}
