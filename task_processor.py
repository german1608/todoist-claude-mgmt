"""Core business logic: decide when to process a task and orchestrate the flow."""

import logging

from todoist_api_python.models import Comment, Task

from claude_handler import ClaudeHandler
from config import (
    CLAUDE_COMMENT_PREFIX,
    LABEL_BLOCKED,
    LABEL_PENDING,
    LABEL_READY_FOR_REVIEW,
    NEEDS_MORE_INFO_MARKER,
    TASK_COMPLETE_MARKER,
)
from todoist_handler import TodoistHandler

logger = logging.getLogger(__name__)


class TaskProcessor:
    """Fetches claude-labeled tasks from Todoist and processes them with Claude."""

    def __init__(self) -> None:
        self._todoist = TodoistHandler()
        self._claude = ClaudeHandler()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run_once(self) -> None:
        """Fetch all claude-labeled tasks and process each one."""
        tasks = self._todoist.get_claude_tasks()
        logger.info("Found %d task(s) with claude label", len(tasks))

        for task in tasks:
            try:
                self._process_task(task)
            except Exception:
                logger.exception("Error processing task %s (%s)", task.id, task.content)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _process_task(self, task: Task) -> None:
        comments = self._todoist.get_task_comments(task.id)

        if not self._needs_processing(task, comments):
            logger.debug("Skipping task %s — no new input to process", task.id)
            return

        logger.info("Processing task: %s", task.content)

        messages = self._build_conversation(task, comments)
        response = self._claude.chat(messages)

        has_complete = TASK_COMPLETE_MARKER in response
        has_blocked = NEEDS_MORE_INFO_MARKER in response

        # Strip internal markers before posting so users see clean text.
        clean_response = (
            response.replace(TASK_COMPLETE_MARKER, "")
            .replace(NEEDS_MORE_INFO_MARKER, "")
            .strip()
        )
        self._todoist.add_comment(task.id, f"{CLAUDE_COMMENT_PREFIX}{clean_response}")

        if has_complete:
            logger.info("Claude marked task %s as complete — closing it", task.id)
            self._todoist.complete_task(task.id)
        elif has_blocked:
            logger.info(
                "Claude needs more info for task %s — marking as blocked", task.id
            )
            self._todoist.set_task_status_label(task, LABEL_BLOCKED)
        else:
            logger.info(
                "Claude finished a work pass on task %s — marking as ready-for-review",
                task.id,
            )
            self._todoist.set_task_status_label(task, LABEL_READY_FOR_REVIEW)

    def _needs_processing(self, task: Task, comments: list[Comment]) -> bool:
        """Return True when the task has new user input that Claude hasn't answered yet.

        Decision table by current status label
        ───────────────────────────────────────
        ``ready-for-review``  Process only if the user has added a follow-up
                              comment after Claude's last reply (i.e. last
                              comment is not from Claude).
        ``blocked``           Process only if the user has replied to Claude's
                              clarifying question (i.e. last comment is not
                              from Claude).
        ``pending`` / none    Process if there are no comments yet, or if the
                              last comment is not from Claude (same logic as
                              before status labels were introduced).
        """
        labels = set(task.labels or [])
        last_is_claude = bool(comments) and comments[-1].content.startswith(
            CLAUDE_COMMENT_PREFIX
        )

        if LABEL_READY_FOR_REVIEW in labels:
            # Waiting for human review — only re-process if they replied.
            return not last_is_claude and bool(comments)

        if LABEL_BLOCKED in labels:
            # Waiting for user clarification — only re-process if they replied.
            return not last_is_claude and bool(comments)

        # pending / no status label: process if Claude hasn't answered yet.
        return not last_is_claude

    def _build_conversation(self, task: Task, comments: list[Comment]) -> list[dict]:
        """Build the messages list expected by the Anthropic Messages API.

        The conversation is reconstructed from the task content/description
        (first user turn) followed by the task's comment thread, alternating
        between user and assistant turns.  Consecutive same-role messages are
        merged to satisfy the API's strict alternation requirement.
        """
        messages: list[dict] = []

        # --- First user turn: the task itself ---
        first_turn = f"Task: {task.content}"
        if task.description:
            first_turn += f"\n\nDescription: {task.description}"
        self._append_message(messages, "user", first_turn)

        # --- Subsequent turns from the comment thread ---
        for comment in comments:
            if comment.content.startswith(CLAUDE_COMMENT_PREFIX):
                # Remove our prefix and any lingering markers.
                text = comment.content[len(CLAUDE_COMMENT_PREFIX):]
                text = (
                    text.replace(TASK_COMPLETE_MARKER, "")
                    .replace(NEEDS_MORE_INFO_MARKER, "")
                    .strip()
                )
                self._append_message(messages, "assistant", text)
            else:
                self._append_message(messages, "user", comment.content)

        return messages

    @staticmethod
    def _append_message(messages: list[dict], role: str, content: str) -> None:
        """Append a message, merging with the previous one if roles match."""
        if messages and messages[-1]["role"] == role:
            messages[-1]["content"] += f"\n\n{content}"
        else:
            messages.append({"role": role, "content": content})
