"""Anthropic / Claude API wrapper."""

import logging

import anthropic

from config import ANTHROPIC_API_KEY, CLAUDE_MODEL, TASK_COMPLETE_MARKER

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = f"""You are a helpful task assistant integrated with Todoist. \
Your job is to help the user accomplish their tasks by providing clear, actionable guidance, \
writing code, drafting text, researching topics, or whatever the task requires.

When you believe a task is fully complete — meaning you have provided everything needed \
and no further action is required from you — append the exact marker \
"{TASK_COMPLETE_MARKER}" on its own line at the very end of your response.

If the task requires follow-up from the user, do NOT include the marker; \
instead ask your clarifying question or describe the next step that the user must take.

Be concise and practical."""


class ClaudeHandler:
    """Wraps the Anthropic Messages API."""

    def __init__(self) -> None:
        self._client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    def chat(self, messages: list[dict]) -> str:
        """Send a list of messages to Claude and return the response text.

        Args:
            messages: A list of ``{"role": "user"|"assistant", "content": str}``
                dicts representing the full conversation so far.

        Returns:
            Claude's reply as a plain string.
        """
        logger.debug("Sending %d message(s) to Claude (%s)", len(messages), CLAUDE_MODEL)
        response = self._client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=2048,
            system=_SYSTEM_PROMPT,
            messages=messages,  # type: ignore[arg-type]
        )
        text: str = response.content[0].text
        logger.debug("Claude responded with %d chars", len(text))
        return text
