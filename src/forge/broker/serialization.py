"""Message serialization for broker payloads.

Handles JSON encoding/decoding of ContextualRecord payloads for
RabbitMQ message bodies. Matches the payload format used by adapters.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any


def serialize_record(record: Any) -> bytes:
    """Serialize a ContextualRecord (or dict) to JSON bytes for publishing.

    Handles datetime serialization and Pydantic model conversion.
    """
    if hasattr(record, "model_dump"):
        data = record.model_dump(mode="json")
    elif hasattr(record, "__dict__"):
        data = _dataclass_to_dict(record)
    elif isinstance(record, dict):
        data = record
    else:
        msg = f"Cannot serialize {type(record).__name__}"
        raise TypeError(msg)

    return json.dumps(data, default=_json_default, separators=(",", ":")).encode("utf-8")


def deserialize_record(body: bytes) -> dict[str, Any]:
    """Deserialize JSON bytes from a broker message into a dict.

    Returns raw dict; caller is responsible for constructing domain objects.
    """
    return json.loads(body.decode("utf-8"))


def _json_default(obj: Any) -> Any:
    """JSON serializer fallback for non-standard types."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    if hasattr(obj, "value"):  # Enum
        return obj.value
    msg = f"Object of type {type(obj).__name__} is not JSON serializable"
    raise TypeError(msg)


def _dataclass_to_dict(obj: Any) -> dict[str, Any]:
    """Convert a dataclass instance to a dict, handling nested objects."""
    from dataclasses import asdict, fields

    if not fields(obj):
        return {}
    return asdict(obj)
