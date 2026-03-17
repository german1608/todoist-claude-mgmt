"""Todoist API wrapper."""

import logging

from todoist_api_python.api import TodoistAPI
from todoist_api_python.models import Comment, Task

from config import CLAUDE_LABEL, STATUS_LABELS, TODOIST_API_TOKEN

logger = logging.getLogger(__name__)


class TodoistHandler:
    """Wraps the Todoist REST API for the operations needed by this tool."""

    def __init__(self) -> None:
        self._api = TodoistAPI(TODOIST_API_TOKEN)

    # ------------------------------------------------------------------
    # Tasks
    # ------------------------------------------------------------------

    def get_claude_tasks(self) -> list[Task]:
        """Return all active tasks that carry the configured claude label."""
        tasks: list[Task] = []
        for page in self._api.get_tasks(label=CLAUDE_LABEL):
            tasks.extend(page)
        logger.debug("Fetched %d task(s) with label '%s'", len(tasks), CLAUDE_LABEL)
        return tasks

    def complete_task(self, task_id: str) -> None:
        """Mark a task as complete."""
        self._api.complete_task(task_id)
        logger.info("Completed task %s", task_id)

    # ------------------------------------------------------------------
    # Comments
    # ------------------------------------------------------------------

    def get_task_comments(self, task_id: str) -> list[Comment]:
        """Return all comments for a task, oldest first."""
        comments: list[Comment] = []
        for page in self._api.get_comments(task_id=task_id):
            comments.extend(page)
        comments.sort(key=lambda c: c.posted_at)
        return comments

    def add_comment(self, task_id: str, content: str) -> Comment:
        """Add a comment to a task and return the new Comment."""
        comment = self._api.add_comment(content, task_id=task_id)
        logger.debug("Added comment to task %s", task_id)
        return comment

    # ------------------------------------------------------------------
    # Labels
    # ------------------------------------------------------------------

    def set_task_status_label(self, task: Task, new_status: str | None) -> None:
        """Replace any existing status label on *task* with *new_status*.

        All labels in ``STATUS_LABELS`` are considered status labels managed
        by this tool.  Any other labels on the task (e.g. ``claude``) are
        preserved unchanged.

        Args:
            task: The task whose labels should be updated.
            new_status: The status label to set, or ``None`` to clear all
                status labels without adding a new one.
        """
        current = list(task.labels or [])
        updated = [lbl for lbl in current if lbl not in STATUS_LABELS]
        if new_status is not None:
            updated.append(new_status)
        if sorted(updated) == sorted(current):
            return  # nothing to do
        self._api.update_task(task.id, labels=updated)
        logger.debug(
            "Updated labels on task %s: %s → %s", task.id, current, updated
        )
