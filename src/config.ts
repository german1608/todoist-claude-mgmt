import { config as dotenvConfig } from "dotenv";

dotenvConfig();

export interface Config {
  todoist: {
    apiToken: string;
    projectName: string;
    label: string;
    pollIntervalMs: number;
    sections: {
      queued: string;
      inProgress: string;
      blocked: string;
      review: string;
      done: string;
    };
    labels: {
      claude: string;
      inProgress: string;
      blocked: string;
      review: string;
      prMonitor: string;
      coding: string;
    };
  };
  claude: {
    maxConcurrentSessions: number;
    permissionMode: string;
    defaultRepoPath: string;
    model?: string;
  };
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export function loadConfig(): Config {
  return {
    todoist: {
      apiToken: requireEnv("TODOIST_API_TOKEN"),
      projectName: optionalEnv("CLAUDE_PROJECT_NAME", "Claude Tasks"),
      label: optionalEnv("CLAUDE_LABEL", "claude"),
      pollIntervalMs: parseInt(
        optionalEnv("POLL_INTERVAL_MS", "60000"),
        10,
      ),
      sections: {
        queued: optionalEnv("SECTION_QUEUED", "Queued"),
        inProgress: optionalEnv("SECTION_IN_PROGRESS", "In Progress"),
        blocked: optionalEnv("SECTION_BLOCKED", "Blocked"),
        review: optionalEnv("SECTION_REVIEW", "Review"),
        done: optionalEnv("SECTION_DONE", "Done"),
      },
      labels: {
        claude: optionalEnv("CLAUDE_LABEL", "claude"),
        inProgress: optionalEnv("LABEL_IN_PROGRESS", "in-progress"),
        blocked: optionalEnv("LABEL_BLOCKED", "blocked"),
        review: optionalEnv("LABEL_REVIEW", "review"),
        prMonitor: optionalEnv("LABEL_PR_MONITOR", "pr-monitor"),
        coding: optionalEnv("LABEL_CODING", "coding"),
      },
    },
    claude: {
      maxConcurrentSessions: parseInt(
        optionalEnv("MAX_CONCURRENT_SESSIONS", "5"),
        10,
      ),
      permissionMode: optionalEnv("CLAUDE_PERMISSION_MODE", "auto"),
      defaultRepoPath: optionalEnv(
        "DEFAULT_REPO_PATH",
        process.cwd(),
      ),
      model: process.env["CLAUDE_MODEL"],
    },
  };
}
