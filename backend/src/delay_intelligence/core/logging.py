"""Structured logging utilities for the delay intelligence system."""

import logging
import sys
from pathlib import Path
from typing import Optional


def setup_logging(
    level: str = "INFO",
    log_to_file: bool = False,
    log_file: Optional[str] = None,
    format_str: Optional[str] = None,
    date_format: Optional[str] = None,
) -> logging.Logger:
    """Configure structured logging for the application.

    Args:
        level: Logging level ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL').
        log_to_file: Whether to write logs to a file in addition to stdout.
        log_file: Path to log file if log_to_file is True.
        format_str: Custom logging format string.
        date_format: Custom date format string.

    Returns:
        Root logger for 'delay_intelligence'.
    """
    numeric_level = getattr(logging, level.upper(), logging.INFO)
    fmt = format_str or "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    dfmt = date_format or "%Y-%m-%d %H:%M:%S"

    formatter = logging.Formatter(fmt=fmt, datefmt=dfmt)

    root_logger = logging.getLogger("delay_intelligence")
    root_logger.setLevel(numeric_level)
    root_logger.propagate = False

    # Clear existing handlers to prevent duplicate logging
    if root_logger.hasHandlers():
        root_logger.handlers.clear()

    # Stream Handler (stdout)
    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setLevel(numeric_level)
    stream_handler.setFormatter(formatter)
    root_logger.addHandler(stream_handler)

    # Optional File Handler
    if log_to_file and log_file:
        file_path = Path(log_file)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(str(file_path), encoding="utf-8")
        file_handler.setLevel(numeric_level)
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)

    return root_logger


def get_logger(name: str) -> logging.Logger:
    """Get a child logger under the 'delay_intelligence' namespace.

    Args:
        name: Name of the module/subsystem (e.g., 'delay_intelligence.data.scms').

    Returns:
        A configured logging.Logger instance.
    """
    if not name.startswith("delay_intelligence"):
        name = f"delay_intelligence.{name}"
    return logging.getLogger(name)
