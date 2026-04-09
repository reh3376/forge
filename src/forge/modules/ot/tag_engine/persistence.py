"""Tag persistence — JSON definition files and optional value persistence.

Tag definitions are stored as JSON files (Git-native).  This means tag
configurations can be:
    - Version-controlled alongside the codebase
    - Reviewed in PRs (unlike Ignition's opaque XML exports)
    - Diff'd for change history
    - Deployed via CI/CD

Runtime values are ephemeral (in-memory) by default.  Memory tags with
`persist=True` can optionally save their values to a JSON sidecar file
that is loaded on startup.

File layout:
    tags/
        distillery01/
            utility01.tags.json      # tag definitions for this area
            fermentation01.tags.json
        granary/
            ...
    tags/.values.json                # persisted Memory tag values (optional)
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter

from forge.modules.ot.tag_engine.models import (
    MemoryTag,
    TagUnion,
    TagValue,
)
from forge.modules.ot.tag_engine.registry import TagRegistry

logger = logging.getLogger(__name__)

_tag_adapter = TypeAdapter(TagUnion)


async def load_tags_from_directory(
    registry: TagRegistry,
    directory: Path,
    *,
    recursive: bool = True,
) -> int:
    """Load tag definitions from JSON files in a directory.

    Each .tags.json file contains a list of tag definition objects.
    Returns the total number of tags loaded.
    """
    if not directory.exists():
        logger.warning("Tag directory does not exist: %s", directory)
        return 0

    pattern = "**/*.tags.json" if recursive else "*.tags.json"
    total = 0

    for tag_file in sorted(directory.glob(pattern)):
        try:
            data = json.loads(tag_file.read_text(encoding="utf-8"))
            if not isinstance(data, list):
                logger.warning("Expected list in %s, got %s", tag_file, type(data).__name__)
                continue

            tags: list[TagUnion] = []
            for item in data:
                try:
                    tag = _tag_adapter.validate_python(item)
                    tags.append(tag)
                except Exception as e:
                    logger.warning("Invalid tag definition in %s: %s", tag_file, e)

            count = await registry.register_many(tags)
            total += count
            logger.info("Loaded %d tags from %s", count, tag_file.name)

        except json.JSONDecodeError as e:
            logger.error("JSON parse error in %s: %s", tag_file, e)
        except Exception:
            logger.exception("Failed to load %s", tag_file)

    return total


async def save_tags_to_file(
    registry: TagRegistry,
    file_path: Path,
) -> int:
    """Save all tag definitions to a single JSON file.

    Returns the number of tags saved.
    """
    definitions = await registry.to_definitions_list()
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(
        json.dumps(definitions, indent=2, default=str) + "\n",
        encoding="utf-8",
    )
    logger.info("Saved %d tag definitions to %s", len(definitions), file_path)
    return len(definitions)


async def load_persisted_values(
    registry: TagRegistry,
    values_file: Path,
) -> int:
    """Load persisted Memory tag values from a JSON sidecar file.

    Only restores values for Memory tags that have persist=True.
    Returns the count of values restored.
    """
    if not values_file.exists():
        return 0

    try:
        data = json.loads(values_file.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        logger.error("Failed to read persisted values: %s", e)
        return 0

    if not isinstance(data, dict):
        return 0

    restored = 0
    for path, saved_value in data.items():
        tag = await registry.get_definition(path)
        if tag is None:
            continue
        if not isinstance(tag, MemoryTag) or not tag.persist:
            continue

        await registry.update_value(path, saved_value)
        restored += 1

    logger.info("Restored %d persisted Memory tag values", restored)
    return restored


async def save_persisted_values(
    registry: TagRegistry,
    values_file: Path,
) -> int:
    """Save Memory tag values (persist=True only) to a JSON sidecar file.

    Returns the count of values saved.
    """
    from forge.modules.ot.tag_engine.models import MemoryTag

    values: dict[str, Any] = {}
    tags = await registry.find_by_type(MemoryTag.model_fields["tag_type"].default)
    # The above returns BaseTag objects — we need to filter for MemoryTag
    # and check persist flag
    for tag in tags:
        if isinstance(tag, MemoryTag) and tag.persist:
            tv = await registry.get_value(tag.path)
            if tv is not None and tv.value is not None:
                values[tag.path] = tv.value

    values_file.parent.mkdir(parents=True, exist_ok=True)
    values_file.write_text(
        json.dumps(values, indent=2, default=str) + "\n",
        encoding="utf-8",
    )
    logger.info("Saved %d persisted Memory tag values", len(values))
    return len(values)
