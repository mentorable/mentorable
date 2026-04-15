import { Routes, Route, useNavigate, useParams } from "react-router-dom";
import LandingPage from "./LandingPage.jsx";
import AuthPage from "./AuthPage.jsx";
import OnboardingPage from "./OnboardingPage.jsx";
import ScorecardPage from "./ScorecardPage.jsx";
import RoadmapPage from "./RoadmapPage.jsx";
import TaskDetailPage from "./components/task/TaskDetailPage.jsx";
import RoadmapPreviewPage from "./components/roadmap-preview/RoadmapPreviewPage.jsx";
import Sidebar, { SIDEBAR_WIDTH } from "./components/common/Sidebar.jsx";

const FONT = "'Space Grotesk', sans-serif";

function ComingSoonPage({ title, navigate, activePath }) {
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #e8f0ff 0%, #f4f8ff 25%, #f8faff 100%)" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');`}</style>
      <Sidebar activePath={activePath} navigate={navigate} onModeClick={null} roadmapMode="discovery" />
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

export default function App() {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/scorecard" element={<ScorecardPage navigate={navigate} />} />
      <Route path="/chat" element={<ComingSoonPage title="Chat" navigate={navigate} activePath="/chat" />} />
      <Route path="/profile" element={<ComingSoonPage title="Profile" navigate={navigate} activePath="/profile" />} />
      <Route path="/community" element={<ComingSoonPage title="Community" navigate={navigate} activePath="/community" />} />
      <Route path="/roadmap/task/:taskId" element={<TaskDetailRoute />} />
      <Route path="/roadmap" element={<RoadmapPage navigate={navigate} />} />
      <Route path="/roadmap-preview" element={<RoadmapPreviewPage />} />
      <Route path="/" element={<LandingPage />} />
      <Route path="*" element={<LandingPage />} />
    </Routes>
  );
}
