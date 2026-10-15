"""Composition root for the OT control path (FB-065).

:class:`ControlRuntime` turns an :class:`~forge.modules.ot.control.config.OTControlConfig`
plus the collaborators only the host can provide (hub write dispatcher,
tag engine, record sink, broker) into the running objects::

    config ──► WriteValidator + InterlockEngine + WriteAuthorizer
           ──► ControlWriteEngine(tag_io) ──► WriteAuditLogger (log, MQTT)
           ──► RecipeWriteAdapter (per-equipment mappings)
           ──► PlcCipRunner (per-area CIP sequences, publishes cipState)
           ──► ChangeoverOrchestrator(MesChangeoverClient(write_dispatcher))
           ──► MqttSubscriber ◄── LocalBrokerIngress | ExternalBrokerIngress

:class:`RegistryTagIO` is the default PLC access: Memory tags are written
in the tag registry, Standard tags through the ``OpcUaProvider`` that owns
their connection, and reads go to the PLC when a provider is available
(falling back to the registry's last value).

The runtime is owned by :class:`~forge.modules.ot.adapter.OTModuleAdapter`
(``configure`` builds it, ``start``/``stop`` drive it) and exposed over REST
by :func:`forge.modules.ot.control.api.create_control_router`.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from forge.core.broker.broker import BrokerConfig, ForgeMqttBroker
from forge.modules.ot.control.audit import (
    ContextualRecordAuditSink,
    LogAuditSink,
    MqttAuditSink,
    WriteAuditLogger,
    WriteAuditQuery,
)
from forge.modules.ot.control.authorization import WriteAuthorizer
from forge.modules.ot.control.changeover_orchestrator import ChangeoverOrchestrator
from forge.modules.ot.control.cip_runner import PlcCipRunner
from forge.modules.ot.control.connections import PlcConnectionManager
from forge.modules.ot.control.interlock import InterlockEngine
from forge.modules.ot.control.mes_changeover import MesChangeoverClient
from forge.modules.ot.control.recipe_integration import RecipeWriteAdapter
from forge.modules.ot.control.validation import WriteValidator
from forge.modules.ot.control.write_engine import ControlWriteEngine
from forge.modules.ot.mqtt.ingress import ExternalBrokerIngress, LocalBrokerIngress
from forge.modules.ot.mqtt.publisher import MqttConfig, OTMqttPublisher
from forge.modules.ot.mqtt.subscriber import MqttSubscriber
from forge.modules.ot.opcua_client.types import QualityCode
from forge.modules.ot.tag_engine.models import MemoryTag, StandardTag

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable, Mapping
    from datetime import datetime

    from forge.modules.ot.control.config import OTControlConfig
    from forge.modules.ot.tag_engine.registry import TagRegistry

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# PLC access over the tag engine
# ---------------------------------------------------------------------------


class RegistryTagIO:
    """``TagWriter`` + ``TagReader`` over the tag engine.

    Args:
        registry: The tag registry (definitions and last values).
        providers: ``connection_name`` → ``OpcUaProvider`` (anything with
            ``read_current(tag_path)`` and ``write_to_plc(tag_path, value)``).
        acquisition: Optional ``AcquisitionEngine``; consulted with
            ``get_provider(connection_name)`` when ``providers`` has no entry.
        live_reads: Read Standard tags from the PLC (``read_current``) instead
            of the registry's last value.
    """

    def __init__(
        self,
        registry: TagRegistry,
        *,
        providers: Mapping[str, Any] | None = None,
        acquisition: Any | None = None,
        live_reads: bool = True,
    ) -> None:
        self._registry = registry
        self._providers: dict[str, Any] = dict(providers or {})
        self._acquisition = acquisition
        self._live_reads = live_reads

    def add_provider(self, connection_name: str, provider: Any) -> None:
        self._providers[connection_name] = provider

    def _provider_for(self, tag: Any) -> Any | None:
        name = getattr(tag, "connection_name", None)
        if not name:
            return None
        provider = self._providers.get(name)
        if provider is None and self._acquisition is not None:
            provider = self._acquisition.get_provider(name)
        return provider

    async def read_tag(self, tag_path: str) -> Any:
        tag = await self._registry.get_definition(tag_path)
        if tag is None:
            msg = f"unknown tag '{tag_path}'"
            raise LookupError(msg)
        if self._live_reads and isinstance(tag, StandardTag):
            provider = self._provider_for(tag)
            if provider is not None:
                data_value = await provider.read_current(tag_path)
                if data_value is not None:
                    return data_value.value
        tag_value = await self._registry.get_value(tag_path)
        return None if tag_value is None else tag_value.value

    async def write_tag(self, tag_path: str, value: Any) -> None:
        tag = await self._registry.get_definition(tag_path)
        if tag is None:
            msg = f"unknown tag '{tag_path}'"
            raise LookupError(msg)
        if isinstance(tag, MemoryTag):
            await self._registry.update_value(tag_path, value, QualityCode.GOOD)
            return
        if isinstance(tag, StandardTag):
            provider = self._provider_for(tag)
            if provider is None:
                msg = f"no OPC-UA provider for connection '{tag.connection_name}' ({tag_path})"
                raise RuntimeError(msg)
            ok = await provider.write_to_plc(tag_path, value)
            if not ok:
                msg = f"OPC-UA provider refused write to {tag_path}"
                raise RuntimeError(msg)
            return
        msg = f"tag '{tag_path}' ({type(tag).__name__}) is not writable"
        raise TypeError(msg)


# ---------------------------------------------------------------------------
# Dependencies the host injects
# ---------------------------------------------------------------------------


@dataclass
class ControlDependencies:
    """What the composition root cannot build on its own."""

    #: Hub ``WriteDispatcher`` (anything with ``write(adapter_id, tag_path, value, confirm)``).
    write_dispatcher: Any
    #: PLC access; defaults to :class:`RegistryTagIO` over the adapter's registry.
    tag_io: Any | None = None
    #: Receives one ContextualRecord per MES write attempt (``write_batch(records)``).
    record_sink: Any | None = None
    #: Embedded broker for ``mqtt.mode == "local"``; the runtime starts its own when absent.
    broker: ForgeMqttBroker | None = None
    #: ``publish(topic, payload, qos=, retain=)`` for cipState and audit; defaults to the broker.
    publisher: Any | None = None
    now: Callable[[], datetime] | None = None
    sleep: Callable[[float], Awaitable[None]] | None = None
    #: Shared ``AcquisitionEngine`` the PLC providers register on (the host hands
    #: the i3X browse API the same one); created privately when absent.
    acquisition: Any | None = None
    #: Test hooks for :class:`~forge.modules.ot.control.connections.PlcConnectionManager`.
    plc_client_factory: Callable[..., Any] | None = None
    plc_provider_factory: Callable[..., Any] | None = None
    #: Test hook: ``ingress_factory(settings, subscriber, broker)`` → ingress or None.
    ingress_factory: Callable[..., Any] | None = None
    #: Test hook for the external-mode publisher: ``factory(MqttConfig)`` → client.
    mqtt_client_factory: Callable[..., Any] | None = None


# ---------------------------------------------------------------------------
# The runtime
# ---------------------------------------------------------------------------


class ControlRuntime:
    """Everything the OT control path needs, built from one config."""

    def __init__(
        self,
        config: OTControlConfig,
        deps: ControlDependencies,
        *,
        registry: TagRegistry | None = None,
    ) -> None:
        if deps.tag_io is None and registry is None:
            msg = "ControlRuntime needs either deps.tag_io or a TagRegistry"
            raise ValueError(msg)
        self._config = config
        self._deps = deps
        self._started = False
        self._owns_broker = False
        self._broker = deps.broker

        # PLC connections (FB-069): one OpcUaProvider per configured PLC.
        self.connections: PlcConnectionManager | None = None
        if config.connections:
            if registry is None:
                msg = "PLC connections need a TagRegistry (their providers push values into it)"
                raise ValueError(msg)
            self.connections = PlcConnectionManager(
                config.connections,
                registry,
                engine=deps.acquisition,
                site_prefix=config.site_prefix,
                client_factory=deps.plc_client_factory,
                provider_factory=deps.plc_provider_factory,
                poll_interval=config.connection_poll_seconds,
                now=deps.now,
            )
        acquisition = self.connections.engine if self.connections is not None else deps.acquisition
        self.tag_io = (
            deps.tag_io
            if deps.tag_io is not None
            else RegistryTagIO(registry, acquisition=acquisition)  # type: ignore[arg-type]
        )

        # Layers 1-3 + the engine.
        self.validator = WriteValidator()
        for tag in config.write_tags:
            self.validator.register_tag(tag)
        self.interlocks = InterlockEngine(tag_reader=self.tag_io)
        for rule in config.interlocks:
            self.interlocks.add_rule(rule)
        self.authorizer = WriteAuthorizer()
        for permission in config.permissions:
            self.authorizer.add_permission(permission)
        self.engine = ControlWriteEngine(
            validator=self.validator,
            interlock_engine=self.interlocks,
            authorizer=self.authorizer,
            tag_writer=self.tag_io,
            readback_tolerance=config.readback_tolerance,
        )
        self.audit = WriteAuditLogger()
        if config.audit_log:
            self.audit.add_sink(LogAuditSink())
        # Every control write result becomes a ContextualRecord in the hub store (FB-066).
        self.record_audit: ContextualRecordAuditSink | None = None
        if deps.record_sink is not None:
            self.record_audit = ContextualRecordAuditSink(
                deps.record_sink, site=config.site, now=deps.now
            )
            self.audit.add_sink(self.record_audit)
        # Own publisher for ``mqtt.mode == "external"`` (FB-067); local mode publishes
        # straight into the embedded broker.
        self.publisher: OTMqttPublisher | None = None
        if deps.publisher is None and config.mqtt.mode == "external":
            mqtt = config.mqtt
            self.publisher = OTMqttPublisher(
                MqttConfig(
                    host=mqtt.host,
                    port=mqtt.port,
                    username=mqtt.username,
                    password=mqtt.password,
                    client_id=f"{mqtt.client_id}-pub",
                    use_tls=mqtt.use_tls,
                    ca_certs=mqtt.ca_certs,
                    certfile=mqtt.certfile,
                    keyfile=mqtt.keyfile,
                    reconnect_min_delay=mqtt.reconnect_min_delay,
                    reconnect_max_delay=mqtt.reconnect_max_delay,
                    broker_mode="external",
                    _client_factory=deps.mqtt_client_factory,
                )
            )
        self.engine.add_listener(self.audit)
        self.audit_query = WriteAuditQuery(self.engine)

        # Recipes.
        self.recipes = RecipeWriteAdapter(self.engine)
        for recipe in config.recipes:
            self.recipes.register_config(recipe)

        # CIP + orchestration (only when areas are configured).
        self.cip_runner: PlcCipRunner | None = None
        self.orchestrator: ChangeoverOrchestrator | None = None
        self.subscriber = MqttSubscriber()
        self.ingress: Any | None = None
        cip_specs = config.cip_specs()
        if cip_specs:
            self.cip_runner = PlcCipRunner(
                self.engine,
                self.tag_io,
                cip_specs,
                requested_by=config.requested_by,
                on_state=self._on_cip_state if config.mqtt.publish_cip_state else None,
                now=deps.now,
                sleep=deps.sleep,
            )
        areas = config.area_configs()
        if areas:
            self.mes = MesChangeoverClient(deps.write_dispatcher, adapter_id=config.mes_adapter_id)
            self.orchestrator = ChangeoverOrchestrator(
                self.mes,
                self.recipes,
                areas=areas,
                cip_runner=self.cip_runner,
                record_sink=deps.record_sink,
                topic_root=config.topic_root,
                act_on_retained=config.act_on_retained,
                requested_by=config.requested_by,
                now=deps.now,
            )
            self.orchestrator.bind(self.subscriber)

    # -- properties -----------------------------------------------------------

    @property
    def config(self) -> OTControlConfig:
        return self._config

    @property
    def started(self) -> bool:
        return self._started

    @property
    def broker(self) -> ForgeMqttBroker | None:
        return self._broker

    # -- lifecycle ------------------------------------------------------------

    async def start(self) -> None:
        if self._started:
            return
        # PLCs first, so tags are live before the first MES message is acted on.
        if self.connections is not None:
            await self.connections.start()
        settings = self._config.mqtt
        if settings.mode == "local" and self._broker is None:
            self._broker = ForgeMqttBroker(
                BrokerConfig(
                    host=settings.host,
                    port=settings.port,
                    username=settings.username,
                    password=settings.password,
                    allow_anonymous=not settings.username,
                    sys_interval=0,
                )
            )
            self._owns_broker = True
        if self._owns_broker and self._broker is not None and not self._broker.is_started:
            await self._broker.start()
            logger.info("Embedded MQTT broker started for the OT control runtime")
        if self.publisher is not None:
            await self.publisher.start()
        target = self._publish_target()
        if target is not None and self._config.mqtt.publish_audit:
            self.audit.add_sink(
                MqttAuditSink(target, topic_prefix=f"{self._config.topic_root}/{self._config.site}")
            )
        if self.orchestrator is not None:
            self.ingress = self._build_ingress()
            if self.ingress is not None:
                await self.ingress.start()
        self._started = True
        logger.info("OT control runtime started: %s", json.dumps(self._config.describe()))

    def _build_ingress(self) -> Any | None:
        settings = self._config.mqtt
        if self._deps.ingress_factory is not None:
            return self._deps.ingress_factory(settings, self.subscriber, self._broker)
        if settings.mode == "none":
            return None
        if settings.mode == "local":
            assert self._broker is not None  # started above
            return LocalBrokerIngress(self._broker, self.subscriber)
        return ExternalBrokerIngress(
            self.subscriber,
            host=settings.host,
            port=settings.port,
            username=settings.username,
            password=settings.password,
            client_id=settings.client_id,
            use_tls=settings.use_tls,
            ca_certs=settings.ca_certs,
            certfile=settings.certfile,
            keyfile=settings.keyfile,
            reconnect_min_delay=settings.reconnect_min_delay,
            reconnect_max_delay=settings.reconnect_max_delay,
        )

    async def stop(self) -> None:
        if not self._started:
            return
        self._started = False
        if self.ingress is not None:
            try:
                await self.ingress.stop()
            except Exception:
                logger.exception("MQTT ingress did not stop cleanly")
            self.ingress = None
        if self._owns_broker and self._broker is not None:
            await self._broker.stop()
            self._broker = None
            self._owns_broker = False
        if self.publisher is not None:
            await self.publisher.stop()
        if self.connections is not None:
            await self.connections.stop()

    # -- feeding and publishing -----------------------------------------------

    def _publish_target(self) -> Any | None:
        if self._deps.publisher is not None:
            return self._deps.publisher
        if self.publisher is not None:
            return self.publisher
        return self._broker

    async def _on_cip_state(self, area: str, payload: dict[str, Any]) -> None:
        topic = self._config.topic(area, "equipment", "cipState")
        await self.publish(topic, payload, qos=1, retain=True)

    async def publish(
        self,
        topic: str,
        payload: dict[str, Any] | str | bytes,
        *,
        qos: int = 1,
        retain: bool = False,
    ) -> bool:
        """Publish through the injected publisher, our external publisher or the broker."""
        target = self._publish_target()
        if target is None:
            logger.debug("No MQTT publisher; dropping %s", topic)
            return False
        raw: Any = payload
        if isinstance(payload, dict):
            raw = json.dumps(payload, default=str)
        try:
            await target.publish(topic, raw, qos=qos, retain=retain)
        except Exception as exc:
            logger.warning("Publish to %s failed: %s", topic, exc)
            return False
        return True

    # -- status ---------------------------------------------------------------

    def status(self) -> dict[str, Any]:
        return {
            "started": self._started,
            "config": self._config.describe(),
            "mqtt": self.ingress.status()
            if self.ingress is not None
            else {
                "mode": self._config.mqtt.mode,
                "connected": False,
            },
            "broker": self._broker.get_status() if self._broker is not None else None,
            "publisher": self.publisher.get_status() if self.publisher is not None else None,
            "audit_records": self.record_audit.records_written if self.record_audit else 0,
            "subscriber": self.subscriber.get_stats(),
            "engine": self.engine.get_stats(),
            "cip": self.cip_runner.status() if self.cip_runner is not None else {},
            "connections": (self.connections.status() if self.connections is not None else None),
            "changeover": self.orchestrator.snapshot() if self.orchestrator is not None else None,
        }
