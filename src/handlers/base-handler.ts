import type { DispatchableTask, TodoistTask } from "../todoist/types.js";
import type { ClaudeSession, SpawnClaudeOptions } from "../claude/types.js";
import type { Config } from "../config.js";

/**
 * Base interface for all task handlers.
 * Each handler knows how to build a Claude prompt and handle completion.
 */
export interface TaskHandler {
  /**
   * Identifier for this handler type.
   */
  readonly type: string;

  /**
   * Build the spawn options for a Claude session to handle this task.
   */
  buildSpawnOptions(
    task: DispatchableTask,
    config: Config,
  ): SpawnClaudeOptions;

  /**
   * Process the result when a session completes.
   * Returns a summary string to post as a Todoist comment.
   */
  formatCompletionSummary(
    task: DispatchableTask,
    session: ClaudeSession,
  ): string;

  /**
   * Determine if the session output indicates Claude needs user input.
   * Returns the question text if blocked, or null if not.
   */
  detectQuestion(output: string): string | null;
}
