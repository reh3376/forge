# Clock discipline — the deployment requirement

**Status:** in force since 2026-11-13 (FB-090, step 4 of `docs/decisions/one-clock-ot-source-time.md`, signed by the owner on 2026-11-03). The owner's rule (2026-10-18): this is required, not optional, and its checks fail closed.

## The rule

Records from different sources only reconcile if their timestamps come from one master time. The highest hub in a Forge system is the time authority for every hub and spoke attached to it; each hub governs the clock of every module and spoke directly connected to it; each spoke governs or measures the clocks of the source systems behind it (PLC, OPC-UA server, MES host). Nothing attached to a Forge hub keeps time on its own.

## What a deployment must provide

| Element | Requirement | Where it is checked |
|---|---|---|
| The top hub's reference | GNSS, or an NTP stratum the installation trusts (`time_source: gnss` or `hub-ntp`) | FACTS `time_governance.time_source` |
| Every hub below it | takes time from the hub above (NTP strata that mirror the hub hierarchy; one-clock record P-1) | FB-092 time exchange; FB-093 refusal |
| Every spoke host (MES, WMS, ERP, the OT module's host) | NTP from its hub's chain; `it-lan` 10 ms on the site LAN, `it-wan` 100 ms across sites | FACTS `tolerance_class`; FB-089 measurement; FB-093 refusal |
| Every PLC and OPC-UA server | NTP from the plant chain (`T0`, 10 ms) or PTP where the device supports it (`T1`, 1 ms; CIP Sync, IEEE 802.1AS); a device whose clock cannot be read is not a valid source | FACTS `clock_read_method` and `tolerance_class`; FB-094's probe and tap; FB-093's `CLOCK_UNREADABLE` |
| Sparkplug edge nodes | declared `edge`, measured one-way at `edge-mqtt` (500 ms) until the exchange reaches them | FACTS `source_timestamp_origin: edge` |
| Every connection's probe cadence | 30 s default, 1 s minimum, adjusted per connection at runtime; three consecutive bad probes refuse the connection | `PlcConnectionSpec.clock_probe_interval_seconds`, `POST /control/connections/{name}/clock-probe-interval` |
| Stamps | UTC and timezone-aware everywhere; a naive stamp is rejected at the model (FB-014); OPC UA `DateTime` is UTC by definition | `forge.core.clock` |

## What fails closed

- A spoke whose FACTS spec lacks `time_governance`, declares `sync_protocol: none` or does not fail closed does not pass conformance (`facts:time-governed`).
- A connection whose clock cannot be read for three consecutive probes, or whose measured offset exceeds its class for three consecutive probes, stops delivering data, raises an alarm with its cause and is visible on status, health, the API, the CLI and forge-display (FB-093; never silent, owner 2026-11-03).
- A value that arrives without a source stamp is refused unless its connection declared `source_timestamp_origin: forge` (FB-088).
- A connection parameter that contradicts the spoke's FACTS `time_governance` declaration is refused when the adapter is configured; the governed declaration stands (FB-090).

## Checklist for a new site

1. Point the site hub at the enterprise hub's NTP (or GNSS for a single-hub installation).
2. Point every spoke host and every PLC or OPC-UA server at the site hub's NTP; enable PTP where the plant network and the devices support it and declare `T1`.
3. Write each spoke's `time_governance` section (FACTS) and, for the OT module, each PLC connection's `source_timestamp_origin` and `clock_probe_interval_seconds` in the control configuration.
4. Confirm on the hub: `forge governance run facts <spoke>` passes `facts:time-governed`; `GET /api/v1/ot/control/connections` shows each connection's `clock_id`, `server_clock` and probe cadence; `GET /v1/ingest/stats` shows the offsets within class.
