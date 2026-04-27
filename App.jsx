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
import Sidebar, { SIDEBAR_WIDTH } from "./components/common/Sidebar.jsx";
import { supabase } from "./lib/supabase.js";

const FONT = "'Space Grotesk', sans-serif";

function ComingSoonPage({ title, navigate, activePath }) {
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #e8f0ff 0%, #f4f8ff 25%, #f8faff 100%)" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');`}</style>
      <Sidebar activePath={activePath} navigate={navigate} onModeClick={null} roadmapMode={localStorage.getItem("roadmapMode") || "discovery"} />
      <div style={{
        marginLeft: SIDEBAR_WIDTH,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "1rem",
        fontFamily: FONT,
      }}>
        <div style={{
          background: "#ffffff",
          border: "1.5px solid rgba(37,99,235,0.12)",
          borderRadius: "1.25rem",
          padding: "2.5rem 3rem",
          textAlign: "center",
          boxShadow: "0 4px 24px rgba(37,99,235,0.08)",
        }}>
          <p style={{ fontFamily: FONT, fontWeight: 700, fontSize: "1.5rem", color: "#0b1340", marginBottom: "0.5rem" }}>
            {title}
          </p>
          <p style={{ fontFamily: FONT, fontSize: "0.9rem", color: "#9199b8", fontWeight: 500 }}>
            Coming soon
          </p>
        </div>
      </div>
    </div>
  );
}

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

function ComingSoonRoute({ title, activePath }) {
  const navigate = useNavigate();
  return <ComingSoonPage title={title} navigate={navigate} activePath={activePath} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/scorecard" element={<ScorecardRoute />} />
      <Route path="/chat" element={<ChatRoute />} />
      <Route path="/profile" element={<ComingSoonRoute title="Profile" activePath="/profile" />} />
      <Route path="/community" element={<ComingSoonRoute title="Community" activePath="/community" />} />
      <Route path="/roadmap/task/:taskId" element={<TaskDetailRoute />} />
      <Route path="/roadmap" element={<RoadmapRoute />} />
      <Route path="/roadmap-preview" element={<RoadmapPreviewPage />} />
      <Route path="/" element={<LandingPage />} />
      <Route path="*" element={<LandingPage />} />
    </Routes>
  );
}
