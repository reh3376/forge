"""Run the OT module inside the hub process (FB-065).

The OT module is not a remote spoke: it needs the hub's ``WriteDispatcher``
to reach the MES and the hub's ingest pipeline for its audit records, so
the hub hosts it. ``create_app`` builds an :class:`OTModuleHost` when
``FORGE_OT_CONTROL_CONFIG`` names a control configuration file:

    FORGE_OT_CONTROL_CONFIG   OTControlConfig JSON (see control/config.py)
    FORGE_OT_TAGS_DIR         optional directory of ``*.tags.json`` definitions

The host owns the tag registry, the acquisition engine the PLC providers
register on (FB-069) and the adapter, starts them in the app lifespan,
registers the adapter's manifest with the hub registry and mounts the
control and i3X routers under ``/api/v1/ot``.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any

from forge.modules.ot.adapter import OTModuleAdapter
from forge.modules.ot.control.api import create_control_router
from forge.modules.ot.control.runtime import ControlDependencies
from forge.modules.ot.tag_engine.providers.acquisition import AcquisitionEngine
from forge.modules.ot.tag_engine.registry import TagRegistry

if TYPE_CHECKING:
    from fastapi import FastAPI

    from forge.modules.ot.control.runtime import ControlRuntime

logger = logging.getLogger(__name__)

CONFIG_ENV = "FORGE_OT_CONTROL_CONFIG"
TAGS_DIR_ENV = "FORGE_OT_TAGS_DIR"


class OTModuleHost:
    """Lifecycle wrapper the hub app drives."""

    def __init__(
        self,
        *,
        config_path: str | Path,
        tags_dir: str | Path | None,
        write_dispatcher: Any,
        record_sink: Any | None,
        broker: Any | None = None,
        publisher: Any | None = None,
        registry: TagRegistry | None = None,
    ) -> None:
        self.config_path = Path(config_path)
        self.tags_dir = Path(tags_dir) if tags_dir else None
        self.registry = registry or TagRegistry()
        # Shared by the PLC providers (FB-069) and the i3X namespace listing.
        self.acquisition = AcquisitionEngine()
        self.adapter = OTModuleAdapter(
            self.registry,
            control=ControlDependencies(
                write_dispatcher=write_dispatcher,
                record_sink=record_sink,
                broker=broker,
                publisher=publisher,
                acquisition=self.acquisition,
            ),
        )
        self.tags_loaded = 0
        self.started = False

    @property
    def control_runtime(self) -> ControlRuntime | None:
        return self.adapter.control_runtime

    async def start(self) -> None:
        if self.tags_dir is not None:
            from forge.modules.ot.tag_engine.persistence import load_tags_from_directory

            self.tags_loaded = await load_tags_from_directory(self.registry, self.tags_dir)
            logger.info(
                "OT module: %d tag definitions loaded from %s", self.tags_loaded, self.tags_dir
            )
        await self.adapter.configure({"control_config_path": str(self.config_path)})
        await self.adapter.start()
        self.started = True
        logger.info("OT module started from %s", self.config_path)

    async def stop(self) -> None:
        if not self.started:
            return
        await self.adapter.stop()
        self.started = False
        logger.info("OT module stopped")

    def mount(self, app: FastAPI) -> None:
        """Mount the control API (and i3X browse) on the hub app."""
        app.include_router(create_control_router(lambda: self.adapter.control_runtime))
        try:
            from forge.modules.ot.i3x.router import create_i3x_router
            from forge.modules.ot.tag_engine.builtin_templates import create_builtin_registry

            app.include_router(
                create_i3x_router(
                    registry=self.registry,
                    template_registry=create_builtin_registry(),
                    acquisition_engine=self.acquisition,
                )
            )
        except Exception:  # pragma: no cover — browse API is optional
            logger.exception("i3X browse router not mounted")
        app.state.ot_module = self

    def status(self) -> dict[str, Any]:
        runtime = self.adapter.control_runtime
        return {
            "started": self.started,
            "config_path": str(self.config_path),
            "tags_dir": str(self.tags_dir) if self.tags_dir else None,
            "tags_loaded": self.tags_loaded,
            "adapter_state": self.adapter.state.value,
            "control": runtime.status() if runtime is not None else None,
        }
