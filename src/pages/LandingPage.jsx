import { useEffect } from "react";
import { FixedTheme } from "../lib/ThemeContext.jsx";
import { lighten } from "../lib/theme.js";
import { C, SANS, useOption } from "../components/landing/kit.js";
import Nav from "../components/landing/Nav.jsx";
import HeroA from "../components/landing/hero/HeroA.jsx";
import HeroB from "../components/landing/hero/HeroB.jsx";
import HeroC from "../components/landing/hero/HeroC.jsx";
import Features from "../components/landing/features/Features.jsx";
import RestDay from "../components/landing/RestDay.jsx";
import AgentsBand from "../components/landing/agents/AgentsBand.jsx";
import Guardrails from "../components/landing/Guardrails.jsx";
import EverythingIndex from "../components/landing/EverythingIndex.jsx";
import Close from "../components/landing/Close.jsx";
import Footer from "../components/landing/Footer.jsx";
import OptionsBar from "../components/landing/OptionsBar.jsx";

// The landing page: one sample student through Mentorable, every screen drawn
// from the app as it works today. This file only composes the sections and
// reads the owner's option switches (?hero= ?features= ?close= ?compare=1);
// the sections live in src/components/landing/.
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
  const hero = useOption("hero", ["a", "b", "c"], "a");
  const features = useOption("features", ["a", "b", "c"], "a");
  const close = useOption("close", ["a", "b"], "a");
  const compare = useOption("compare", ["1"], null);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <FixedTheme accent={C.accent}>
      <div className="lp-root ui-page" style={{ background: C.page, color: C.ink, fontFamily: SANS, minHeight: "100vh",
        "--accent": C.accent, "--accent-rgb": "29,78,216", "--accent-light": lighten(C.accent, 0.35), "--ag-ring": C.accent }}>
        <Nav hero={hero} />
        <main>
          {hero === "b" ? <HeroB /> : hero === "c" ? <HeroC /> : <HeroA />}
          <Features option={features} hero={hero} />
          <RestDay />
          <AgentsBand />
          <Guardrails />
          <EverythingIndex />
          <Close option={close} />
        </main>
        <Footer />
        {compare && <OptionsBar hero={hero} features={features} close={close} />}
      </div>
    </FixedTheme>
  );
}
