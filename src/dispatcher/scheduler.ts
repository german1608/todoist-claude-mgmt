import { createLogger } from "../utils/logger.js";
import type { Config } from "../config.js";
import { TodoistClient } from "../todoist/client.js";
import { SessionManager } from "../claude/session.js";
import { ConcurrencyManager } from "./concurrency.js";
import { routeTask } from "./router.js";
import { CommentQALoop } from "../qa/comment-loop.js";
import {
  type PollState,
  initPollState,
  pollNewTasks,
  pollBlockedTaskReplies,
  pollReviewTaskReplies,
} from "../todoist/polling.js";
import { CodingTaskHandler } from "../handlers/coding-task.js";
import { PrMonitorHandler } from "../handlers/pr-monitor.js";
import type { TaskHandler } from "../handlers/base-handler.js";
import type { DispatchableTask } from "../todoist/types.js";

const log = createLogger("Scheduler");

/**
 * The main scheduler — orchestrates polling, dispatching, and session tracking.
 */
export class Scheduler {
  private readonly client: TodoistClient;
  private readonly sessionManager: SessionManager;
  private readonly concurrency: ConcurrencyManager;
  private readonly qaLoop: CommentQALoop;
  private readonly config: Config;
  private readonly handlers: Map<string, TaskHandler>;
  private pollState!: PollState;
  private intervalId?: ReturnType<typeof setInterval>;
  private isRunning = false;

  /** Track which Todoist task IDs are already dispatched (to avoid double-dispatch) */
  private dispatchedTasks = new Set<string>();

  /** Track handler type per task for completion handling */
  private taskHandlers = new Map<string, TaskHandler>();

  /** Track DispatchableTask per Todoist task ID for completion handling */
  private taskDetails = new Map<string, DispatchableTask>();

  constructor(config: Config) {
    this.config = config;
    this.client = new TodoistClient(config.todoist.apiToken);
    this.sessionManager = new SessionManager();
    this.concurrency = new ConcurrencyManager(
      config.claude.maxConcurrentSessions,
    );
    this.qaLoop = new CommentQALoop(
      this.client,
      this.sessionManager,
      config,
    );

    // Register handlers
    this.handlers = new Map<string, TaskHandler>([
      ["coding", new CodingTaskHandler()],
      ["pr-monitor", new PrMonitorHandler()],
    ]);
  }

  /**
   * Initialize the scheduler — sets up Todoist project/sections/labels.
   */
  async init(): Promise<void> {
    log.info("Initializing scheduler...");
    this.pollState = await initPollState(this.client, this.config);
    log.info("Scheduler initialized successfully");
  }

  /**
   * Start the polling loop.
   */
  start(): void {
    if (this.isRunning) {
      log.warn("Scheduler is already running");
      return;
    }

    this.isRunning = true;
    log.info(
      `Starting scheduler (poll interval: ${this.config.todoist.pollIntervalMs}ms)`,
    );

    // Run immediately on start
    void this.tick();

    this.intervalId = setInterval(() => {
      void this.tick();
    }, this.config.todoist.pollIntervalMs);
  }

  /**
   * Stop the polling loop and clean up.
   */
  stop(): void {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    log.info("Scheduler stopped");
  }

  /**
   * Graceful shutdown — stop polling and kill all sessions.
   */
  async shutdown(): Promise<void> {
    log.info("Shutting down scheduler...");
    this.stop();
    this.sessionManager.killAll();
    log.info("Scheduler shut down");
  }

  /**
   * Get current status.
   */
  getStatus(): {
    isRunning: boolean;
    concurrency: { active: number; queued: number; max: number };
    dispatchedTasks: number;
  } {
    return {
      isRunning: this.isRunning,
      concurrency: this.concurrency.getStatus(),
      dispatchedTasks: this.dispatchedTasks.size,
    };
  }

  // -----------------------------------------------------------------------
  // Main tick
  // -----------------------------------------------------------------------

  private async tick(): Promise<void> {
    try {
      log.debug("--- Poll tick ---");

      // 1. Check completed sessions
      await this.processCompletedSessions();

      // 2. Poll for new tasks
      await this.dispatchNewTasks();

      // 3. Poll for replies to blocked tasks (Claude asked a question)
      await this.processBlockedReplies();

      // 4. Poll for follow-up replies on review tasks (user wants changes)
      await this.processReviewReplies();

      const status = this.concurrency.getStatus();
      log.debug(`Tick complete`, {
        active: status.active,
        queued: status.queued,
        dispatched: this.dispatchedTasks.size,
      });
    } catch (err) {
      log.error("Error in scheduler tick", {
        error: (err as Error).message,
        stack: (err as Error).stack,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Step 1: Process completed sessions
  // -----------------------------------------------------------------------

  private async processCompletedSessions(): Promise<void> {
    const completed = this.sessionManager.getCompletedSessions();

    for (const session of completed) {
      try {
        const handler = this.taskHandlers.get(session.todoistTaskId);
        const task = this.taskDetails.get(session.todoistTaskId);

        if (!handler || !task) {
          log.warn(
            `No handler/task found for completed session ${session.id}`,
          );
          continue;
        }

        // Check if Claude has a question (blocked)
        const isBlocked = await this.qaLoop.handleSessionCompletion(
          session,
          handler,
          this.pollState,
        );

        if (isBlocked) {
          log.info(
            `Task ${session.todoistTaskId} is now blocked — waiting for reply`,
          );
          continue;
        }

        // Task completed — post summary and move to Review (not Done).
        // Session stays alive so user can reply with follow-up changes
        // and we resume the same Claude session with full context.
        const summary = handler.formatCompletionSummary(task, session);
        await this.client.postTaskComment(session.todoistTaskId, summary);

        if (session.isError) {
          // Failed tasks go straight to Done — no point waiting for review
          const doneSection = this.pollState.sections.get(
            this.config.todoist.sections.done,
          );
          if (doneSection) {
            await this.client.moveTask(session.todoistTaskId, doneSection.id);
          }
          await this.client.removeLabel(
            session.todoistTaskId,
            this.config.todoist.labels.inProgress,
          );

          // Clean up fully
          this.concurrency.release();
          this.dispatchedTasks.delete(session.todoistTaskId);
          this.taskHandlers.delete(session.todoistTaskId);
          this.taskDetails.delete(session.todoistTaskId);
          this.qaLoop.cleanupTask(session.todoistTaskId);

          log.info(`Task ${session.todoistTaskId} FAILED`, {
            cost: session.costUsd,
          });
        } else {
          // Successful → move to Review, keep session resumable
          const reviewSection = this.pollState.sections.get(
            this.config.todoist.sections.review,
          );
          if (reviewSection) {
            await this.client.moveTask(session.todoistTaskId, reviewSection.id);
          }

          await this.client.removeLabel(
            session.todoistTaskId,
            this.config.todoist.labels.inProgress,
          );
          await this.client.addLabel(
            session.todoistTaskId,
            this.config.todoist.labels.review,
          );

          // Post instructions for the user
          await this.client.postTaskComment(
            session.todoistTaskId,
            `[Claude] Task complete. Reply to this task with any changes you'd like — I'll resume with full context. Close the task when you're satisfied.`,
          );

          // Mark session as awaiting feedback — keeps it tracked and resumable
          // but frees the concurrency slot
          this.sessionManager.markAwaitingFeedback(session.id);
          this.concurrency.release();

          log.info(
            `Task ${session.todoistTaskId} COMPLETED → moved to Review (session preserved)`,
            { cost: session.costUsd },
          );
        }
      } catch (err) {
        log.error(
          `Error processing completed session ${session.id}`,
          { error: (err as Error).message },
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // Step 2: Dispatch new tasks
  // -----------------------------------------------------------------------

  private async dispatchNewTasks(): Promise<void> {
    if (!this.concurrency.hasCapacity) {
      log.debug("No capacity for new tasks");
      return;
    }

    const newTasks = await pollNewTasks(
      this.client,
      this.config,
      this.pollState,
    );

    for (const todoistTask of newTasks) {
      if (this.dispatchedTasks.has(todoistTask.id)) {
        continue;
      }

      // Route the task
      const dispatchable = routeTask(todoistTask, this.config);
      const handler =
        this.handlers.get(dispatchable.taskType) ??
        this.handlers.get("coding")!;

      // Mark as dispatched to avoid double-dispatch
      this.dispatchedTasks.add(todoistTask.id);
      this.taskHandlers.set(todoistTask.id, handler);
      this.taskDetails.set(todoistTask.id, dispatchable);

      // If the task lives in a different project, move it into "Claude Tasks"
      // so all section transitions (In Progress, Blocked, Review, Done) work correctly
      const inProgressSection = this.pollState.sections.get(
        this.config.todoist.sections.inProgress,
      );
      if (todoistTask.project_id !== this.pollState.projectId) {
        log.info(
          `Moving task ${todoistTask.id} from project ${todoistTask.project_id} into Claude Tasks`,
        );
        if (inProgressSection) {
          await this.client.moveTaskToProject(
            todoistTask.id,
            this.pollState.projectId,
            inProgressSection.id,
          );
        } else {
          await this.client.moveTaskToProject(
            todoistTask.id,
            this.pollState.projectId,
          );
        }
      } else if (inProgressSection) {
        // Already in Claude Tasks — just move to In Progress section
        await this.client.moveTask(todoistTask.id, inProgressSection.id);
      }

      // Add @in-progress label
      await this.client.addLabel(
        todoistTask.id,
        this.config.todoist.labels.inProgress,
      );

      // Post start comment
      await this.client.postTaskComment(
        todoistTask.id,
        `[Claude] Starting work on this task (type: ${dispatchable.taskType})...`,
      );

      // Build spawn options and dispatch
      const spawnOptions = handler.buildSpawnOptions(
        dispatchable,
        this.config,
      );

      void this.concurrency.execute(todoistTask.id, async () => {
        const session = await this.sessionManager.spawnSession(
          todoistTask.id,
          spawnOptions,
        );
        this.qaLoop.registerSession(todoistTask.id, session.id);
        return session;
      });

      log.info(`Dispatched task: "${todoistTask.content}"`, {
        taskId: todoistTask.id,
        type: dispatchable.taskType,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Step 3: Process replies to blocked tasks
  // -----------------------------------------------------------------------

  private async processBlockedReplies(): Promise<void> {
    const replies = await pollBlockedTaskReplies(
      this.client,
      this.config,
      this.pollState,
    );

    for (const { task, newComments } of replies) {
      // Take the latest comment as the reply
      const latestReply = newComments[newComments.length - 1];
      if (!latestReply) continue;

      log.info(`Got reply for blocked task ${task.id}`, {
        preview: latestReply.content.slice(0, 100),
      });

      const cwd = this.config.claude.defaultRepoPath;

      await this.qaLoop.resumeWithReply(
        task.id,
        latestReply.content,
        this.pollState,
        cwd,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Step 4: Process follow-up replies on review tasks
  // -----------------------------------------------------------------------

  private async processReviewReplies(): Promise<void> {
    const replies = await pollReviewTaskReplies(
      this.client,
      this.config,
      this.pollState,
    );

    for (const { task, newComments } of replies) {
      const latestReply = newComments[newComments.length - 1];
      if (!latestReply) continue;

      log.info(`Got follow-up for review task ${task.id}`, {
        preview: latestReply.content.slice(0, 100),
      });

      const cwd = this.config.claude.defaultRepoPath;

      // Resume the same session — qaLoop.resumeWithReply now accepts
      // "awaiting-feedback" status, so the same Claude session continues
      // with full conversation context
      const resumed = await this.qaLoop.resumeWithReply(
        task.id,
        latestReply.content,
        this.pollState,
        cwd,
      );

      if (resumed) {
        // Re-acquire a concurrency slot since we're running again
        // (the slot was released when session moved to review)
        log.info(
          `Resumed review task ${task.id} — session continues with follow-up`,
        );
      }
    }
  }
}
