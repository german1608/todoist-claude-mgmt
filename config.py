"""Configuration loaded from environment variables."""

import os

from dotenv import load_dotenv

load_dotenv()

# Required
TODOIST_API_TOKEN: str = os.environ["TODOIST_API_TOKEN"]
ANTHROPIC_API_KEY: str = os.environ["ANTHROPIC_API_KEY"]

# Optional with defaults
CLAUDE_MODEL: str = os.getenv("CLAUDE_MODEL", "claude-opus-4-5")
POLL_INTERVAL: int = int(os.getenv("POLL_INTERVAL", "30"))
MAX_WORKERS: int = int(os.getenv("MAX_WORKERS", "4"))
CLAUDE_LABEL: str = os.getenv("CLAUDE_LABEL", "claude")

# Internal constants
CLAUDE_COMMENT_PREFIX: str = "🤖 **Claude**: "
TASK_COMPLETE_MARKER: str = "[TASK_COMPLETE]"
NEEDS_MORE_INFO_MARKER: str = "[NEEDS_MORE_INFO]"

# Status labels applied to tasks to reflect their current state
LABEL_PENDING: str = os.getenv("LABEL_PENDING", "pending")
LABEL_BLOCKED: str = os.getenv("LABEL_BLOCKED", "blocked")
LABEL_READY_FOR_REVIEW: str = os.getenv("LABEL_READY_FOR_REVIEW", "ready-for-review")

# All status labels managed by this tool (used when swapping state)
STATUS_LABELS: frozenset[str] = frozenset(
    {LABEL_PENDING, LABEL_BLOCKED, LABEL_READY_FOR_REVIEW}
)
