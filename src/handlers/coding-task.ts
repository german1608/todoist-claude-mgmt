import type { TaskHandler } from "./base-handler.js";
import type { DispatchableTask } from "../todoist/types.js";
import type { ClaudeSession, SpawnClaudeOptions } from "../claude/types.js";
import type { Config } from "../config.js";
import { generateWorktreeName } from "../claude/worktree.js";

export class CodingTaskHandler implements TaskHandler {
  readonly type = "coding";

  buildSpawnOptions(
    task: DispatchableTask,
    config: Config,
  ): SpawnClaudeOptions {
    const { todoistTask, repoUrl, branch } = task;

    // Determine working directory
    const cwd = repoUrl ?? config.claude.defaultRepoPath;

    // Build the prompt from the task
    const prompt = this.buildPrompt(todoistTask.content, todoistTask.description, branch);

    const worktreeName = generateWorktreeName(
      todoistTask.id,
      todoistTask.content,
    );

    const systemPromptAddition = [
      "You are working on a task dispatched from Todoist.",
      `Todoist Task: "${todoistTask.content}"`,
      "Work autonomously. If you need clarification or have a question,",
      "clearly state your question at the END of your response prefixed with 'QUESTION:'.",
      "When finished, provide a clear summary of what was done.",
      "Create a git commit with your changes. If the task warrants a PR, create one.",
    ].join("\n");

    return {
      prompt,
      cwd,
      worktreeName,
      sessionName: `todoist-${todoistTask.id}`,
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
      `[Claude] Task ${status}`,
      "",
      `**Duration:** ${duration}s`,
      `**Cost:** $${(session.costUsd ?? 0).toFixed(4)}`,
      `**Resumes:** ${session.resumeCount}`,
    ];

    if (session.result) {
      // Truncate long results for the Todoist comment
      const result =
        session.result.length > 2000
          ? session.result.slice(0, 2000) + "...(truncated)"
          : session.result;
      lines.push("", "**Result:**", result);
    }

    if (session.worktreeBranch) {
      lines.push("", `**Branch:** ${session.worktreeBranch}`);
    }

    return lines.join("\n");
  }

  detectQuestion(output: string): string | null {
    // Look for "QUESTION:" marker in the output
    const match = output.match(/QUESTION:\s*(.+?)(?:\n|$)/is);
    if (match) {
      return match[1]!.trim();
    }

    // Also check for common question indicators
    const lowerOutput = output.toLowerCase();
    const questionIndicators = [
      "i need clarification",
      "could you clarify",
      "i have a question",
      "please confirm",
      "which approach",
      "should i",
    ];

    for (const indicator of questionIndicators) {
      if (lowerOutput.includes(indicator)) {
        // Extract the last paragraph as the question
        const paragraphs = output.trim().split(/\n\n+/);
        return paragraphs[paragraphs.length - 1]?.trim() ?? null;
      }
    }

    return null;
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private buildPrompt(
    title: string,
    description: string,
    branch?: string,
  ): string {
    const parts = [`# Task: ${title}`];

    if (description) {
      parts.push("", "## Description", description);
    }

    if (branch) {
      parts.push("", `## Branch`, `Work on branch: ${branch}`);
    }

    parts.push(
      "",
      "## Instructions",
      "1. Analyze the task and plan your approach",
      "2. Implement the changes",
      "3. Run any relevant tests",
      "4. Commit your changes with a clear commit message",
      "5. Create a PR if appropriate",
      "6. Provide a summary of what was done",
    );

    return parts.join("\n");
  }
}
