import { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useParams, useLocation } from "react-router-dom";
import LandingPage from "./LandingPage.jsx";
import AuthPage from "./AuthPage.jsx";
import OnboardingPage from "./OnboardingPage.jsx";
import ScorecardPage from "./ScorecardPage.jsx";
import RoadmapPage from "./RoadmapPage.jsx";
import PreRoadmapPage from "./PreRoadmapPage.jsx";
import TaskDetailPage from "./components/task/TaskDetailPage.jsx";
import RoadmapPreviewPage from "./components/roadmap-preview/RoadmapPreviewPage.jsx";
import ChatPage from "./ChatPage.jsx";
import ProfilePage from "./ProfilePage.jsx";
import ResearchPage from "./ResearchPage.jsx";
import Sidebar, { SIDEBAR_WIDTH } from "./components/common/Sidebar.jsx";
import MobileNav from "./components/common/MobileNav.jsx";
import ErrorBoundary from "./components/common/ErrorBoundary.jsx";
import { useIsMobile } from "./hooks/useIsMobile.js";
import { supabase } from "./lib/supabase.js";

// Routes that show the persistent sidebar
const SIDEBAR_ROUTES = ["/scorecard", "/chat", "/profile", "/research", "/roadmap"];

function AppShell({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [roadmapMode, setRoadmapMode] = useState(
    localStorage.getItem("roadmapMode") || "discovery"
  );

  const showSidebar = SIDEBAR_ROUTES.some(
    (p) => location.pathname === p || location.pathname.startsWith(p + "/")
  );
  const isRoadmap = location.pathname === "/roadmap" || location.pathname.startsWith("/roadmap/");

  // Keep mode label in sync when RoadmapPage sets it
  useEffect(() => {
    const handler = (e) => setRoadmapMode(e.detail || localStorage.getItem("roadmapMode") || "discovery");
    window.addEventListener("roadmap:modeChanged", handler);
    return () => window.removeEventListener("roadmap:modeChanged", handler);
  }, []);

  // Re-read localStorage when navigating back to a roadmap route
  useEffect(() => {
    if (isRoadmap) {
      setRoadmapMode(localStorage.getItem("roadmapMode") || "discovery");
    }
  }, [isRoadmap]);

  const handleModeClick = isRoadmap
    ? () => window.dispatchEvent(new CustomEvent("roadmap:openModeModal"))
    : null;

  return (
    <>
      {showSidebar && !isMobile && (
        <Sidebar
          activePath={location.pathname}
          navigate={navigate}
          onModeClick={handleModeClick}
          roadmapMode={roadmapMode}
        />
      )}
      {children}
      {showSidebar && isMobile && (
        <MobileNav activePath={location.pathname} navigate={navigate} />
      )}
    </>
  );
}

// ─── Route wrappers ───────────────────────────────────────────────────────────

function TaskDetailRoute() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  return <TaskDetailPage taskId={taskId} navigate={navigate} />;
}

function ChatRoute() {
  const navigate = useNavigate();
  return <ChatPage navigate={navigate} />;
}

function ScorecardRoute() {
  const navigate = useNavigate();
  return <ScorecardPage navigate={navigate} />;
}

function RoadmapRoute() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [needsPreRoadmap, setNeedsPreRoadmap] = useState(false);

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth"); return; }

      const [profileRes, roadmapRes] = await Promise.all([
        supabase.from("profiles").select("pre_roadmap_certainty").eq("id", user.id).single(),
        supabase.from("roadmaps").select("id").eq("user_id", user.id).eq("is_active", true).limit(1),
      ]);

      const hasAnswered = !!profileRes.data?.pre_roadmap_certainty;
      const hasRoadmap  = (roadmapRes.data?.length ?? 0) > 0;

      setNeedsPreRoadmap(!hasAnswered && !hasRoadmap);
      setReady(true);
    };
    check();
  }, [navigate]);

  if (!ready) return <div style={{ minHeight: "100vh", background: "#fafbff" }} />;
  if (needsPreRoadmap) return <PreRoadmapPage navigate={navigate} />;
  return <RoadmapPage navigate={navigate} />;
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
        <Route path="/roadmap/task/:taskId" element={<ErrorBoundary><TaskDetailRoute /></ErrorBoundary>} />
        <Route path="/roadmap" element={<ErrorBoundary><RoadmapRoute /></ErrorBoundary>} />
        <Route path="/roadmap-preview" element={<RoadmapPreviewPage />} />
        <Route path="/" element={<LandingPage />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </AppShell>
  );
}
