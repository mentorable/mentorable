import { useState, useEffect } from "react";
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

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = (newPath) => {
    window.history.pushState({}, "", newPath);
    setPath(newPath);
  };

  if (path === "/auth") return <AuthPage />;
  if (path === "/onboarding") return <OnboardingPage />;
  if (path === "/scorecard") return <ScorecardPage navigate={navigate} />;
  if (path === "/chat") return <ComingSoonPage title="Chat" navigate={navigate} activePath="/chat" />;
  if (path === "/profile") return <ComingSoonPage title="Profile" navigate={navigate} activePath="/profile" />;
  if (path === "/community") return <ComingSoonPage title="Community" navigate={navigate} activePath="/community" />;

  const taskMatch = path.match(/^\/roadmap\/task\/([^/]+)$/);
  if (taskMatch) {
    return <TaskDetailPage taskId={taskMatch[1]} navigate={navigate} />;
  }
  if (path === "/roadmap") return <RoadmapPage navigate={navigate} />;
  if (path === "/roadmap-preview") return <RoadmapPreviewPage />;

  return <LandingPage />;
}