#!/usr/bin/env python3
"""
todoist-claude-mgmt — entry point.

Polls Todoist for tasks labelled "claude" and delegates them to Claude AI.
Claude's responses are posted back as task comments.  When Claude considers
a task complete it appends [TASK_COMPLETE] and the task is closed automatically.

Usage
-----
    # Run continuously (default, polls every POLL_INTERVAL seconds):
    python main.py

    # Process tasks once then exit (useful for cron / one-shot runs):
    python main.py --once
"""

import argparse
import logging
import sys
import time

from config import POLL_INTERVAL
from task_processor import TaskProcessor

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Process Todoist tasks labelled 'claude' using Claude AI."
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Process tasks once and exit instead of running continuously.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    processor = TaskProcessor()

    if args.once:
        logger.info("Running in one-shot mode")
        processor.run_once()
        return

    logger.info("Starting continuous polling (interval: %ds)", POLL_INTERVAL)
    while True:
        try:
            processor.run_once()
        except KeyboardInterrupt:
            logger.info("Interrupted — shutting down")
            sys.exit(0)
        except Exception:
            logger.exception("Unexpected error during polling cycle")

        try:
            time.sleep(POLL_INTERVAL)
        except KeyboardInterrupt:
            logger.info("Interrupted — shutting down")
            sys.exit(0)


if __name__ == "__main__":
    main()
