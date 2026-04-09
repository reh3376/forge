"""Write validation layer.

First gate in the control write defense chain.  Validates that the
requested value is physically plausible for the target tag:

1. Tag must exist in the config registry and be writable.
2. Value must be coercible to the tag's declared data type.
3. Numeric values must fall within the tag's engineering range.

The validator is *stateless* — it never reads from OPC-UA or any
external source.  All decisions are based on the TagWriteConfig
registry, which is populated at startup or via API.

Design notes:
- TagWriteConfig.validate_value() does the actual type/range math.
  This class wraps it with registry lookup and result population.
- Wildcard config (tag_pattern with fnmatch) is *not* supported here —
  each tag must be explicitly registered.  This is deliberate: you
  should know every tag you intend to write to.
"""

from __future__ import annotations

from forge.modules.ot.control.models import (
    TagWriteConfig,
    WriteRequest,
    WriteResult,
    WriteStatus,
)


class WriteValidator:
    """Validates write requests against per-tag configuration.

    Usage::

        validator = WriteValidator()
        validator.register_tag(TagWriteConfig(
            tag_path="WH/WHK01/Distillery01/TIT_2010/SP",
            data_type=DataType.FLOAT,
            min_value=0.0,
            max_value=200.0,
            engineering_units="°F",
        ))

        result = validator.validate(request, result)
        # result.validation_passed is True/False
    """

    def __init__(self) -> None:
        self._configs: dict[str, TagWriteConfig] = {}

    # -- Registry ------------------------------------------------------------

    def register_tag(self, config: TagWriteConfig) -> None:
        """Register (or replace) a tag's write configuration."""
        self._configs[config.tag_path] = config

    def unregister_tag(self, tag_path: str) -> bool:
        """Remove a tag config. Returns True if it existed."""
        return self._configs.pop(tag_path, None) is not None

    def get_config(self, tag_path: str) -> TagWriteConfig | None:
        """Look up the write config for a tag path."""
        return self._configs.get(tag_path)

    def get_all_configs(self) -> list[TagWriteConfig]:
        """Return all registered tag configs."""
        return list(self._configs.values())

    @property
    def tag_count(self) -> int:
        return len(self._configs)

    # -- Validation ----------------------------------------------------------

    def validate(self, request: WriteRequest, result: WriteResult) -> WriteResult:
        """Run type/range validation.  Mutates and returns *result*.

        On failure, sets ``result.status`` to REJECTED_VALIDATION and
        populates ``result.validation_error``.  On success, sets
        ``result.validation_passed = True`` without touching status
        (the next layer decides the final status).
        """
        config = self._configs.get(request.tag_path)

        if config is None:
            result.validation_passed = False
            result.validation_error = (
                f"No write config registered for tag: {request.tag_path}"
            )
            result.status = WriteStatus.REJECTED_VALIDATION
            return result

        ok, error = config.validate_value(request.value)

        if not ok:
            result.validation_passed = False
            result.validation_error = error
            result.status = WriteStatus.REJECTED_VALIDATION
            return result

        result.validation_passed = True
        return result
