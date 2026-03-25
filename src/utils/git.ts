import { execSync } from "node:child_process";
import { createLogger } from "./logger.js";

const log = createLogger("Git");

/**
 * Get the root of the git repository.
 */
export function getRepoRoot(cwd: string): string {
  return execSync("git rev-parse --show-toplevel", {
    cwd,
    encoding: "utf-8",
  }).trim();
}

/**
 * Get the current branch name.
 */
export function getCurrentBranch(cwd: string): string {
  return execSync("git rev-parse --abbrev-ref HEAD", {
    cwd,
    encoding: "utf-8",
  }).trim();
}

/**
 * Check if a path is inside a git repository.
 */
export function isGitRepo(cwd: string): boolean {
  try {
    execSync("git rev-parse --git-dir", { cwd, encoding: "utf-8" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the remote URL for the repository.
 */
export function getRemoteUrl(cwd: string): string | undefined {
  try {
    return execSync("git remote get-url origin", {
      cwd,
      encoding: "utf-8",
    }).trim();
  } catch {
    return undefined;
  }
}

/**
 * Detect if a remote URL is GitHub or Azure DevOps.
 */
export function detectPlatform(
  remoteUrl: string,
): "github" | "ado" | "unknown" {
  if (
    remoteUrl.includes("github.com") ||
    remoteUrl.includes("github.dev")
  ) {
    return "github";
  }
  if (
    remoteUrl.includes("dev.azure.com") ||
    remoteUrl.includes("visualstudio.com")
  ) {
    return "ado";
  }
  return "unknown";
}

/**
 * Parse a GitHub PR URL into owner/repo and PR number.
 */
export function parseGitHubPrUrl(
  url: string,
): { owner: string; repo: string; prNumber: number } | undefined {
  // https://github.com/owner/repo/pull/123
  const match = url.match(
    /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/,
  );
  if (!match) return undefined;
  return {
    owner: match[1]!,
    repo: match[2]!,
    prNumber: parseInt(match[3]!, 10),
  };
}

/**
 * Parse an Azure DevOps PR URL into org/project/repo and PR number.
 */
export function parseAdoPrUrl(
  url: string,
): { org: string; project: string; repo: string; prNumber: number } | undefined {
  // https://dev.azure.com/org/project/_git/repo/pullrequest/123
  const match = url.match(
    /dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)/,
  );
  if (!match) return undefined;
  return {
    org: match[1]!,
    project: match[2]!,
    repo: match[3]!,
    prNumber: parseInt(match[4]!, 10),
  };
}

/**
 * Extract repo clone URL from a PR URL.
 */
export function repoUrlFromPrUrl(prUrl: string): string | undefined {
  const gh = parseGitHubPrUrl(prUrl);
  if (gh) {
    return `https://github.com/${gh.owner}/${gh.repo}.git`;
  }

  const ado = parseAdoPrUrl(prUrl);
  if (ado) {
    return `https://dev.azure.com/${ado.org}/${ado.project}/_git/${ado.repo}`;
  }

  return undefined;
}
