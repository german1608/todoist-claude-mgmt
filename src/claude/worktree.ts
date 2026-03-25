import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../utils/logger.js";

const log = createLogger("Worktree");

/**
 * Git worktree lifecycle helpers.
 *
 * Note: When using `claude -p --worktree <name>`, Claude Code manages
 * worktree creation automatically. These helpers are for:
 * - Checking if a worktree already exists
 * - Cleaning up worktrees after task completion
 * - Getting worktree paths for resume operations
 */

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
  isLocked: boolean;
}

/**
 * List all git worktrees in a repository.
 */
export function listWorktrees(repoPath: string): WorktreeInfo[] {
  try {
    const output = execSync("git worktree list --porcelain", {
      cwd: repoPath,
      encoding: "utf-8",
    });

    const worktrees: WorktreeInfo[] = [];
    let current: Partial<WorktreeInfo> = {};

    for (const line of output.split("\n")) {
      if (line.startsWith("worktree ")) {
        if (current.path) {
          worktrees.push(current as WorktreeInfo);
        }
        current = { path: line.slice(9), isLocked: false };
      } else if (line.startsWith("HEAD ")) {
        current.head = line.slice(5);
      } else if (line.startsWith("branch ")) {
        current.branch = line.slice(7);
      } else if (line === "locked") {
        current.isLocked = true;
      }
    }

    if (current.path) {
      worktrees.push(current as WorktreeInfo);
    }

    return worktrees;
  } catch (err) {
    log.error("Failed to list worktrees", {
      error: (err as Error).message,
    });
    return [];
  }
}

/**
 * Find a worktree by its branch name suffix (e.g., "todoist-12345").
 */
export function findWorktree(
  repoPath: string,
  branchSuffix: string,
): WorktreeInfo | undefined {
  const worktrees = listWorktrees(repoPath);
  return worktrees.find(
    (w) => w.branch && w.branch.endsWith(branchSuffix),
  );
}

/**
 * Remove a git worktree and its branch.
 */
export function removeWorktree(
  repoPath: string,
  worktreePath: string,
): boolean {
  try {
    if (!existsSync(worktreePath)) {
      log.warn(`Worktree path does not exist: ${worktreePath}`);
      return false;
    }

    execSync(`git worktree remove "${worktreePath}" --force`, {
      cwd: repoPath,
      encoding: "utf-8",
    });

    log.info(`Removed worktree: ${worktreePath}`);
    return true;
  } catch (err) {
    log.error("Failed to remove worktree", {
      path: worktreePath,
      error: (err as Error).message,
    });
    return false;
  }
}

/**
 * Get the .claude/worktrees/ directory for a repo (where Claude Code puts its worktrees).
 */
export function getClaudeWorktreeDir(repoPath: string): string {
  return join(repoPath, ".claude", "worktrees");
}

/**
 * Prune stale worktree entries (where the directory no longer exists).
 */
export function pruneWorktrees(repoPath: string): void {
  try {
    execSync("git worktree prune", {
      cwd: repoPath,
      encoding: "utf-8",
    });
    log.debug("Pruned stale worktrees");
  } catch (err) {
    log.warn("Failed to prune worktrees", {
      error: (err as Error).message,
    });
  }
}

/**
 * Generate a slugified worktree name from a Todoist task.
 */
export function generateWorktreeName(
  taskId: string,
  taskContent: string,
): string {
  const slug = taskContent
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);

  return `todoist-${taskId}-${slug}`;
}
