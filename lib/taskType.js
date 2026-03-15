/**
 * Infer task type from task fields for milestone icon and detail layout.
 * @param {Object} task - RoadmapTask with title, description, resource_url, etc.
 * @param {Object} options - { phaseTasks: task[], taskIndex: number } to detect checkpoint
 * @returns {'video'|'reading'|'reflection'|'project'|'checkpoint'}
 */
export function getTaskType(task, options = {}) {
  if (!task) return "reflection";

  const url = (task.resource_url || "").toLowerCase();
  const title = (task.title || "").toLowerCase();
  const desc = (task.description || "").toLowerCase();

  // Checkpoint: last task in phase or title hints
  const { phaseTasks = [], taskIndex = -1 } = options;
  const isLastInPhase =
    phaseTasks.length > 0 &&
    taskIndex >= 0 &&
    taskIndex === phaseTasks.length - 1;
  if (
    isLastInPhase ||
    title.includes("checkpoint") ||
    title.includes("phase complete") ||
    title.includes("wrap up")
  ) {
    return "checkpoint";
  }

  // Video: YouTube links
  if (
    url.includes("youtube.com") ||
    url.includes("youtu.be") ||
    url.includes("vimeo.com")
  ) {
    return "video";
  }

  // Reading: has resource URL but not video
  if (task.resource_url && task.resource_url.trim()) {
    return "reading";
  }

  // Project/build: title or description hints
  if (
    title.includes("build") ||
    title.includes("project") ||
    title.includes("code") ||
    title.includes("create") ||
    desc.includes("step-by-step") ||
    desc.includes("build ")
  ) {
    return "project";
  }

  // Default: reflection
  return "reflection";
}
