import LandingPage from "./LandingPage.jsx";
import AuthPage from "./AuthPage.jsx";
import OnboardingPage from "./OnboardingPage.jsx";

export default function App() {
  const path = window.location.pathname;
  if (path === "/auth") return <AuthPage />;
  if (path === "/onboarding") return <OnboardingPage />;
  if (path === "/scorecard") return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", fontFamily: "system-ui", color: "#64748b" }}>Scorecard coming soon</div>;
  return <LandingPage />;
}
