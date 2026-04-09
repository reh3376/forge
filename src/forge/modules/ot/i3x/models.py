"""i3X response models — CESMII-shaped Pydantic types.

Based on the CESMII i3X specification (https://github.com/cesmii/i3X),
adapted for Forge's FxTS governance model.  These models define the
shape of all i3X API responses.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class I3xNamespace(BaseModel):
    """An i3X namespace — maps to a PLC connection in Forge.

    In i3X, a namespace is a logical grouping of objects that share
    a common communication path.  In Forge, each PLC connection
    (OPC-UA endpoint) is one namespace.
    """

    id: str = Field(description="Namespace identifier (PLC connection name)")
    name: str = Field(description="Human-readable name")
    protocol: str = Field(default="opcua", description="Communication protocol")
    endpoint_url: str = Field(default="", description="OPC-UA endpoint URL")
    status: str = Field(default="unknown", description="Connection status")
    tag_count: int = Field(default=0, description="Number of tags in this namespace")
    metadata: dict[str, Any] = Field(default_factory=dict)


class I3xObjectType(BaseModel):
    """An i3X object type — maps to a TagTemplate in Forge.

    Object types define the structure of equipment instances.
    Each template (AnalogInstrument, VFD_Drive, etc.) is one object type.
    """

    id: str = Field(description="Object type ID (template name)")
    name: str = Field(description="Human-readable name")
    description: str = ""
    version: str = "1.0.0"
    tag_count: int = Field(default=0, description="Tags per instance")
    parameters: list[str] = Field(default_factory=list, description="Required parameter names")
    extends: str | None = Field(default=None, description="Parent type for inheritance")


class I3xObject(BaseModel):
    """An i3X object — a node in the tag hierarchy.

    Can be either a folder (has_children=True) or a leaf tag.
    This is the primary browse result type.
    """

    path: str = Field(description="Full tag path or folder path")
    name: str = Field(description="Last segment of the path")
    is_folder: bool = Field(default=False, description="True if this is a folder node")
    has_children: bool = Field(default=False, description="True if folder has children")
    tag_type: str | None = Field(default=None, description="Tag type (null for folders)")
    data_type: str | None = Field(default=None, description="Data type (null for folders)")
    description: str = ""
    engineering_units: str = ""
    object_type: str | None = Field(default=None, description="Template name if from a template")
    metadata: dict[str, Any] = Field(default_factory=dict)


class I3xValue(BaseModel):
    """An i3X value — live tag value preview."""

    path: str
    value: Any = None
    quality: str = "NOT_AVAILABLE"
    timestamp: datetime | None = None
    source_timestamp: datetime | None = None
    data_type: str | None = None
    engineering_units: str = ""


class I3xBrowseResponse(BaseModel):
    """Response wrapper for browse operations."""

    path: str = Field(description="The browsed path")
    children: list[I3xObject] = Field(default_factory=list)
    total_count: int = 0
    namespace: str | None = None


class I3xDiscoverRequest(BaseModel):
    """Request to auto-discover tags from a PLC namespace."""

    namespace: str = Field(description="PLC connection name")
    path: str = Field(default="", description="Starting path for discovery")
    recursive: bool = Field(default=True, description="Discover child nodes recursively")
    template: str | None = Field(
        default=None, description="Template to apply to discovered equipment"
    )


class I3xDiscoverResponse(BaseModel):
    """Result of a tag discovery operation."""

    namespace: str
    tags_discovered: int = 0
    tags_created: int = 0
    tags_skipped: int = 0
    errors: list[str] = Field(default_factory=list)
