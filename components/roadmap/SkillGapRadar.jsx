import { useMemo } from "react";

const SIZE   = 260;
const CX     = SIZE / 2;
const CY     = SIZE / 2;
const MAX_R  = 98;
const LEVELS = 4;
const PAD    = 44; // extra viewBox padding for labels

function polar(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function toSvgPath(points) {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ") + "Z";
}

function buildPath(values, cx, cy, maxR) {
  const n = values.length;
  return toSvgPath(values.map((v, i) => {
    const { x, y } = polar(cx, cy, (Math.min(v, 100) / 100) * maxR, (360 / n) * i);
    return { x, y };
  }));
}

export default function SkillGapRadar({ radarAxes = [], gapSkills = [], currentSkills = [], strengthsToLeverage = [] }) {
  const axes = radarAxes.slice(0, 6);
  const n = axes.length;

  const { requiredScores, currentScores } = useMemo(() => {
    const required = axes.map(axis => {
      const match = gapSkills.find(g =>
        g.skill?.toLowerCase().includes(axis.toLowerCase()) ||
        axis.toLowerCase().includes((g.skill ?? "").toLowerCase())
      );
      return match ? Math.min(match.onetImportance ?? 70, 100) : 68;
    });

    const current = axes.map((axis, i) => {
      const isStrength =
        currentSkills.some(s => s.toLowerCase().includes(axis.toLowerCase()) || axis.toLowerCase().includes(s.toLowerCase())) ||
        strengthsToLeverage.some(s => s.toLowerCase().includes(axis.toLowerCase()) || axis.toLowerCase().includes(s.toLowerCase()));
      const isGap = gapSkills.some(g =>
        g.skill?.toLowerCase().includes(axis.toLowerCase()) ||
        axis.toLowerCase().includes((g.skill ?? "").toLowerCase())
      );
      if (isStrength) return Math.round(required[i] * 0.72);
      if (isGap)      return Math.round(required[i] * 0.28);
      return Math.round(required[i] * 0.50);
    });

    return { requiredScores: required, currentScores: current };
  }, [axes, gapSkills, currentSkills, strengthsToLeverage]);

  const requiredPath = buildPath(requiredScores, CX, CY, MAX_R);
  const currentPath  = buildPath(currentScores,  CX, CY, MAX_R);

  const gridPaths = useMemo(() =>
    Array.from({ length: LEVELS }, (_, i) =>
      buildPath(Array(n).fill(((i + 1) / LEVELS) * 100), CX, CY, MAX_R)
    ), [n]);

  const axisLines = axes.map((label, i) => {
    const angle = (360 / n) * i;
    const outer = polar(CX, CY, MAX_R, angle);
    const lpt   = polar(CX, CY, MAX_R + 26, angle);
    return { label, outer, lpt };
  });

  if (n < 3) return null;

  const vb = `-${PAD} -${PAD} ${SIZE + PAD * 2} ${SIZE + PAD * 2}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.25rem" }}>
      <svg width={SIZE + PAD * 1.5} height={SIZE + PAD * 1.5} viewBox={vb} overflow="visible">
        {/* Grid rings */}
        {gridPaths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
        ))}

        {/* Axis spokes */}
        {axisLines.map(({ outer }, i) => (
          <line key={i} x1={CX} y1={CY} x2={outer.x} y2={outer.y}
            stroke="rgba(255,255,255,0.09)" strokeWidth={1} />
        ))}

        {/* Required polygon — gold */}
        <path d={requiredPath} fill="rgba(251,191,36,0.13)" stroke="#fbbf24" strokeWidth={2} />

        {/* Current polygon — indigo */}
        <path d={currentPath} fill="rgba(99,102,241,0.22)" stroke="#818cf8" strokeWidth={2} />

        {/* Data points */}
        {currentScores.map((v, i) => {
          const { x, y } = polar(CX, CY, (v / 100) * MAX_R, (360 / n) * i);
          return <circle key={i} cx={x} cy={y} r={3.5} fill="#818cf8" />;
        })}
        {requiredScores.map((v, i) => {
          const { x, y } = polar(CX, CY, (v / 100) * MAX_R, (360 / n) * i);
          return <circle key={i} cx={x} cy={y} r={3} fill="#fbbf24" />;
        })}

        {/* Axis labels */}
        {axisLines.map(({ label, lpt }, i) => (
          <text key={i} x={lpt.x} y={lpt.y}
            textAnchor="middle" dominantBaseline="middle"
            fill="rgba(255,255,255,0.65)" fontSize="10.5"
            fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
            fontWeight="600"
          >
            {label}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", gap: "1.75rem" }}>
        {[
          { color: "#818cf8", label: "You today" },
          { color: "#fbbf24", label: "Career requires" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
            <div style={{ width: 18, height: 3, background: color, borderRadius: 2 }} />
            <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.55)" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
