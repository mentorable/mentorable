import LandingPage from "./LandingPage.jsx";
import AuthPage from "./AuthPage.jsx";

export default function App() {
  const path = window.location.pathname;
  if (path === "/auth") return <AuthPage />;
  return <LandingPage />;
}
