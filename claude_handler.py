"""Anthropic / Claude API wrapper."""

import logging

import anthropic

from config import ANTHROPIC_API_KEY, CLAUDE_MODEL, NEEDS_MORE_INFO_MARKER, TASK_COMPLETE_MARKER

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = f"""You are a helpful task assistant integrated with Todoist. \
Your job is to help the user accomplish their tasks by providing clear, actionable guidance, \
writing code, drafting text, researching topics, or whatever the task requires.

Use one of the following markers — on its own line at the very end of your response — \
to indicate the outcome:

• "{TASK_COMPLETE_MARKER}" — append this when the task is fully complete and no further \
action is required from you.

• "{NEEDS_MORE_INFO_MARKER}" — append this when you cannot proceed without additional \
information or clarification from the user.  Clearly state your question(s) before the marker.

If neither condition applies (you have done useful work but the user may want to review \
or continue the conversation), do not append any marker.

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
