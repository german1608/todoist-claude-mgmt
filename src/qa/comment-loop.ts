import { createLogger } from "../utils/logger.js";
import { TodoistClient } from "../todoist/client.js";
import { SessionManager } from "../claude/session.js";
import type { Config } from "../config.js";
import type { ClaudeSession } from "../claude/types.js";
import type { PollState } from "../todoist/polling.js";
import type { TaskHandler } from "../handlers/base-handler.js";

const log = createLogger("CommentQA");

/**
 * Manages the Q&A loop between Claude sessions and the user via Todoist comments.
 *
 * When Claude's output contains a question:
 * 1. Posts the question as a Todoist comment (prefixed with [Claude])
 * 2. Moves the task to "Blocked" section, adds @blocked label
 * 3. Waits for user to reply via Todoist comment
 *
 * When the user replies:
 * 1. Resumes the Claude session with the reply
 * 2. Moves the task back to "In Progress", removes @blocked label
 */
export class CommentQALoop {
  private readonly client: TodoistClient;
  private readonly sessionManager: SessionManager;
  private readonly config: Config;

  /** Maps Todoist task ID → internal session ID */
  private taskSessionMap = new Map<string, string>();

  constructor(
    client: TodoistClient,
    sessionManager: SessionManager,
    config: Config,
  ) {
    this.client = client;
    this.sessionManager = sessionManager;
    this.config = config;
  }

  /**
   * Register a task-session mapping.
   */
  registerSession(todoistTaskId: string, sessionId: string): void {
    this.taskSessionMap.set(todoistTaskId, sessionId);
  }

  /**
   * Check if a completed session has a question and handle it.
   * Returns true if the session was blocked (question detected).
   */
  async handleSessionCompletion(
    session: ClaudeSession,
    handler: TaskHandler,
    pollState: PollState,
  ): Promise<boolean> {
    if (!session.result) return false;

    const question = handler.detectQuestion(session.result);
    if (!question) return false;

    log.info(`Question detected for task ${session.todoistTaskId}`, {
      question: question.slice(0, 200),
    });

    // Post the question as a Todoist comment
    const comment = await this.client.postTaskComment(
      session.todoistTaskId,
      `[Claude] I have a question:\n\n${question}`,
    );

    // Track the comment so we don't re-process it
    pollState.lastSeenCommentId.set(session.todoistTaskId, comment.id);

    // Move task to Blocked
    const blockedSection = pollState.sections.get(
      this.config.todoist.sections.blocked,
    );
    if (blockedSection) {
      await this.client.moveTask(session.todoistTaskId, blockedSection.id);
    }

    // Add @blocked label, remove @in-progress
    await this.client.addLabel(
      session.todoistTaskId,
      this.config.todoist.labels.blocked,
    );
    await this.client.removeLabel(
      session.todoistTaskId,
      this.config.todoist.labels.inProgress,
    );

    // Mark the session as blocked
    this.sessionManager.markBlocked(session.id);

    return true;
  }

  /**
   * Resume a blocked or awaiting-feedback session with the user's reply.
   */
  async resumeWithReply(
    todoistTaskId: string,
    reply: string,
    pollState: PollState,
    cwd: string,
  ): Promise<ClaudeSession | undefined> {
    const sessionId = this.taskSessionMap.get(todoistTaskId);
    if (!sessionId) {
      log.warn(`No session found for task ${todoistTaskId}`);
      return undefined;
    }

    const session = this.sessionManager.getSession(sessionId);
    if (!session || (session.status !== "blocked" && session.status !== "awaiting-feedback")) {
      log.warn(`Session ${sessionId} is not in a resumable state (status: ${session?.status})`);
      return undefined;
    }

    log.info(`Resuming session ${sessionId} with reply`, {
      todoistTaskId,
      replyPreview: reply.slice(0, 100),
    });

    // Move task back to In Progress
    const inProgressSection = pollState.sections.get(
      this.config.todoist.sections.inProgress,
    );
    if (inProgressSection) {
      await this.client.moveTask(todoistTaskId, inProgressSection.id);
    }

    // Update labels — remove blocked/review, add in-progress
    await this.client.removeLabel(
      todoistTaskId,
      this.config.todoist.labels.blocked,
    );
    await this.client.removeLabel(
      todoistTaskId,
      this.config.todoist.labels.review,
    );
    await this.client.addLabel(
      todoistTaskId,
      this.config.todoist.labels.inProgress,
    );

    // Post acknowledgment
    await this.client.postTaskComment(
      todoistTaskId,
      `[Claude] Received your reply. Resuming work...`,
    );

    // Resume the Claude session
    const resumedSession = await this.sessionManager.resumeSession(
      sessionId,
      reply,
      cwd,
    );

    return resumedSession;
  }

  /**
   * Get the session ID for a task.
   */
  getSessionForTask(todoistTaskId: string): string | undefined {
    return this.taskSessionMap.get(todoistTaskId);
  }

  /**
   * Clean up mappings for a completed task.
   */
  cleanupTask(todoistTaskId: string): void {
    this.taskSessionMap.delete(todoistTaskId);
  }
}
