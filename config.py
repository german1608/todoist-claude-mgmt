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
CLAUDE_LABEL: str = os.getenv("CLAUDE_LABEL", "claude")

# Internal constants
CLAUDE_COMMENT_PREFIX: str = "🤖 **Claude**: "
TASK_COMPLETE_MARKER: str = "[TASK_COMPLETE]"
