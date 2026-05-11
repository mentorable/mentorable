import { Routes, Route, useNavigate, useParams, useLocation, Navigate } from "react-router-dom";
import LandingPage from "./LandingPage.jsx";
import AuthPage from "./AuthPage.jsx";
import OnboardingPage from "./OnboardingPage.jsx";
import ScorecardPage from "./ScorecardPage.jsx";
import CanvasPage from "./CanvasPage.jsx";
import ChatPage from "./ChatPage.jsx";
import ProfilePage from "./ProfilePage.jsx";
import ResearchPage from "./ResearchPage.jsx";
import Sidebar from "./components/common/Sidebar.jsx";
import MobileNav from "./components/common/MobileNav.jsx";
import ErrorBoundary from "./components/common/ErrorBoundary.jsx";
import { useIsMobile } from "./hooks/useIsMobile.js";

// Routes that show the persistent sidebar
const SIDEBAR_ROUTES = ["/scorecard", "/chat", "/profile", "/research", "/our-mind", "/canvas"];

function AppShell({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const showSidebar = SIDEBAR_ROUTES.some(
    (p) => location.pathname === p || location.pathname.startsWith(p + "/")
  );

  return (
    <>
      {showSidebar && !isMobile && (
        <Sidebar activePath={location.pathname} navigate={navigate} />
      )}
      {children}
      {showSidebar && isMobile && (
        <MobileNav activePath={location.pathname} navigate={navigate} />
      )}
    </>
  );
}

// ─── Route wrappers ───────────────────────────────────────────────────────────

function ChatRoute() {
  const navigate = useNavigate();
  return <ChatPage navigate={navigate} />;
}

function ScorecardRoute() {
  const navigate = useNavigate();
  return <ScorecardPage navigate={navigate} />;
}

function ProfileRoute() {
  const navigate = useNavigate();
  return <ProfilePage navigate={navigate} />;
}

function ResearchRoute() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  return <ResearchPage navigate={navigate} initialSessionId={sessionId || null} />;
}

function OurMindRoute() {
  return <CanvasPage />;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/onboarding" element={<ErrorBoundary><OnboardingPage /></ErrorBoundary>} />
        <Route path="/scorecard" element={<ScorecardRoute />} />
        <Route path="/chat" element={<ErrorBoundary><ChatRoute /></ErrorBoundary>} />
        <Route path="/profile" element={<ProfileRoute />} />
        <Route path="/research/:sessionId" element={<ResearchRoute />} />
        <Route path="/research" element={<ResearchRoute />} />
        <Route path="/our-mind" element={<ErrorBoundary><OurMindRoute /></ErrorBoundary>} />
        <Route path="/canvas" element={<Navigate to="/our-mind" replace />} />
        <Route path="/roadmap" element={<Navigate to="/our-mind" replace />} />
        <Route path="/roadmap/*" element={<Navigate to="/our-mind" replace />} />
        <Route path="/roadmap-preview" element={<Navigate to="/our-mind" replace />} />
        <Route path="/" element={<LandingPage />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </AppShell>
  );
}
