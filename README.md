# todoist-claude-mgmt

Assign Todoist tasks to Claude AI.  Tag any task with the **`claude`** label
and this tool will automatically process it with Claude, post the response as
a task comment, and manage a set of status labels to track each task through
its lifecycle.

---

## How it works

1. The tool polls your Todoist account for active tasks that carry the
   configured label (default: `claude`).
2. For each qualifying task it reconstructs the full conversation from the
   task title, description, and existing comment thread.
3. It sends the conversation to Claude and posts the reply back as a comment
   prefixed with `🤖 **Claude**: `.
4. The task's status label is updated to reflect the outcome (see table below).

### Task lifecycle

| Claude's response ends with | Status label set | What happens next |
|-----------------------------|------------------|-------------------|
| `[TASK_COMPLETE]`           | *(task closed)*  | Task is marked complete in Todoist |
| `[NEEDS_MORE_INFO]`         | `blocked`        | Tool waits; resumes when you reply |
| *(no special marker)*       | `ready-for-review` | You review Claude's work; add a comment to continue |

### Conversation continuation

* **Blocked task** — Claude asked a clarifying question and set the task to
  `blocked`.  Add a comment with your answer and the tool will pick it up on
  the next poll, send the full conversation back to Claude, and continue.
* **Ready-for-review task** — Claude finished a work pass.  Add a comment
  with feedback or a follow-up question and the tool will re-process the task.
* **Remove the `claude` label** at any time to opt a task out of processing.

---

## Requirements

* Python 3.10+
* A [Todoist](https://todoist.com) account with an API token
* An [Anthropic](https://console.anthropic.com) account with an API key

---

## Setup

```bash
# 1. Clone the repository
git clone https://github.com/german1608/todoist-claude-mgmt.git
cd todoist-claude-mgmt

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Configure environment variables
cp .env.example .env
# Edit .env and fill in your TODOIST_API_TOKEN and ANTHROPIC_API_KEY
```

---

## Configuration

All configuration is done via environment variables (or a `.env` file).

| Variable              | Required | Default              | Description                                   |
|-----------------------|----------|----------------------|-----------------------------------------------|
| `TODOIST_API_TOKEN`   | ✅ yes   | —                    | Todoist REST API token                        |
| `ANTHROPIC_API_KEY`   | ✅ yes   | —                    | Anthropic API key                             |
| `CLAUDE_MODEL`        | no       | `claude-opus-4-5`    | Anthropic model name                          |
| `POLL_INTERVAL`       | no       | `30`                 | Seconds between polls (continuous mode only)  |
| `MAX_WORKERS`         | no       | `4`                  | Max tasks processed in parallel               |
| `CLAUDE_LABEL`        | no       | `claude`             | Todoist label that triggers processing        |
| `LABEL_PENDING`       | no       | `pending`            | Label applied to tasks awaiting first pickup  |
| `LABEL_BLOCKED`       | no       | `blocked`            | Label applied when Claude needs more info     |
| `LABEL_READY_FOR_REVIEW` | no    | `ready-for-review`   | Label applied after Claude finishes a pass    |

---

## Usage

```bash
# Run continuously — polls every POLL_INTERVAL seconds
python main.py

# Process all pending tasks once and exit (good for cron jobs)
python main.py --once
```

### Typical workflow

1. Create a Todoist task and add the `claude` label.
2. The tool picks it up within one poll interval.
3. Claude's response appears as a comment on the task.
   * If Claude needs more info, the task is labelled **`blocked`**.
     Reply in a comment and the conversation continues automatically.
   * If Claude finished the work, the task is labelled **`ready-for-review`**.
     Review it, add a comment if you want changes, or remove the label when done.
   * If Claude considers the task fully complete, it is closed automatically.

---

## Project structure

```
main.py            # Entry point — polling loop and CLI flags
config.py          # Environment-variable configuration
todoist_handler.py # Todoist REST API wrapper
claude_handler.py  # Anthropic Messages API wrapper
task_processor.py  # Business logic (conversation building, task lifecycle)
requirements.txt   # Pinned Python dependencies
.env.example       # Template for required environment variables
```
