import type { TaskHandler } from "./base-handler.js";
import type { DispatchableTask } from "../todoist/types.js";
import type { ClaudeSession, SpawnClaudeOptions } from "../claude/types.js";
import type { Config } from "../config.js";

export class PrMonitorHandler implements TaskHandler {
  readonly type = "pr-monitor";

  buildSpawnOptions(
    task: DispatchableTask,
    config: Config,
  ): SpawnClaudeOptions {
    const { todoistTask, prUrl, prNumber, platform, repoUrl } = task;

    // Determine working directory — for PR tasks we need the repo
    const cwd = repoUrl ?? config.claude.defaultRepoPath;

    const prompt = this.buildPrompt(
      todoistTask.content,
      todoistTask.description,
      prUrl,
      prNumber,
      platform,
    );

    const systemPromptAddition = [
      "You are monitoring and maintaining a Pull Request dispatched from Todoist.",
      `Todoist Task: "${todoistTask.content}"`,
      "Your goal is to get this PR to a ready-to-merge state.",
      "Work autonomously. If you need clarification, prefix your question with 'QUESTION:'.",
      "Provide a status summary at the end of your work.",
    ].join("\n");

    return {
      prompt,
      cwd,
      sessionName: `todoist-pr-${todoistTask.id}`,
      permissionMode: config.claude.permissionMode,
      model: config.claude.model,
      appendSystemPrompt: systemPromptAddition,
    };
  }

  formatCompletionSummary(
    task: DispatchableTask,
    session: ClaudeSession,
  ): string {
    const status = session.isError ? "FAILED" : "COMPLETED";
    const duration = session.completedAt
      ? Math.round(
          (session.completedAt.getTime() - session.startedAt.getTime()) / 1000,
        )
      : 0;

    const lines = [
      `[Claude] PR Monitor ${status}`,
      "",
      `**PR:** ${task.prUrl ?? "N/A"}`,
      `**Duration:** ${duration}s`,
      `**Cost:** $${(session.costUsd ?? 0).toFixed(4)}`,
    ];

    if (session.result) {
      const result =
        session.result.length > 2000
          ? session.result.slice(0, 2000) + "...(truncated)"
          : session.result;
      lines.push("", "**Status:**", result);
    }

    return lines.join("\n");
  }

  detectQuestion(output: string): string | null {
    const match = output.match(/QUESTION:\s*(.+?)(?:\n|$)/is);
    return match ? match[1]!.trim() : null;
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private buildPrompt(
    title: string,
    description: string,
    prUrl?: string,
    prNumber?: number,
    platform?: "github" | "ado",
  ): string {
    const parts = [`# PR Maintenance: ${title}`];

    if (description) {
      parts.push("", "## Context", description);
    }

    if (prUrl) {
      parts.push("", `## Pull Request`, `URL: ${prUrl}`);
    }

    parts.push("", "## Tasks to Perform");

    if (platform === "github") {
      parts.push(
        `1. Check the PR status: \`gh pr view ${prNumber ?? ""} --json state,reviewDecision,mergeStateStatus,mergeable,statusCheckRollup\``,
        `2. Check for merge conflicts: \`gh pr view ${prNumber ?? ""} --json mergeable\``,
        "   - If there are merge conflicts, fix them by merging the target branch and resolving conflicts",
        `3. Check for review comments: \`gh pr view ${prNumber ?? ""} --comments\``,
        "   - Reply to any unresolved review comments from teammates",
        "   - Address any requested changes",
        `4. Check CI status: \`gh pr checks ${prNumber ?? ""}\``,
        "   - If CI is failing, investigate and fix the issues",
        "5. Push any fixes and provide a status summary",
      );
    } else if (platform === "ado") {
      parts.push(
        `1. Check the PR status using Azure DevOps CLI`,
        "2. Check for merge conflicts and fix them if present",
        "3. Check for review comments and respond to them",
        "4. Check build/pipeline status and fix any failures",
        "5. Push any fixes and provide a status summary",
      );
    } else {
      parts.push(
        "1. Identify the platform (GitHub or Azure DevOps) from the PR URL",
        "2. Check for merge conflicts and fix them",
        "3. Check and respond to review comments",
        "4. Check CI status and fix failures",
        "5. Provide a status summary",
      );
    }

    parts.push(
      "",
      "## Completion Criteria",
      "The PR is ready-to-merge when:",
      "- No merge conflicts",
      "- All review comments addressed",
      "- CI checks passing",
      "- Approvals obtained (or pending human approval)",
    );

    return parts.join("\n");
  }
}
