import { createLogger } from "../utils/logger.js";
import type { TodoistTask, TaskType, DispatchableTask } from "../todoist/types.js";
import type { Config } from "../config.js";

const log = createLogger("Router");

/**
 * Parses a Todoist task and determines its type, extracting structured data
 * from the task description (repo URL, PR number, etc.).
 */
export function routeTask(
  task: TodoistTask,
  config: Config,
): DispatchableTask {
  const taskType = detectTaskType(task, config);
  const parsed = parseTaskDescription(task.description, taskType);

  log.info(`Routed task "${task.content}" as ${taskType}`, {
    taskId: task.id,
    repoUrl: parsed.repoUrl,
    prUrl: parsed.prUrl,
  });

  return {
    todoistTask: task,
    taskType,
    ...parsed,
  };
}

/**
 * Detect the task type from labels and content.
 */
function detectTaskType(task: TodoistTask, config: Config): TaskType {
  // Check labels first
  if (task.labels.includes(config.todoist.labels.prMonitor)) {
    return "pr-monitor";
  }
  if (task.labels.includes(config.todoist.labels.coding)) {
    return "coding";
  }

  // Heuristic: if the description or content mentions a PR URL, it's a PR monitor
  const text = `${task.content} ${task.description}`.toLowerCase();
  if (
    text.includes("/pull/") ||
    text.includes("/pullrequest/") ||
    text.includes("pr #") ||
    text.includes("pull request")
  ) {
    return "pr-monitor";
  }

  // Default to coding
  return "coding";
}

interface ParsedDescription {
  repoUrl?: string;
  branch?: string;
  prUrl?: string;
  prNumber?: number;
  platform?: "github" | "ado";
}

/**
 * Extract structured data from the task description.
 */
function parseTaskDescription(
  description: string,
  _taskType: TaskType,
): ParsedDescription {
  const result: ParsedDescription = {};

  // Extract repo URL
  const repoMatch = description.match(
    /(?:Repo|Repository|repo):\s*(https?:\/\/\S+)/i,
  );
  if (repoMatch) {
    result.repoUrl = repoMatch[1];
  }

  // Extract branch
  const branchMatch = description.match(
    /(?:Branch|branch):\s*(\S+)/i,
  );
  if (branchMatch) {
    result.branch = branchMatch[1];
  }

  // Extract PR URL
  const prMatch = description.match(
    /(?:PR|Pull Request|pr):\s*(https?:\/\/\S+)/i,
  );
  if (prMatch) {
    result.prUrl = prMatch[1];
  }

  // Also check for PR URL anywhere in the description
  if (!result.prUrl) {
    const ghPrMatch = description.match(
      /(https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+)/,
    );
    if (ghPrMatch) {
      result.prUrl = ghPrMatch[1];
    }

    const adoPrMatch = description.match(
      /(https:\/\/dev\.azure\.com\/[^/]+\/[^/]+\/_git\/[^/]+\/pullrequest\/\d+)/,
    );
    if (adoPrMatch) {
      result.prUrl = adoPrMatch[1];
    }
  }

  // Extract PR number
  if (result.prUrl) {
    const numberMatch = result.prUrl.match(/\/(\d+)$/);
    if (numberMatch) {
      result.prNumber = parseInt(numberMatch[1]!, 10);
    }
  }

  // Detect platform
  if (result.prUrl || result.repoUrl) {
    const url = result.prUrl ?? result.repoUrl ?? "";
    if (url.includes("github.com")) {
      result.platform = "github";
    } else if (
      url.includes("dev.azure.com") ||
      url.includes("visualstudio.com")
    ) {
      result.platform = "ado";
    }
  }

  return result;
}
