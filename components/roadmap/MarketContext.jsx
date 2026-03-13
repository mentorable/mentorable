import { motion } from "framer-motion";

function fmt(n) {
  if (!n) return "—";
  if (n >= 1_000_000) return `~${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `~${Math.round(n / 1_000)}K`;
  return n.toLocaleString();
}

export default function MarketContext({ marketContext }) {
  if (!marketContext) return null;
  const { openRolesNational, medianEntryWage, topHiringCompanies, keyInsight } = marketContext;

  const stats = [
    {
      icon: "📊",
      label: "Open Roles",
      value: fmt(openRolesNational),
      sub: "nationally",
    },
    {
      icon: "💰",
      label: "Median Pay",
      value: medianEntryWage ? `$${fmt(medianEntryWage)}` : "—",
      sub: "entry level",
    },
    {
      icon: "🏢",
      label: "Top Companies",
      value: topHiringCompanies?.slice(0, 3).join(" · ") ?? "—",
      sub: topHiringCompanies?.slice(3).join(" · ") || null,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45 }}
    >
      <div style={{
        fontSize: "0.7rem", fontWeight: 700, color: "rgba(255,255,255,0.38)",
        textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.9rem",
      }}>
        Market Context
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: "0.85rem",
        marginBottom: "0.85rem",
      }}>
        {stats.map((stat, i) => (
          <div key={i} style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12, padding: "1.1rem 1.15rem",
          }}>
            <div style={{ fontSize: "1.2rem", marginBottom: "0.4rem" }}>{stat.icon}</div>
            <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.38)", fontWeight: 600, marginBottom: "0.3rem" }}>
              {stat.label}
            </div>
            <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "white", marginBottom: "0.2rem" }}>
              {stat.value}
            </div>
            {stat.sub && (
              <div style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.35)" }}>{stat.sub}</div>
            )}
          </div>
        ))}
      </div>

      {keyInsight && (
        <div style={{
          padding: "0.9rem 1.1rem",
          background: "rgba(99,102,241,0.1)",
          border: "1px solid rgba(99,102,241,0.22)",
          borderRadius: 12,
        }}>
          <span style={{ fontSize: "0.865rem", color: "rgba(255,255,255,0.68)", lineHeight: 1.6 }}>
            💡 {keyInsight}
          </span>
        </div>
      )}
    </motion.div>
  );
}
