import { spawn, type ChildProcess } from "node:child_process";
import { v4 as uuidv4 } from "uuid";
import { createLogger } from "../utils/logger.js";
import type {
  ClaudeJsonOutput,
  ClaudeSession,
  SpawnClaudeOptions,
} from "./types.js";

const log = createLogger("ClaudeSession");

/**
 * Manages spawning, tracking, and resuming headless Claude Code sessions.
 */
export class SessionManager {
  private sessions = new Map<string, ClaudeSession>();
  private processes = new Map<string, ChildProcess>();

  /**
   * Spawn a new Claude Code session.
   * Returns immediately with a session handle; the process runs in background.
   */
  async spawnSession(
    todoistTaskId: string,
    options: SpawnClaudeOptions,
  ): Promise<ClaudeSession> {
    const sessionId = uuidv4();

    const session: ClaudeSession = {
      id: sessionId,
      todoistTaskId,
      status: "starting",
      prompt: options.prompt,
      startedAt: new Date(),
      resumeCount: 0,
    };

    this.sessions.set(sessionId, session);

    const args = this.buildArgs(options);
    log.info(`Spawning Claude session ${sessionId}`, {
      todoistTaskId,
      worktree: options.worktreeName,
      args: args.join(" "),
    });

    const child = spawn("claude", args, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    session.pid = child.pid;
    session.status = "running";
    this.processes.set(sessionId, child);

    // Collect stdout
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      log.info(`Session ${sessionId} exited with code ${code}`);
      this.processes.delete(sessionId);

      try {
        const output = this.parseOutput(stdout);
        session.claudeSessionId = output.session_id;
        session.result = output.result;
        session.costUsd = output.total_cost_usd;
        session.isError = output.is_error;
        session.status = output.is_error ? "failed" : "completed";
      } catch {
        log.warn(`Could not parse JSON output for session ${sessionId}`, {
          stdout: stdout.slice(0, 500),
          stderr: stderr.slice(0, 500),
        });
        session.result = stdout || stderr || `Process exited with code ${code}`;
        session.isError = code !== 0;
        session.status = code === 0 ? "completed" : "failed";
      }

      session.completedAt = new Date();
    });

    child.on("error", (err) => {
      log.error(`Session ${sessionId} process error`, {
        error: err.message,
      });
      session.status = "failed";
      session.isError = true;
      session.result = `Process error: ${err.message}`;
      session.completedAt = new Date();
      this.processes.delete(sessionId);
    });

    return session;
  }

  /**
   * Resume a blocked or awaiting-feedback session with a user's reply.
   */
  async resumeSession(
    internalSessionId: string,
    userReply: string,
    cwd: string,
  ): Promise<ClaudeSession> {
    const session = this.sessions.get(internalSessionId);
    if (!session) {
      throw new Error(`Session ${internalSessionId} not found`);
    }
    if (!session.claudeSessionId) {
      throw new Error(
        `Session ${internalSessionId} has no Claude session ID to resume`,
      );
    }
    if (session.status !== "blocked" && session.status !== "awaiting-feedback") {
      throw new Error(
        `Session ${internalSessionId} is in "${session.status}" state, expected "blocked" or "awaiting-feedback"`,
      );
    }

    session.status = "resumed";
    session.resumeCount++;

    const options: SpawnClaudeOptions = {
      prompt: userReply,
      cwd,
      resumeSessionId: session.claudeSessionId,
    };

    // Re-use the same internal session but spawn a new process
    const args = this.buildArgs(options);
    log.info(`Resuming session ${internalSessionId}`, {
      claudeSessionId: session.claudeSessionId,
      resumeCount: session.resumeCount,
    });

    const child = spawn("claude", args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    session.pid = child.pid;
    session.status = "running";
    this.processes.set(internalSessionId, child);

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      log.info(`Resumed session ${internalSessionId} exited with code ${code}`);
      this.processes.delete(internalSessionId);

      try {
        const output = this.parseOutput(stdout);
        session.claudeSessionId = output.session_id;
        session.result = output.result;
        session.costUsd =
          (session.costUsd ?? 0) + output.total_cost_usd;
        session.isError = output.is_error;
        session.status = output.is_error ? "failed" : "completed";
      } catch {
        session.result = stdout || stderr || `Process exited with code ${code}`;
        session.isError = code !== 0;
        session.status = code === 0 ? "completed" : "failed";
      }

      session.completedAt = new Date();
    });

    child.on("error", (err) => {
      log.error(`Resumed session ${internalSessionId} error`, {
        error: err.message,
      });
      session.status = "failed";
      session.isError = true;
      session.result = `Process error: ${err.message}`;
      session.completedAt = new Date();
      this.processes.delete(internalSessionId);
    });

    return session;
  }

  /**
   * Get a session by internal ID.
   */
  getSession(id: string): ClaudeSession | undefined {
    return this.sessions.get(id);
  }

  /**
   * Get all sessions for a Todoist task.
   */
  getSessionsForTask(todoistTaskId: string): ClaudeSession[] {
    return [...this.sessions.values()].filter(
      (s) => s.todoistTaskId === todoistTaskId,
    );
  }

  /**
   * Get all currently running sessions.
   */
  getActiveSessions(): ClaudeSession[] {
    return [...this.sessions.values()].filter(
      (s) => s.status === "running" || s.status === "starting",
    );
  }

  /**
   * Get sessions that just completed (haven't been processed yet).
   * Excludes sessions already in "awaiting-feedback" state (already processed once).
   */
  getCompletedSessions(): ClaudeSession[] {
    return [...this.sessions.values()].filter(
      (s) =>
        (s.status === "completed" || s.status === "failed") &&
        s.completedAt !== undefined,
    );
  }

  /**
   * Find session by Todoist task ID.
   */
  findByTodoistTask(todoistTaskId: string): ClaudeSession | undefined {
    return [...this.sessions.values()].find(
      (s) =>
        s.todoistTaskId === todoistTaskId &&
        (s.status === "running" || s.status === "blocked" || s.status === "awaiting-feedback"),
    );
  }

  /**
   * Mark a session as blocked (waiting for human Q&A).
   */
  markBlocked(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = "blocked";
    }
  }

  /**
   * Mark a session as awaiting feedback (task complete, but user may request changes).
   * Session stays tracked and resumable.
   */
  markAwaitingFeedback(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = "awaiting-feedback";
    }
  }

  /**
   * Remove a session from tracking.
   */
  removeSession(id: string): void {
    const child = this.processes.get(id);
    if (child) {
      child.kill("SIGTERM");
      this.processes.delete(id);
    }
    this.sessions.delete(id);
  }

  /**
   * Kill all running sessions (for graceful shutdown).
   */
  killAll(): void {
    for (const [id, child] of this.processes) {
      log.warn(`Killing session ${id}`);
      child.kill("SIGTERM");
    }
    this.processes.clear();
  }

  /**
   * Get count of active sessions.
   */
  get activeCount(): number {
    return this.getActiveSessions().length;
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private buildArgs(options: SpawnClaudeOptions): string[] {
    const args: string[] = ["-p", "--output-format", "json"];

    if (options.resumeSessionId) {
      args.push("--resume", options.resumeSessionId);
    }

    if (options.worktreeName) {
      args.push("--worktree", options.worktreeName);
    }

    if (options.sessionName) {
      args.push("--name", options.sessionName);
    }

    if (options.permissionMode) {
      args.push("--permission-mode", options.permissionMode);
    }

    if (options.model) {
      args.push("--model", options.model);
    }

    if (options.addDirs) {
      args.push("--add-dir", ...options.addDirs);
    }

    if (options.maxBudgetUsd) {
      args.push("--max-budget-usd", options.maxBudgetUsd.toString());
    }

    if (options.appendSystemPrompt) {
      args.push("--append-system-prompt", options.appendSystemPrompt);
    }

    // The prompt goes last
    args.push(options.prompt);

    return args;
  }

  private parseOutput(stdout: string): ClaudeJsonOutput {
    // The JSON output might have other text before it; find the JSON object
    const lines = stdout.trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]!.trim();
      if (line.startsWith("{")) {
        try {
          return JSON.parse(line) as ClaudeJsonOutput;
        } catch {
          continue;
        }
      }
    }
    throw new Error("No valid JSON output found in Claude response");
  }
}
