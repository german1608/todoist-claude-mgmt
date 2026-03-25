// ---------------------------------------------------------------------------
// Claude Code CLI output types
// Parsed from `claude -p --output-format json` responses
// ---------------------------------------------------------------------------

export interface ClaudeJsonOutput {
  type: "result";
  subtype: "success" | "error_max_turns";
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  result: string;
  stop_reason: string;
  session_id: string;
  total_cost_usd: number;
  usage: ClaudeUsage;
}

export interface ClaudeUsage {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
}

// ---------------------------------------------------------------------------
// Session tracking
// ---------------------------------------------------------------------------

export type SessionStatus =
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "blocked"
  | "resumed"
  | "awaiting-feedback";

export interface ClaudeSession {
  /** Internal session ID (UUID) */
  id: string;

  /** Claude Code session ID (returned in JSON output) */
  claudeSessionId?: string;

  /** The Todoist task ID this session is working on */
  todoistTaskId: string;

  /** PID of the claude child process */
  pid?: number;

  /** Path to the git worktree (for coding tasks) */
  worktreePath?: string;

  /** Branch name in the worktree */
  worktreeBranch?: string;

  /** Current status */
  status: SessionStatus;

  /** The prompt that was sent */
  prompt: string;

  /** Result text from Claude on completion */
  result?: string;

  /** Cost in USD */
  costUsd?: number;

  /** Whether this was an error */
  isError?: boolean;

  /** Timestamp when session started */
  startedAt: Date;

  /** Timestamp when session completed */
  completedAt?: Date;

  /** Number of resume cycles (Q&A rounds) */
  resumeCount: number;
}

// ---------------------------------------------------------------------------
// Spawn options
// ---------------------------------------------------------------------------

export interface SpawnClaudeOptions {
  /** The prompt / task description */
  prompt: string;

  /** Working directory — typically the repo root or worktree */
  cwd: string;

  /** Use a git worktree with this name */
  worktreeName?: string;

  /** Claude session name (for --name flag) */
  sessionName?: string;

  /** Permission mode (default: "auto") */
  permissionMode?: string;

  /** Model override */
  model?: string;

  /** Resume an existing session by ID */
  resumeSessionId?: string;

  /** Additional directories to give Claude access to */
  addDirs?: string[];

  /** Max budget in USD (optional) */
  maxBudgetUsd?: number;

  /** Append to system prompt */
  appendSystemPrompt?: string;
}
