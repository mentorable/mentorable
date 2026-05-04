import { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useParams } from "react-router-dom";
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
import ErrorBoundary from "./components/common/ErrorBoundary.jsx";
import { supabase } from "./lib/supabase.js";

const FONT = "'Space Grotesk', sans-serif";


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

// Gate: show PreRoadmapPage for first-timers, RoadmapPage for everyone else
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
  return <ResearchPage navigate={navigate} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/onboarding" element={<ErrorBoundary><OnboardingPage /></ErrorBoundary>} />
      <Route path="/scorecard" element={<ScorecardRoute />} />
      <Route path="/chat" element={<ErrorBoundary><ChatRoute /></ErrorBoundary>} />
      <Route path="/profile" element={<ProfileRoute />} />
      <Route path="/research" element={<ResearchRoute />} />
      <Route path="/roadmap/task/:taskId" element={<ErrorBoundary><TaskDetailRoute /></ErrorBoundary>} />
      <Route path="/roadmap" element={<ErrorBoundary><RoadmapRoute /></ErrorBoundary>} />
      <Route path="/roadmap-preview" element={<RoadmapPreviewPage />} />
      <Route path="/" element={<LandingPage />} />
      <Route path="*" element={<LandingPage />} />
    </Routes>
  );
}
