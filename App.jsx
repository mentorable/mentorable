import LandingPage from "./LandingPage.jsx";
import AuthPage from "./AuthPage.jsx";
import OnboardingPage from "./OnboardingPage.jsx";
import ScorecardPage from "./ScorecardPage.jsx";
import RoadmapPage from "./RoadmapPage.jsx";

export default function App() {
  const path = window.location.pathname;
  if (path === "/auth") return <AuthPage />;
  if (path === "/onboarding") return <OnboardingPage />;
  if (path === "/scorecard") return <ScorecardPage />;
  if (path === "/roadmap") return <RoadmapPage />;
  return <LandingPage />;
}
