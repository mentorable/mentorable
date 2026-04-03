import { useState, useEffect } from "react";
import LandingPage from "./LandingPage.jsx";
import AuthPage from "./AuthPage.jsx";
import OnboardingPage from "./OnboardingPage.jsx";
import ScorecardPage from "./ScorecardPage.jsx";
import RoadmapPage from "./RoadmapPage.jsx";
import TaskDetailPage from "./components/task/TaskDetailPage.jsx";
import RoadmapPreviewPage from "./components/roadmap-preview/RoadmapPreviewPage.jsx";

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
  if (path === "/scorecard") return <ScorecardPage />;

  const taskMatch = path.match(/^\/roadmap\/task\/([^/]+)$/);
  if (taskMatch) {
    return <TaskDetailPage taskId={taskMatch[1]} navigate={navigate} />;
  }
  if (path === "/roadmap") return <RoadmapPage navigate={navigate} />;
  if (path === "/roadmap-preview") return <RoadmapPreviewPage />;

  return <LandingPage />;
}