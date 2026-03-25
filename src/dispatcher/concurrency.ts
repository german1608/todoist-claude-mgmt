import { createLogger } from "../utils/logger.js";
import type { ClaudeSession } from "../claude/types.js";

const log = createLogger("Concurrency");

interface QueuedTask {
  id: string;
  execute: () => Promise<ClaudeSession>;
  resolve: (session: ClaudeSession) => void;
  reject: (error: Error) => void;
}

/**
 * Manages concurrency limits for Claude sessions.
 * Queues excess tasks and dispatches them as slots open up.
 */
export class ConcurrencyManager {
  private readonly maxConcurrent: number;
  private activeCount = 0;
  private queue: QueuedTask[] = [];

  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
    log.info(`Concurrency manager initialized`, {
      maxConcurrent,
    });
  }

  /**
   * Whether there's capacity to start a new session.
   */
  get hasCapacity(): boolean {
    return this.activeCount < this.maxConcurrent;
  }

  /**
   * Current active session count.
   */
  get active(): number {
    return this.activeCount;
  }

  /**
   * Number of tasks waiting in queue.
   */
  get queued(): number {
    return this.queue.length;
  }

  /**
   * Execute a task, respecting concurrency limits.
   * If at capacity, the task is queued and the returned promise
   * resolves when the task eventually runs.
   */
  async execute(
    taskId: string,
    fn: () => Promise<ClaudeSession>,
  ): Promise<ClaudeSession> {
    if (this.hasCapacity) {
      return this.run(taskId, fn);
    }

    log.info(`Queuing task ${taskId} (active: ${this.activeCount}/${this.maxConcurrent}, queued: ${this.queue.length})`);

    return new Promise<ClaudeSession>((resolve, reject) => {
      this.queue.push({ id: taskId, execute: fn, resolve, reject });
    });
  }

  /**
   * Signal that a session has completed, freeing a slot.
   */
  release(): void {
    this.activeCount = Math.max(0, this.activeCount - 1);
    log.debug(`Slot released (active: ${this.activeCount}/${this.maxConcurrent}, queued: ${this.queue.length})`);
    this.tryDequeue();
  }

  /**
   * Get status summary.
   */
  getStatus(): { active: number; queued: number; max: number } {
    return {
      active: this.activeCount,
      queued: this.queue.length,
      max: this.maxConcurrent,
    };
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private async run(
    taskId: string,
    fn: () => Promise<ClaudeSession>,
  ): Promise<ClaudeSession> {
    this.activeCount++;
    log.debug(`Starting task ${taskId} (active: ${this.activeCount}/${this.maxConcurrent})`);

    try {
      const session = await fn();
      return session;
    } catch (err) {
      this.release();
      throw err;
    }
  }

  private tryDequeue(): void {
    if (!this.hasCapacity || this.queue.length === 0) return;

    const next = this.queue.shift()!;
    log.info(`Dequeuing task ${next.id}`);

    this.run(next.id, next.execute).then(next.resolve).catch(next.reject);
  }
}
