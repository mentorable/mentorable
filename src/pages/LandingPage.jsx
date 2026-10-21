import { useEffect } from "react";
import { FixedTheme } from "../lib/ThemeContext.jsx";
import { lighten } from "../lib/theme.js";
import { C, SANS } from "../components/landing/kit.js";
import Nav from "../components/landing/Nav.jsx";
import HeroA from "../components/landing/hero/HeroA.jsx";
import Features from "../components/landing/features/Features.jsx";
import RestDay from "../components/landing/RestDay.jsx";
import AgentsBand from "../components/landing/agents/AgentsBand.jsx";
import Guardrails from "../components/landing/Guardrails.jsx";
import EverythingIndex from "../components/landing/EverythingIndex.jsx";
import Close from "../components/landing/Close.jsx";
import Footer from "../components/landing/Footer.jsx";

// The landing page: one sample student through Mentorable, every screen drawn
// from the app as it works today. This file only composes the sections;
// they live in src/components/landing/.
//
// The root is wrapped in FixedTheme and sets the accent variables itself, so
// a returning student's own accent never reaches the landing.

const ROOT_CSS = `
.lp-root { overflow-x: hidden; overflow-x: clip; }
.lp-root ::selection { background: rgba(29,78,216,0.22); }
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-lp-root]")) {
  const el = document.createElement("style");
  el.dataset.lpRoot = "";
  el.textContent = ROOT_CSS;
  document.head.appendChild(el);
}

export default function LandingPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <FixedTheme accent={C.accent}>
      <div className="lp-root ui-page" style={{ background: C.page, color: C.ink, fontFamily: SANS, minHeight: "100vh",
        "--accent": C.accent, "--accent-rgb": "29,78,216", "--accent-light": lighten(C.accent, 0.35), "--ag-ring": C.accent }}>
        <Nav />
        <main>
          <HeroA />
          <Features />
          <RestDay />
          <AgentsBand />
          <Guardrails />
          <EverythingIndex />
          <Close />
        </main>
        <Footer />
      </div>
    </FixedTheme>
  );
}
