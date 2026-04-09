"""i3X Browse API router — FastAPI endpoints for CESMII-shaped access.

This router is mounted by the OT Module's API surface.  All endpoints
follow the i3X pattern: namespaces → object types → objects → values.

The router does NOT own any state — it receives dependencies (registry,
template_registry, acquisition_engine) via the factory function.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from forge.modules.ot.i3x.models import (
    I3xBrowseResponse,
    I3xNamespace,
    I3xObject,
    I3xObjectType,
    I3xValue,
)
from forge.modules.ot.tag_engine.providers.acquisition import AcquisitionEngine
from forge.modules.ot.tag_engine.providers.opcua_provider import OpcUaProvider
from forge.modules.ot.tag_engine.registry import TagRegistry
from forge.modules.ot.tag_engine.templates import TemplateRegistry

logger = logging.getLogger(__name__)


def create_i3x_router(
    registry: TagRegistry,
    template_registry: TemplateRegistry,
    acquisition_engine: AcquisitionEngine | None = None,
) -> APIRouter:
    """Create a FastAPI router with i3X-compliant endpoints.

    Args:
        registry: The tag registry (for browse, values, definitions)
        template_registry: Template catalog (for object types)
        acquisition_engine: Provider manager (for namespace/connection status)

    Returns:
        APIRouter mounted at /api/v1/ot/
    """
    router = APIRouter(prefix="/api/v1/ot", tags=["OT i3X Browse"])

    # ------------------------------------------------------------------
    # 2A.3.4: Namespaces (PLC connections)
    # ------------------------------------------------------------------

    @router.get("/namespaces", response_model=list[I3xNamespace])
    async def list_namespaces() -> list[I3xNamespace]:
        """List all PLC connections as i3X namespaces.

        Each OpcUaProvider registered in the AcquisitionEngine becomes
        one namespace.  If no acquisition engine is configured, returns
        namespaces inferred from tag connection_name fields.
        """
        namespaces: list[I3xNamespace] = []

        if acquisition_engine is not None:
            # Get real connection info from providers
            health = await acquisition_engine.health()
            providers = health.get("providers", {})

            for name, provider_health in providers.items():
                # Only OPC-UA providers are namespaces
                if "connection_state" not in provider_health:
                    continue
                ns = I3xNamespace(
                    id=name,
                    name=name,
                    protocol="opcua",
                    endpoint_url=provider_health.get("endpoint_url", ""),
                    status=provider_health.get("connection_state", "unknown"),
                    tag_count=provider_health.get("subscribed_tags", 0),
                )
                namespaces.append(ns)
        else:
            # Infer from tag definitions
            stats = await registry.get_stats()
            seen_connections: set[str] = set()
            all_tags = stats.get("total_tags", 0)
            # Browse root to find connection-level folders
            root_items = await registry.browse("")
            for item in root_items:
                ns_id = item["name"]
                if ns_id not in seen_connections:
                    seen_connections.add(ns_id)
                    namespaces.append(
                        I3xNamespace(id=ns_id, name=ns_id)
                    )

        return namespaces

    # ------------------------------------------------------------------
    # 2A.3.5: Object Types (tag templates)
    # ------------------------------------------------------------------

    @router.get("/objecttypes", response_model=list[I3xObjectType])
    async def list_object_types(
        namespace: str | None = Query(default=None, description="Filter by namespace"),
    ) -> list[I3xObjectType]:
        """List available equipment types (tag templates).

        Templates define reusable tag structures for common equipment
        patterns (AnalogInstrument, VFD_Drive, etc.).
        """
        types: list[I3xObjectType] = []

        for name in template_registry.list_templates():
            tmpl = template_registry.get(name)
            if tmpl is None:
                continue
            required_params = [
                p_name
                for p_name, p_def in tmpl.parameters.items()
                if p_def.required
            ]
            types.append(
                I3xObjectType(
                    id=tmpl.name,
                    name=tmpl.name,
                    description=tmpl.description,
                    version=tmpl.version,
                    tag_count=len(tmpl.tags),
                    parameters=required_params,
                    extends=tmpl.extends,
                )
            )

        return types

    # ------------------------------------------------------------------
    # 2A.3.6: Browse (tag/folder hierarchy)
    # ------------------------------------------------------------------

    @router.get("/objects", response_model=I3xBrowseResponse)
    async def browse_objects(
        path: str = Query(default="", description="Path to browse (empty = root)"),
        namespace: str | None = Query(default=None, description="Filter to namespace"),
    ) -> I3xBrowseResponse:
        """Browse the tag hierarchy as i3X objects.

        Returns folders and leaf tags at the given path level.
        This is the primary navigation API for SCADA/HMI clients.
        """
        browse_path = path
        if namespace and not browse_path:
            browse_path = namespace
        elif namespace and not browse_path.startswith(namespace):
            browse_path = f"{namespace}/{browse_path}"

        raw_items = await registry.browse(browse_path)
        children: list[I3xObject] = []

        for item in raw_items:
            full_path = f"{browse_path}/{item['name']}" if browse_path else item["name"]
            is_folder = item.get("type") == "folder"

            obj = I3xObject(
                path=full_path,
                name=item["name"],
                is_folder=is_folder,
                has_children=is_folder,  # Folders always potentially have children
                tag_type=item.get("tag_type"),
                data_type=item.get("data_type"),
                description=item.get("description", ""),
                engineering_units=item.get("engineering_units", ""),
                object_type=item.get("metadata", {}).get("_template"),
            )
            children.append(obj)

        return I3xBrowseResponse(
            path=browse_path,
            children=children,
            total_count=len(children),
            namespace=namespace,
        )

    # ------------------------------------------------------------------
    # 2A.3.7: Values (live tag value preview)
    # ------------------------------------------------------------------

    @router.get("/objects/value", response_model=I3xValue)
    async def get_object_value(
        path: str = Query(description="Tag path to read"),
    ) -> I3xValue:
        """Get the current live value of a tag.

        Returns the cached value from the tag registry — does NOT
        trigger a direct PLC read.  For forced refresh, use the
        OPC-UA provider's read_current() method.
        """
        tag_def = await registry.get_definition(path)
        if tag_def is None:
            raise HTTPException(status_code=404, detail=f"Tag not found: {path}")

        tag_value = await registry.get_value(path)

        return I3xValue(
            path=path,
            value=tag_value.value if tag_value else None,
            quality=tag_value.quality.value if tag_value else "NOT_AVAILABLE",
            timestamp=tag_value.timestamp if tag_value else None,
            source_timestamp=tag_value.source_timestamp if tag_value else None,
            data_type=tag_def.data_type.value,
            engineering_units=tag_def.engineering_units,
        )

    @router.get("/objects/values", response_model=list[I3xValue])
    async def get_object_values(
        paths: str = Query(description="Comma-separated tag paths"),
    ) -> list[I3xValue]:
        """Get current values for multiple tags in one request.

        Bulk value read for dashboard rendering.
        """
        path_list = [p.strip() for p in paths.split(",") if p.strip()]
        results: list[I3xValue] = []

        for path in path_list:
            tag_def = await registry.get_definition(path)
            tag_value = await registry.get_value(path)

            results.append(
                I3xValue(
                    path=path,
                    value=tag_value.value if tag_value else None,
                    quality=(
                        tag_value.quality.value if tag_value else "NOT_AVAILABLE"
                    ),
                    timestamp=tag_value.timestamp if tag_value else None,
                    source_timestamp=(
                        tag_value.source_timestamp if tag_value else None
                    ),
                    data_type=tag_def.data_type.value if tag_def else None,
                    engineering_units=(
                        tag_def.engineering_units if tag_def else ""
                    ),
                )
            )

        return results

    # ------------------------------------------------------------------
    # 2A.3.8: Subscriptions (SSE placeholder)
    # ------------------------------------------------------------------

    @router.get("/subscriptions")
    async def subscribe_values():
        """SSE stream for real-time tag value changes.

        Phase 2A.4 stub — full SSE implementation requires:
            - asyncio.Queue per subscriber
            - Registry change callback → queue push
            - StreamingResponse with text/event-stream content type
        """
        raise HTTPException(
            status_code=501,
            detail="SSE subscriptions deferred to Phase 2A.4 (Context Enrichment)",
        )

    # ------------------------------------------------------------------
    # 2A.3.9: Tag Discovery (placeholder)
    # ------------------------------------------------------------------

    @router.post("/discover")
    async def discover_tags(
        namespace: str = Query(description="PLC connection name"),
        recursive: bool = Query(default=True, description="Discover recursively"),
    ):
        """Auto-discover tags from a PLC address space.

        Phase 2A.4 stub — full discovery requires:
            - OPC-UA browse of the PLC address space
            - Mapping OPC-UA nodes to Forge tag paths
            - Template matching for known equipment patterns
        """
        raise HTTPException(
            status_code=501,
            detail="Tag discovery deferred to Phase 2A.4 (requires OPC-UA browse)",
        )

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------

    @router.get("/stats")
    async def get_ot_stats() -> dict[str, Any]:
        """OT module statistics — tag counts, provider health, templates."""
        stats = await registry.get_stats()

        engine_health: dict[str, Any] = {}
        if acquisition_engine is not None:
            engine_health = await acquisition_engine.health()

        return {
            "tag_registry": stats,
            "templates": {
                "count": template_registry.count,
                "names": template_registry.list_templates(),
            },
            "acquisition_engine": engine_health or {"status": "not_configured"},
        }

    return router
