"""forge.log — Structured logging SDK module.

Replaces Ignition's ``system.util.getLogger()`` with structured JSON logging
correlated with script name and trigger context.

Usage in scripts::

    import forge

    log = forge.log.get("my_script")
    log.info("Temperature reading", tag="TIT_2010", value=78.4)
    log.warning("High temperature detected", area="Distillery01")
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any


class StructuredLogHandler(logging.Handler):
    """Logging handler that emits JSON-structured log records.

    Each log line includes: timestamp, level, script, message, and any
    extra keyword arguments passed to the log call.
    """

    def emit(self, record: logging.LogRecord) -> None:
        entry: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Add extra fields (kwargs passed via ForgeLogger)
        if hasattr(record, "forge_extra"):
            entry.update(record.forge_extra)

        try:
            line = json.dumps(entry, default=str)
        except (TypeError, ValueError):
            line = str(entry)

        sys.stderr.write(line + "\n")


class ForgeLogger:
    """Structured logger for Forge scripts.

    Wraps Python's logging.Logger with methods that accept keyword
    arguments as structured data.
    """

    def __init__(self, name: str) -> None:
        self._name = name
        self._logger = logging.getLogger(f"forge.scripts.{name}")
        if not self._logger.handlers:
            handler = StructuredLogHandler()
            self._logger.addHandler(handler)
            self._logger.setLevel(logging.DEBUG)

    @property
    def name(self) -> str:
        return self._name

    def _log(self, level: int, msg: str, **kwargs: Any) -> None:
        record = self._logger.makeRecord(
            self._logger.name, level, "(script)", 0, msg, (), None
        )
        record.forge_extra = kwargs  # type: ignore
        self._logger.handle(record)

    def debug(self, msg: str, **kwargs: Any) -> None:
        self._log(logging.DEBUG, msg, **kwargs)

    def info(self, msg: str, **kwargs: Any) -> None:
        self._log(logging.INFO, msg, **kwargs)

    def warning(self, msg: str, **kwargs: Any) -> None:
        self._log(logging.WARNING, msg, **kwargs)

    def error(self, msg: str, **kwargs: Any) -> None:
        self._log(logging.ERROR, msg, **kwargs)

    def critical(self, msg: str, **kwargs: Any) -> None:
        self._log(logging.CRITICAL, msg, **kwargs)


class LogModule:
    """The forge.log SDK module — structured logging factory."""

    def __init__(self) -> None:
        self._loggers: dict[str, ForgeLogger] = {}

    def get(self, name: str) -> ForgeLogger:
        """Get or create a named logger.

        Args:
            name: Logger name (typically the script name).

        Returns:
            ForgeLogger with structured JSON output.
        """
        if name not in self._loggers:
            self._loggers[name] = ForgeLogger(name)
        return self._loggers[name]

    def info(self, msg: str, **kwargs: Any) -> None:
        """Convenience: log at INFO level to the 'default' logger."""
        self.get("default").info(msg, **kwargs)

    def warning(self, msg: str, **kwargs: Any) -> None:
        """Convenience: log at WARNING level to the 'default' logger."""
        self.get("default").warning(msg, **kwargs)

    def error(self, msg: str, **kwargs: Any) -> None:
        """Convenience: log at ERROR level to the 'default' logger."""
        self.get("default").error(msg, **kwargs)

    def debug(self, msg: str, **kwargs: Any) -> None:
        """Convenience: log at DEBUG level to the 'default' logger."""
        self.get("default").debug(msg, **kwargs)


# Module-level singleton
_instance = LogModule()

get = _instance.get
info = _instance.info
warning = _instance.warning
error = _instance.error
debug = _instance.debug
