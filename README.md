# todoist-claude-mgmt

Assign Todoist tasks to Claude AI.  Tag any task with the **`claude`** label
and this tool will automatically process it with Claude, post the response as
a task comment, and close the task once Claude considers it complete.

---

## How it works

1. The tool polls your Todoist account for active tasks that carry the
   configured label (default: `claude`).
2. For each qualifying task it reconstructs the full conversation from the
   task title, description, and existing comment thread.
3. It sends the conversation to Claude and posts the reply back as a comment
   prefixed with `🤖 **Claude**: `.
4. If Claude's reply contains the internal `[TASK_COMPLETE]` marker the task
   is automatically marked as complete in Todoist.
5. You can continue the conversation at any time by adding a new comment to
   the task — the tool will pick it up on the next poll and reply.

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

| Variable           | Required | Default         | Description                                  |
|--------------------|----------|-----------------|----------------------------------------------|
| `TODOIST_API_TOKEN`| ✅ yes   | —               | Todoist REST API token                       |
| `ANTHROPIC_API_KEY`| ✅ yes   | —               | Anthropic API key                            |
| `CLAUDE_MODEL`     | no       | `claude-opus-4-5` | Anthropic model name                       |
| `POLL_INTERVAL`    | no       | `30`            | Seconds between polls (continuous mode only) |
| `CLAUDE_LABEL`     | no       | `claude`        | Todoist label that triggers processing       |

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
4. Reply with a follow-up comment on the task — Claude will answer on the next poll.
5. Once done, Claude closes the task automatically; or remove the `claude` label
   to stop processing manually.

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
