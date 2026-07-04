import { useEffect, useState } from "react";
import { Routes, Route, useNavigate, useParams, useLocation } from "react-router-dom";
import { supabase } from "./lib/supabase.js";
import LandingPage from "./pages/LandingPage.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import OnboardingPage from "./pages/OnboardingPage.jsx";
import ScorecardPage from "./pages/ScorecardPage.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import ResearchPage from "./pages/ResearchPage.jsx";
import QuestPage from "./pages/QuestPage.jsx";
import RoadmapPage from "./pages/RoadmapPage.jsx";
import RoadmapNodePage from "./pages/RoadmapNodePage.jsx";
import Sidebar from "./components/common/Sidebar.jsx";
import MobileNav from "./components/common/MobileNav.jsx";
import ErrorBoundary from "./components/common/ErrorBoundary.jsx";
import { useIsMobile } from "./hooks/useIsMobile.js";

// Routes that show the persistent sidebar
const SIDEBAR_ROUTES = ["/scorecard", "/chat", "/profile", "/research", "/quest", "/roadmap"];

// Captured at module load, before the Supabase client strips the URL hash.
// After clicking the email-confirmation link the user lands here with auth
// tokens in the hash — that's our signal to forward them into the app.
const INITIAL_HASH = typeof window !== "undefined" ? window.location.hash : "";
const CAME_FROM_AUTH = /access_token|type=signup|type=recovery/.test(INITIAL_HASH);

// Decide where a freshly-authenticated user should land:
// onboarded → scorecard (the home/welcome); not yet → continue onboarding.
async function routeAfterAuth(userId, navigate) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", userId)
    .single();
  navigate(profile?.onboarding_completed ? "/scorecard" : "/onboarding", { replace: true });
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
  const location = useLocation();
  return <ChatPage navigate={navigate} seedNode={location.state?.seedNode || null} />;
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
  return <QuestPage navigate={navigate} />;
}

function RoadmapRoute() {
  const navigate = useNavigate();
  return <RoadmapPage navigate={navigate} />;
}

function RoadmapNodeRoute() {
  const navigate = useNavigate();
  const { nodeId } = useParams();
  return <RoadmapNodePage navigate={navigate} nodeId={nodeId} />;
}

// True if a Supabase session is stored — checked synchronously so we never flash
// the landing page to a logged-in user who's about to be redirected.
function hasStoredSession() {
  try {
    return Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
  } catch {
    return false;
  }
}

// Root "/" route: logged-out users see the landing page immediately; logged-in
// users see a neutral screen while AppShell redirects them (no landing flash).
// Falls back to the landing page if no redirect happens (e.g. stale token).
function RootRoute() {
  const [showLanding, setShowLanding] = useState(() => !hasStoredSession());
  useEffect(() => {
    if (showLanding) return;
    const t = setTimeout(() => setShowLanding(true), 1200);
    return () => clearTimeout(t);
  }, [showLanding]);
  if (!showLanding) return <div style={{ minHeight: "100vh", background: "#f5f1ed" }} />;
  return <LandingPage />;
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
        <Route path="/roadmap" element={<ErrorBoundary><RoadmapRoute /></ErrorBoundary>} />
        <Route path="/roadmap/node/:nodeId" element={<ErrorBoundary><RoadmapNodeRoute /></ErrorBoundary>} />
        <Route path="/" element={<RootRoute />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </AppShell>
  );
}
