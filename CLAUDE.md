# Todoist-Claude Task Dispatcher

A TypeScript service that bridges Todoist and Claude Code, dispatching your tasks to autonomous Claude sessions with full lifecycle tracking in Todoist.

## What It Does

- **Polls Todoist** for tasks labeled `@claude` or in the "Claude Tasks" project
- **Spawns headless Claude Code sessions** (`claude -p`) in isolated git worktrees
- **Tracks progress** by moving tasks through Todoist sections: Queued → In Progress → Blocked → Review → Done
- **Async Q&A via Todoist comments**: Claude asks questions as comments, you reply, and the session resumes
- **Session continuity**: Completed tasks move to Review — reply with follow-up changes and the same Claude session resumes with full context
- **Supports concurrent sessions** (configurable, default 5)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TODOIST (Your Dashboard)                  │
│  Project: "Claude Tasks"                                    │
│  ┌──────────┐  ┌──────────────┐  ┌────────┐  ┌──────────┐  ┌────────┐  │
│  │ Queued   │  │ In Progress  │  │Blocked │  │ Review   │  │  Done  │  │
│  └──────────┘  └──────────────┘  └────────┘  └──────────┘  └────────┘  │
│  OR: Any project, tagged with @claude label                 │
└──────────────────────────┬──────────────────────────────────┘
                           │ poll / update / comment
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     DISPATCHER SERVICE                       │
│  Scheduler → Router → Session Manager → Concurrency Pool    │
│  Todoist Client ↔ Comment Q&A Loop ↔ PR Monitor             │
└──────────────────────────┬──────────────────────────────────┘
                           │ spawn claude -p --worktree
                           ▼
┌─────────────────────────────────────────────────────────────┐
│         CLAUDE CODE SESSIONS (up to 5 concurrent)           │
│  Each session runs in its own git worktree with --auto mode │
└─────────────────────────────────────────────────────────────┘
```

## Task Types

### Coding Tasks
- Default task type
- Claude works in an isolated git worktree
- Commits changes, can create PRs
- Uses `@coding` label (optional, auto-detected)

### PR Monitor Tasks
- Gets PRs to a ready-to-merge state
- Fixes merge conflicts, responds to review comments, investigates CI failures
- Uses `@pr-monitor` label
- Supports both GitHub (`gh` CLI) and Azure DevOps (`az repos pr`)

## Task Description Conventions

### Coding Task
```
Repo: https://github.com/user/repo
Branch: main
Description: Implement the feature...
```

### PR Monitor Task
```
PR: https://github.com/user/repo/pull/123
Target: main
Actions: fix-conflicts, reply-comments
```

## Q&A Flow

1. Claude encounters something it can't resolve autonomously
2. Dispatcher posts Claude's question as a Todoist comment (prefixed `[Claude]`)
3. Task moves to "Blocked" section with `@blocked` label
4. You reply to the comment in Todoist
5. Dispatcher detects the reply, resumes Claude's session with your answer
6. Task moves back to "In Progress"

## Review Flow (Session Continuity)

1. Claude completes the task, creates a PR
2. Task moves to "Review" section with `@review` label
3. Claude posts a summary + "reply with changes" prompt
4. You review the PR; reply to the task with follow-up requests
5. Dispatcher resumes the **same Claude session** (`--resume`) with full context
6. Task moves back to "In Progress", Claude makes your requested changes
7. Repeat until satisfied — close the task in Todoist when done

## Project Structure

```
src/
├── index.ts                    # Entry point
├── config.ts                   # Env-based configuration
├── todoist/
│   ├── client.ts               # Todoist REST API wrapper
│   ├── types.ts                # API type definitions
│   └── polling.ts              # Poll for tasks & replies
├── claude/
│   ├── session.ts              # Spawn/track/resume claude -p processes
│   ├── worktree.ts             # Git worktree lifecycle
│   └── types.ts                # CLI output types
├── dispatcher/
│   ├── scheduler.ts            # Main polling loop
│   ├── router.ts               # Task type detection & routing
│   └── concurrency.ts          # Session pool & queue
├── handlers/
│   ├── base-handler.ts         # Handler interface
│   ├── coding-task.ts          # Coding assignment handler
│   └── pr-monitor.ts           # PR monitoring handler
├── qa/
│   └── comment-loop.ts         # Todoist comment Q&A bridge
└── utils/
    ├── logger.ts               # Structured logging
    └── git.ts                  # Git/platform helpers
```

## Configuration

Copy `.env.example` to `.env` and set your `TODOIST_API_TOKEN`.

Key settings:
- `TODOIST_API_TOKEN` — Required. Get from Todoist Settings → Integrations → Developer
- `MAX_CONCURRENT_SESSIONS` — Max parallel Claude sessions (default: 5)
- `CLAUDE_PERMISSION_MODE` — `auto` (default), `acceptEdits`, or `dangerously-skip-permissions`
- `POLL_INTERVAL_MS` — How often to poll Todoist (default: 60000ms)

## Running

```bash
npm install
npm run build
npm start

# Or for development:
npm run dev
```

## Todoist Labels

| Label         | Purpose                                |
|--------------|----------------------------------------|
| `claude`     | Marks task for Claude dispatch          |
| `in-progress`| Claude is actively working              |
| `blocked`    | Waiting for your reply (Q&A)            |
| `review`     | Task complete, awaiting your feedback   |
| `pr-monitor` | PR monitoring task type                 |
| `coding`     | Coding task type (default if unlabeled) |

## How Claude Sessions Work

Each session runs:
```
claude -p \
  --worktree todoist-<id>-<slug> \
  --output-format json \
  --permission-mode auto \
  --name "todoist-<task-id>" \
  "<prompt>"
```

Sessions inherit your filesystem skills and CLAUDE.md context.
Resume uses: `claude -p --resume <session_id> "<reply>"`
