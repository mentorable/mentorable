import { useEffect } from "react";
import { Routes, Route, useNavigate, useParams, useLocation, Navigate } from "react-router-dom";
import { supabase } from "./lib/supabase.js";
import LandingPage from "./pages/LandingPage.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import OnboardingPage from "./pages/OnboardingPage.jsx";
import ScorecardPage from "./pages/ScorecardPage.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import ResearchPage from "./pages/ResearchPage.jsx";
import RoadmapPage from "./pages/RoadmapPage.jsx";
import ContextPage from "./pages/ContextPage.jsx";
import Sidebar from "./components/common/Sidebar.jsx";
import MobileNav from "./components/common/MobileNav.jsx";
import ErrorBoundary from "./components/common/ErrorBoundary.jsx";
import { useIsMobile } from "./hooks/useIsMobile.js";

// Routes that show the persistent sidebar
const SIDEBAR_ROUTES = ["/scorecard", "/chat", "/profile", "/research", "/quest", "/context"];

// Captured at module load, before the Supabase client strips the URL hash.
// After clicking the email-confirmation link the user lands here with auth
// tokens in the hash — that's our signal to forward them into the app.
const INITIAL_HASH = typeof window !== "undefined" ? window.location.hash : "";
const CAME_FROM_AUTH = /access_token|type=signup|type=recovery/.test(INITIAL_HASH);

// Decide where a freshly-authenticated user should land:
// onboarded → quest board; not yet → continue onboarding.
async function routeAfterAuth(userId, navigate) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", userId)
    .single();
  navigate(profile?.onboarding_completed ? "/quest" : "/onboarding", { replace: true });
}

function AppShell({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // Post-auth routing — handles the email-confirmation redirect (which lands on
  // "/") and any sign-in that happens while the app is open. Only acts from the
  // entry points so it never hijacks a logged-in user browsing the landing page.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return;
      const path = window.location.pathname;
      if (CAME_FROM_AUTH || path === "/auth") routeAfterAuth(session.user.id, navigate);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" || !session?.user) return;
      const path = window.location.pathname;
      if (path === "/" || path === "/auth") routeAfterAuth(session.user.id, navigate);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

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

function QuestRoute() {
  const navigate = useNavigate();
  return <RoadmapPage navigate={navigate} />;
}

function ContextRoute() {
  const navigate = useNavigate();
  return <ContextPage navigate={navigate} />;
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
        <Route path="/quest" element={<ErrorBoundary><QuestRoute /></ErrorBoundary>} />
        <Route path="/context" element={<ContextRoute />} />
        <Route path="/roadmap" element={<Navigate to="/quest" replace />} />
        <Route path="/roadmap/*" element={<Navigate to="/quest" replace />} />
        <Route path="/roadmap-preview" element={<Navigate to="/quest" replace />} />
        <Route path="/" element={<LandingPage />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </AppShell>
  );
}
