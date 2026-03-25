import { createLogger } from "../utils/logger.js";
import { TodoistClient } from "./client.js";
import type { Config } from "../config.js";
import type { TodoistComment, TodoistSection, TodoistTask } from "./types.js";

const log = createLogger("Polling");

export interface PollState {
  /** project ID for the Claude Tasks project */
  projectId: string;
  /** Map of section name → section object */
  sections: Map<string, TodoistSection>;
  /** Last seen comment ID per task (to detect new replies) */
  lastSeenCommentId: Map<string, string>;
}

/**
 * Initialize polling state — ensures the Todoist project and sections exist.
 */
export async function initPollState(
  client: TodoistClient,
  config: Config,
): Promise<PollState> {
  const sectionNames = [
    config.todoist.sections.queued,
    config.todoist.sections.inProgress,
    config.todoist.sections.blocked,
    config.todoist.sections.review,
    config.todoist.sections.done,
  ];

  const { project, sections } = await client.ensureProjectAndSections(
    config.todoist.projectName,
    sectionNames,
  );

  // Also ensure labels exist
  await client.ensureLabels([
    config.todoist.labels.claude,
    config.todoist.labels.inProgress,
    config.todoist.labels.blocked,
    config.todoist.labels.review,
    config.todoist.labels.prMonitor,
    config.todoist.labels.coding,
  ]);

  log.info("Poll state initialized", {
    projectId: project.id,
    sections: Object.fromEntries(
      [...sections.entries()].map(([k, v]) => [k, v.id]),
    ),
  });

  return {
    projectId: project.id,
    sections,
    lastSeenCommentId: new Map(),
  };
}

/**
 * Fetch new tasks to dispatch — tasks in the Queued section OR with @claude label
 * that aren't already in-progress/blocked/done.
 */
export async function pollNewTasks(
  client: TodoistClient,
  config: Config,
  state: PollState,
): Promise<TodoistTask[]> {
  const results: TodoistTask[] = [];

  // 1. Tasks in the Queued section of the Claude Tasks project
  const queuedSection = state.sections.get(config.todoist.sections.queued);
  if (queuedSection) {
    const queuedTasks = await client.getTasks({
      section_id: queuedSection.id,
      project_id: state.projectId,
    });
    results.push(...queuedTasks);
  }

  // 2. Tasks with @claude label from any project (that aren't already tracked)
  const labeledTasks = await client.getTasks({
    label: config.todoist.labels.claude,
  });

  // Filter out tasks that are already in-progress, blocked, or done
  const activeLabels = new Set([
    config.todoist.labels.inProgress,
    config.todoist.labels.blocked,
    config.todoist.labels.review,
  ]);

  for (const task of labeledTasks) {
    const hasActiveLabel = task.labels.some((l) => activeLabels.has(l));
    const alreadyInResults = results.some((r) => r.id === task.id);
    if (!hasActiveLabel && !alreadyInResults) {
      results.push(task);
    }
  }

  log.debug(`Found ${results.length} new tasks to dispatch`);
  return results;
}

/**
 * Poll blocked tasks for new human replies (comments).
 */
export async function pollBlockedTaskReplies(
  client: TodoistClient,
  config: Config,
  state: PollState,
): Promise<Array<{ task: TodoistTask; newComments: TodoistComment[] }>> {
  const blockedTasks = await client.getTasks({
    label: config.todoist.labels.blocked,
  });

  const results: Array<{ task: TodoistTask; newComments: TodoistComment[] }> =
    [];

  for (const task of blockedTasks) {
    if (task.comment_count === 0) continue;

    const comments = await client.getComments(task.id);
    const lastSeenId = state.lastSeenCommentId.get(task.id);

    let newComments: TodoistComment[];
    if (lastSeenId) {
      // Find comments posted after the last one we saw
      const lastSeenIndex = comments.findIndex((c) => c.id === lastSeenId);
      newComments =
        lastSeenIndex >= 0 ? comments.slice(lastSeenIndex + 1) : [];
    } else {
      // First time checking — treat the latest comment as new if it exists
      newComments = comments.length > 0 ? [comments[comments.length - 1]!] : [];
    }

    // Filter out comments that were posted by the dispatcher (they start with "[Claude]")
    newComments = newComments.filter(
      (c) => !c.content.startsWith("[Claude]"),
    );

    if (newComments.length > 0) {
      results.push({ task, newComments });
      // Update last seen to the latest comment
      const latest = comments[comments.length - 1];
      if (latest) {
        state.lastSeenCommentId.set(task.id, latest.id);
      }
    }
  }

  log.debug(`Found ${results.length} blocked tasks with new replies`);
  return results;
}

/**
 * Poll tasks in Review for follow-up comments (user wants changes after completion).
 * Same logic as blocked replies but checks for @review label instead of @blocked.
 */
export async function pollReviewTaskReplies(
  client: TodoistClient,
  config: Config,
  state: PollState,
): Promise<Array<{ task: TodoistTask; newComments: TodoistComment[] }>> {
  const reviewTasks = await client.getTasks({
    label: config.todoist.labels.review,
  });

  const results: Array<{ task: TodoistTask; newComments: TodoistComment[] }> =
    [];

  for (const task of reviewTasks) {
    if (task.comment_count === 0) continue;

    const comments = await client.getComments(task.id);
    const lastSeenId = state.lastSeenCommentId.get(task.id);

    let newComments: TodoistComment[];
    if (lastSeenId) {
      const lastSeenIndex = comments.findIndex((c) => c.id === lastSeenId);
      newComments =
        lastSeenIndex >= 0 ? comments.slice(lastSeenIndex + 1) : [];
    } else {
      newComments = [];
    }

    // Filter out dispatcher comments
    newComments = newComments.filter(
      (c) => !c.content.startsWith("[Claude]"),
    );

    if (newComments.length > 0) {
      results.push({ task, newComments });
      const latest = comments[comments.length - 1];
      if (latest) {
        state.lastSeenCommentId.set(task.id, latest.id);
      }
    }
  }

  log.debug(`Found ${results.length} review tasks with follow-up comments`);
  return results;
}
