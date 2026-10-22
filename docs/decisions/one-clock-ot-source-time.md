# One clock in OT: device source time — design record

**Status:** draft for the owner's signature, round 1 (2026-10-21) · **Backlog:** FB-094 (with FB-088, FB-090, FB-091, FB-092, FB-093) · **Roadmap:** D-9
**Participants:** reh3376 (owner, decides and signs), Claude (researches, proposes)

This record answers decision D-9 and designs the OT half of the one-clock principle: how Forge learns the clock of every device it pulls from, how it corrects every incoming timestamp by the measured offset on entry, and what it refuses. Every statement is tagged **[OWNER]** (decided by the owner on 2026-10-18), **[FACT]** (what a standard, a vendor document or the code says, with its source in §9), **[PROPOSED]** (Claude's recommendation, not yet approved) or **[OPEN]** (a question the owner must answer). Nothing in §5 to §7 is implemented until the status line reads `approved by reh3376 on <date>`; the owner signs by editing that line, nobody signs on the owner's behalf.

The owner's framing (2026-10-18): this is a solved problem; the work is research to find the best established solution, not a novel one. The research below found no gap that needs invention. Every part has a deployed standard behind it.

---

## 1. What the owner decided (2026-10-18)

| # | Decision | Tag |
|---|---|---|
| O-1 | All data sources sync to the same clock. Data from sources that do not share one master time never reconciles, and Forge's purpose (one picture for every level of the organisation) fails. | [OWNER] |
| O-2 | The master clock is enforced at every level. The highest hub provides time for every hub and spoke attached to it; each hub governs the time of every module directly connected to it. The requirement and its checks are not optional. | [OWNER] |
| O-3 | A tag pulled from a PLC carries the real time the value occurred at the device. Third-party OT software and hardware make this hard; it must be figured out, not left to chance or warnings. | [OWNER] |
| O-4 | To pull tags from a device, Forge must know the device's clock and, where it differs, change the time as it comes into Forge by the measured difference. A device whose clock cannot be read is not a valid source. | [OWNER] |
| O-5 | D-9 chooses among established standards; the design document recommends, the owner approves. | [OWNER] |

Already settled and built on the hub side: every stored timestamp is UTC and timezone-aware, naive values are rejected (FB-014); the hub stamps receipt and keeps the spoke's stamp as `sent_time` (FB-087); the offset at every link is measured, exposed and alerted on a provisional 1 s tolerance (FB-089).

## 2. What exists today (2026-10-21)

[FACT] The OPC-UA client (`modules/ot/opcua_client/client.py`) stores whatever `SourceTimestamp` and `ServerTimestamp` the server sends and substitutes the hub's `now` when either is missing (FB-088). Nothing reads a device clock; nothing applies an offset. The liveness probe (`modules/ot/control/connections.py`, FB-070) reads `Server_ServerStatus_CurrentTime` (`i=2258`) every `liveness_interval_seconds` and, since FB-089, measures the server clock against the hub clock at the round trip's midpoint and reports it as `server_clock`. The Sparkplug codec (`modules/ot/mqtt/sparkplug.py`) fills a missing metric timestamp with the local clock. The Ignition bridge (`modules/ot/bridge/models.py`) takes the bridge's timestamp or, failing that, `now`. The tag engine's `TagValue` and the OPC-UA `DataValue` coerce a naive stamp to UTC (OPC UA DateTime is UTC by definition). FACTS has no clock section; the OT spec declares nothing about time. The record carries `source_time`, `server_time`, `ingestion_time` and, hub-side, `sent_time`; no field says which clock stamped `source_time`, what offset was applied, or how uncertain the stamp is.

## 3. The problem, precisely

Between a value changing in a PLC and a `ContextualRecord` in the hub there are up to four clocks, each of which may stamp the value and each of which may be wrong by an unknown amount:

1. **The device clock** (PLC real-time clock). It stamps a value only when the protocol carries device time: a PLC-embedded OPC UA server, CIP Sync timestamped I/O, an event log the PLC writes itself, a Sparkplug edge that is the device.
2. **The server or gateway clock** (Kepware, Ignition, FactoryTalk Linx, a historian). For Modbus, EtherNet/IP and S7 reads the wire carries no device time, so the server stamps the value with its own host clock at the moment it polled, and presents that as `SourceTimestamp`.
3. **The spoke host clock** (the OT module's host, a Sparkplug edge node, the interim MES bridge). It stamps `sent_time` and, today, anything the record builder invents.
4. **The hub clock**, which since FB-087 stamps `ingestion_time` and is, by O-2, the master for everything below it.

The owner's rule (O-3, O-4) is met only when Forge knows, for every value, *which* of those clocks stamped it, *how far* that clock is from the master at that moment, and *how much* sampling uncertainty the acquisition added. Two things then follow: the correction `source_time = stamp − offset(stamping clock)` with the original stamp and the offset recorded, and the refusal of any source whose stamping clock cannot be measured.

Sampling is the bound no clock removes: a value polled every 500 ms is known to have occurred somewhere in the last 500 ms before the poll, whatever the clocks say. A subscription with device-side change detection removes that bound down to the device's scan time; a server-side subscription that polls the PLC does not.

## 4. Research: what the standards and vendors provide

### 4.1 Distributing one time

- **NTP, RFC 5905** [FACT]: primary servers are stratum 1 (for example a GPS-disciplined clock), secondary servers one stratum below their source, 16 means unsynchronised. The on-wire protocol measures with four timestamps, origin T1 (client send), receive T2 (server receive), transmit T3 (server send), destination T4 (client receive): offset `θ = ½[(T2−T1) + (T3−T4)]`, round trip `δ = (T4−T1) − (T3−T2)`. Poll intervals range from 16 s to 36 h. The chrony project reports typical accuracy of tens of microseconds on a LAN and a few milliseconds over the Internet, sub-microsecond with hardware timestamping.
- **PTP, IEEE 1588-2019** [FACT]: sub-microsecond on a compliant network with hardware timestamping; the plant profiles are CIP Sync (ODVA: two devices synchronised to better than 100 ns), IEEE 802.1AS for TSN, and PROFINET's PTCP (a reference implementation reports 60 ns over 20 nodes). A Logix controller on CIP Sync reports its own state through the `TimeSynchronize` object: `IsSynchronized` (0/1) and `OffsetFromMaster` in nanoseconds from the most recent Sync message. A 1756-TIME module with a GPS antenna is the usual plant grandmaster.
- **Reference**: a GNSS-disciplined stratum-1 source at the top hub, pool servers as fallback; a plant PTP grandmaster is itself GNSS-disciplined, so NTP in the IT layers and PTP on the plant network trace to the same UTC. "One clock" is one traceable UTC, not one physical oscillator.

### 4.2 Measuring a device's or server's clock over the protocols Forge speaks

- **OPC UA** [FACT]: Part 4 defines `RequestHeader.Timestamp` as "the time the Client sent the request" (used by the server for diagnostics only) and `ResponseHeader.Timestamp` as the time the server sent the response. One service call therefore yields T1 (our send), T3 (server send) and T4 (our receive) but not T2, so the NTP formula reduces to `θ ≈ T3 − (T1+T4)/2` with a worst-case error of `±(T4−T1)/2` from path asymmetry. Part 5's `ServerStatus.CurrentTime` (`i=2258`) is "the current time (UTC) on the Server" and gives the same measurement by an explicit read; FB-089 already does this at every probe. Part 4 §7.11 defines `sourceTimestamp` as "applied to a Variable value by the data source", passed through unchanged by any relaying server, and `serverTimestamp` as applied by each server when it received the value or knew it accurate; both carry a picoseconds companion field. `asyncua` parses the `ResponseHeader` of every response and discards it (`UaClient.read` returns `response.Results`); a wrapper around `send_request` that decodes the header from the buffer, as `check_answer` already does for faults, surfaces T3 on every call without forking the library. `RequestHeader.Timestamp` defaults to construction time in `asyncua`, which is T1 to within microseconds.
- **EtherNet/IP, Logix (CIP)** [FACT]: the controller's wall clock is readable over CIP; `pycomm3.LogixDriver.get_plc_time()` returns a `datetime`, the epoch time in microseconds and a string, and `set_plc_time()` writes it. The same midpoint method applies (T1 before the request, T3 = the returned clock, T4 after). With CIP Sync enabled the `TimeSynchronize` object adds `IsSynchronized` and `OffsetFromMaster` (ns), so the controller states its own synchronisation to the plant grandmaster. (Which GSV attributes name the UTC microsecond value versus the local date-and-time array is to be read off the Logix instruction reference on the target firmware; third-party write-ups disagree.)
- **S7** [FACT]: `python-snap7`'s `Client.get_plc_datetime()` "sends real S7 USER_DATA protocol request to server" and returns the PLC date and time. S7-1500 keeps system time in UTC (`RD_SYS_T`) and synchronises by NTP configured in TIA Portal (up to four servers; vendor-blog sources, to be confirmed against the Siemens system manual). The S7-1500's embedded OPC UA server stamps from the CPU clock, so for that path the device clock and the server clock are one.
- **Modbus** [FACT]: the protocol carries no time. A clock exists only as vendor registers: a Modicon M340 exposes it as system words `%SW49`–`%SW53` in BCD, local time on M340 and UTC on M580 (Schneider FAQ FA230499; register order differs between write-ups, so each map is verified on the device). A Modbus device without such registers never stamps anything, and its clock cannot be read.
- **MQTT, Sparkplug B 3.0** [FACT]: the payload timestamp is "the time at which the message was published" and the metric timestamp "the time at which the value of a metric was captured", both unsigned 64-bit milliseconds since the epoch; both MUST be UTC (`tck-id-payloads-timestamp-in-UTC`, `tck-id-payloads-metric-timestamp-in-UTC`); the metric timestamp MUST be present on every metric in NBIRTH, DBIRTH, NDATA and DDATA (`tck-id-payloads-name-birth-data-requirement`). The specification says nothing about synchronising the edge node's clock, so the edge's clock is governed by declaration and measured one-way (publish stamp against hub receipt) until a two-way exchange exists.

### 4.3 Tolerance classes

[FACT] IEC 61850-5 time-performance classes: T0 10 ms, T1 1 ms, T2 100 µs, T3 25 µs, T4 4 µs, T5 1 µs. T1 is the class for time-tagging events, T3 is adequate for most substation applications, T5 is what phasor measurement needs; NTP and SNTP typically reach T0 or T1. chrony: tens of microseconds on a LAN, a few milliseconds over the Internet. CIP Sync: better than 100 ns.

### 4.4 Fields that carry time quality

[FACT] IEC 61850-7-2 `TimeQuality`: `LeapSecondsKnown`, `ClockFailure` (the time source is unreliable), `ClockNotSynchronized` (not locked to an external clock; during holdover it stays false until accuracy degrades past 1 s), `TimeAccuracy` (0–24 significant fraction-of-second bits, 31 means unspecified; while unsynchronised it describes the internal clock). OPC UA carries `sourceTimestamp` and `serverTimestamp` with picoseconds. Sparkplug carries millisecond UTC and nothing about quality.

### 4.5 What stamps `SourceTimestamp` in practice

[FACT, community-sourced, to be verified on each installation] Kepware: most PLC drivers receive no native hardware timestamp from the device, so KEPServerEX generates and manages the timestamps itself, which is why source and server timestamps usually match; a knowledge-base article (CS320340) covers choosing server versus device timestamp. Ignition: tags read over OPC UA take the server's source timestamp; history in "On Change" sample mode stores that stamp, "Periodic" and "Tag Group" modes store the gateway's; the UA client ignores timestamp-only changes; 8.3 adds a preferred timestamp source per OPC UA connection; a null source timestamp was read as 1601-01-01 before 8.3.2; Inductive Automation's advice for a PLC with a wrong clock is to set the PLC to UTC, not to patch the data. In other words: for the common Kepware-or-Ignition-over-Modbus/EtherNet-IP/S7 path, `SourceTimestamp` is the **server host's** clock at poll time, and the sampling uncertainty is the server's poll interval.

## 5. Recommendation

### P-1 Distribution: one traceable UTC, NTP strata mirroring the hub hierarchy, PTP on the plant network where the devices support it — [PROPOSED]

The top hub is stratum 1 or 2 (GNSS-disciplined, pool fallback); each child hub serves NTP (chrony) to the hubs and spokes below it; every spoke host, OPC UA server host, MES/WMS/ERP host and PLC takes NTP from its hub or from a plant grandmaster that is itself GNSS-disciplined. Where the plant network runs CIP Sync, 802.1AS or PTCP, the devices keep PTP and Forge reads their reported synchronisation state (`IsSynchronized`, `OffsetFromMaster`) as part of the measurement. This is the deployment requirement FB-090 writes down; a device or host that takes time from nowhere fails conformance.

### P-2 Measurement: every OT connection reads the clock it pulls from, on a cadence, with round-trip compensation — [PROPOSED]

Per connection, a *clock probe* on `clock_probe_interval_seconds` (default 30, the FB-070 cadence; minimum 1), by the method the protocol offers:

| Protocol | Method | Stamps obtained | Estimate |
|---|---|---|---|
| OPC UA | `ResponseHeader.Timestamp` on every service call (wrapper on `asyncua` `send_request`) **and** `ServerStatus.CurrentTime` read on the cadence | T1, T3, T4 | `θ = T3 − (T1+T4)/2`, uncertainty `±(T4−T1)/2` |
| EtherNet/IP (Logix) | `WallClockTime` read (`pycomm3.get_plc_time`); `TimeSynchronize.IsSynchronized`, `OffsetFromMaster` when CIP Sync | T1, T3, T4 (+ device-reported offset to its PTP master) | same |
| S7 | `get_plc_datetime` (S7 USER_DATA) | T1, T3, T4 | same; resolution limited by what the CPU returns |
| Modbus | the vendor register map declared in FACTS; none declared means the device has no readable clock | T1, T3, T4 | same |
| Sparkplug B | payload `timestamp` (publish time) against hub receipt, one-way | publish, receipt | `θ ≈ publish − receipt`, includes transit (an upper bound until FB-092's two-way exchange reaches the edge) |

Every sample goes to the existing `ClockOffsetTracker` (FB-089), keyed by the **clock being measured** (`clock_id`: the device, or the server when the server is what stamps), not merely by connection, so a server relaying several PLCs holds one series per PLC it can read and one for itself. The tracker keeps last, mean, min, max, max-abs, breaches and measured-at over a window; the correction uses the current estimate (last sample filtered by an exponentially weighted mean over the window, the NTP practice) and its uncertainty.

### P-3 Correction on entry, recorded on the record — [PROPOSED] (the field half of D-9)

For every value: `source_time = stamp_as_sent − offset(clock_id at that moment)`. The record keeps what was done:

| Field | Meaning |
|---|---|
| `source_time` | the time the value occurred, in master time (corrected) |
| `source_time_as_sent` | the stamp exactly as the stamping clock sent it |
| `source_clock` | which clock stamped it: `device:<name>`, `server:<name>`, `edge:<name>`, `forge` |
| `source_offset_seconds` | the offset subtracted (`stamping clock − master`, the FB-089 sign) |
| `source_uncertainty_seconds` | half the probe round trip plus the sampling bound (P-6) |
| `time_quality` | IEC 61850 `TimeQuality` in Forge's words: `synchronized`, `clock_failure`, `leap_seconds_known`, `accuracy_class` (T0–T5 or `unspecified`) |

`server_time` is corrected the same way by the server's offset; `ingestion_time` is the hub's own; `sent_time` (FB-087's provisional field) becomes `spoke_time` with the same `_as_sent`/offset treatment once FB-092 measures the spoke two-way. These are proto fields 5–10 of `forge.v1.RecordTimestamp`, mirrored in the Go models and the interim bridge's mapper; the FATS/FACTS specs that mention the timestamp are re-stamped and go back to the owner for approval.

### P-4 Which clock stamped it is declared, not guessed — [PROPOSED]

Each connection declares `source_timestamp_origin` in FACTS (P-7): `device` (a PLC-embedded server or a protocol that carries device time), `server` (Kepware, Ignition, Linx and every other host that stamps at poll), `edge` (a Sparkplug edge node), or `forge` (a protocol that carries no stamp at all: Forge's read time is the only stamp there is). The correction uses that clock's offset. Where a server relays PLC-side stamps, the declaration names the PLC as the clock and the server must expose it (P-2); where it cannot, the origin is `server` and the uncertainty carries the server's poll interval. A declaration that contradicts the wire (a `device` origin whose `SourceTimestamp` tracks the server's clock, detectable because the two series move together) is a conformance failure.

### P-5 Fail closed — [PROPOSED]

A connection whose clock cannot be read for three consecutive probes (90 s at the default cadence) enters `CLOCK_UNREADABLE`: its provider is stopped, its tags are not pulled, the connection status says so, an alarm is raised, and the FB-070 restart loop does not apply (this is a refusal, not a recovery). A connection whose offset exceeds its tolerance class (P-8) for three consecutive probes enters `CLOCK_OUT_OF_TOLERANCE` with the same effect (the FB-093 enforcement, applied to OT links). Either state clears after three consecutive good probes. A device-reported `IsSynchronized = 0` or `ClockNotSynchronized` counts as out of tolerance. None of this is a warning: the connection does not deliver data while in either state.

### P-6 The sampling bound is declared per tag and recorded per value — [PROPOSED]

Each tag carries `max_sampling_uncertainty_ms` (default: its poll interval, or the server's publishing interval for a subscription that polls the device). A tag whose requirement is tighter than what its acquisition can give is a configuration error, refused at load. The acquisition's actual bound goes into `source_uncertainty_seconds` on every value. Change-driven subscriptions with device-side stamps are preferred wherever the device offers them (PLC-embedded OPC UA servers, CIP Sync timestamped I/O, Sparkplug edges that stamp at capture); the FACTS declaration says which tags have them.

### P-7 FACTS `time_governance` (FB-090) — [PROPOSED]

A required section per spoke and, for the OT module, per connection:

```json
"time_governance": {
  "time_source": "hub-ntp | site-ptp | gnss",
  "sync_protocol": "ntp | ptp-cip-sync | ptp-802.1as | profinet-ptcp | none",
  "clock_read_method": "opcua-response-header | opcua-current-time | cip-wall-clock-time | s7-clock | modbus-registers | sparkplug-payload-timestamp",
  "clock_probe_interval_seconds": 30,
  "source_timestamp_origin": "device | server | edge | forge",
  "tolerance_class": "T0 | T1 | T2 | T3 | T4 | T5 | it-lan | it-wan | edge-mqtt",
  "fail_closed": true
}
```

`fail_closed` must be `true`; the blocking check `facts:time-governed` fails a spec that omits the section, declares `none` for `sync_protocol`, or names a `clock_read_method` the connection's protocol cannot perform.

### P-8 Tolerance classes per link — [PROPOSED] (the tolerance half of D-9)

| Class | Links | Tolerance | Basis |
|---|---|---|---|
| T1 | PLC event and alarm stamps, sequence-of-events, CIP Sync / PTP devices | 1 ms | IEC 61850-5 T1, the class for time-tagged events; reachable only with PTP, so a device without PTP declares T0 |
| T0 | polled process values over OPC UA / CIP / S7 from NTP-synced devices and servers | 10 ms | IEC 61850-5 T0; NTP on a LAN gives tens of µs, so 10 ms is margin, not precision |
| it-lan | MES, WMS, ERP and other spoke hosts on the site LAN; the OT module's host | 10 ms | chrony LAN performance with margin for virtual machines |
| it-wan | hub to hub, remote spokes | 100 ms | chrony Internet performance (a few ms) with margin for asymmetric paths |
| edge-mqtt | Sparkplug edges measured one-way | 500 ms | the one-way estimate includes transit and broker hops; replaced by it-lan/it-wan once FB-092 reaches the edge |

These replace FB-089's provisional process-wide `FORGE_CLOCK_TOLERANCE_SECONDS`. Finer classes (T2–T5) are declared only where a device reports PTP synchronisation.

### P-9 The hub-to-spoke exchange (FB-092) — [PROPOSED]

The NTP four-timestamp exchange in-band on the existing RPCs: the spoke sends T1 in the request, the hub returns T2 (receive) and T3 (transmit) in the Register, Health and Ingest responses, the spoke takes T4 and computes `θ` and `δ` by RFC 5905; the spoke reports its `θ` in the next Health and the hub keeps the series on `AdapterHealth.clock["spoke"]` with the two-way value replacing today's one-way one. Child hubs do the same toward their parent. No new protocol, no new RPC.

### P-10 Where the correction lives — [PROPOSED]

In the spoke's record builder, at the first point where the stamp and the measured clock meet (`modules/ot/context/record_builder.py`, the OPC-UA converter, the Sparkplug codec, the Logix and S7 providers when they exist), never downstream: a record leaves the spoke already corrected and already carrying its original stamp, offset and uncertainty, and the hub's FB-089 tracker then measures the spoke itself. The hub never corrects a `source_time` a second time.

## 6. Implementation plan (after signature)

| Step | Scope | Backlog | Size |
|---|---|---|---|
| 1 | No invented stamps: a value without a source stamp is rejected unless the connection declares `origin: forge`, in which case Forge's read time is the stamp with the poll bound as uncertainty | FB-088 | S |
| 2 | Clock readers: OPC UA response-header wrapper and `CurrentTime` probe on the cadence (extending FB-089's probe), Logix `WallClockTime` + `TimeSynchronize`, S7 clock, Modbus register map, Sparkplug publish-time; `ClockOffsetTracker` keyed by `clock_id` | FB-094 | M |
| 3 | The six fields of P-3 on `RecordTimestamp`, the proto, the Go models and the interim bridge mapper; correction on entry in the builders (P-10); FATS/FACTS re-stamped for the owner | FB-094, D-9 | M |
| 4 | FACTS `time_governance` schema, `facts:time-governed` blocking check, the section in all nine specs (the OT spec with D-8), the deployment requirement written down | FB-090 | M |
| 5 | Fail closed in `PlcConnectionManager`: `CLOCK_UNREADABLE`, `CLOCK_OUT_OF_TOLERANCE`, alarm, no restart loop | FB-093 (OT) | S |
| 6 | Per-tag `max_sampling_uncertainty_ms`, refusal at load, `source_uncertainty_seconds` on every value, subscription preference | FB-094 | S |
| 7 | Hub-to-spoke four-timestamp exchange in the contract; `sent_time` becomes `spoke_time` | FB-092 | M |
| 8 | Clock agreement as a curation quality dimension from the tracker | FB-091 | S |

## 7. Vendor matrix

| System | What stamps `SourceTimestamp` | How the clock is read | How it is synced | Resolution | Confidence |
|---|---|---|---|---|---|
| Rockwell Logix via Kepware / Ignition / FactoryTalk Linx (OPC UA) | the server host at poll time (origin `server`) | `CurrentTime` and response headers give the **server**; the PLC's own clock via `get_plc_time` over CIP if Forge also opens a CIP session | NTP on the server host; CIP Sync on the PLC | ms (server poll) | community-sourced; verify on each server |
| Rockwell Logix direct (CIP, pycomm3) | Forge's read time (origin `forge`) unless CIP Sync timestamped I/O or a PLC-side event log | `WallClockTime` (µs since epoch), `TimeSynchronize.IsSynchronized` / `OffsetFromMaster` | CIP Sync (PTP) from a 1756-TIME grandmaster, or NTP via the controller's time sync | µs clock; ns reported offset | vendor documentation |
| Siemens S7-1500 embedded OPC UA server | the CPU clock (origin `device`; device and server are one) | `CurrentTime`, response headers | NTP in TIA Portal (UTC system time) | ms | vendor documentation for the instructions; NTP details from a tutorial, verify |
| Siemens S7 direct (snap7) | Forge's read time (origin `forge`) | `get_plc_datetime` | NTP (S7-1500) or none (S7-300/400 without a time master) | s to ms, to verify per CPU | library documentation |
| Kepware KEPServerEX, any driver | the server host, unless the driver has a device timestamp | `CurrentTime`, response headers | NTP on the host | ms | community-sourced (PTC community); verify per driver |
| Ignition gateway (OPC UA server and bridge) | passes its OPC servers' source stamps; history mode decides what is stored; 8.3 preferred-timestamp setting | `CurrentTime`, response headers | NTP on the gateway host | ms | forum and docs; verify on the installation |
| Modbus devices (meters, drives, small PLCs) | nothing (origin `forge`) | vendor registers where they exist (Modicon `%SW49`–`%SW53`); otherwise unreadable | NTP on PLC families that support it (M580); none on most devices | s | vendor FAQ; verify the register map per device |
| Sparkplug B edge nodes | the edge at capture (origin `edge`) | publish timestamp, one-way | the edge host's NTP, declared in FACTS | ms | specification |
| Historians (Canary, PI, Ignition historian) as sources | whatever the collector stored; the origin is whatever the collector's origin was | not applicable (the historian host's clock via its API where it exposes one) | NTP on the host | as stored | declared per spoke; verify per product |

## 8. Open questions for the owner

| # | Question | Tag |
|---|---|---|
| Q-1 | Approve the tolerance classes and values of P-8, or set different numbers. | [OPEN] |
| Q-2 | Approve the field names of P-3 (`source_time_as_sent`, `source_clock`, `source_offset_seconds`, `source_uncertainty_seconds`, `time_quality`) and the rename of `sent_time` to `spoke_time`. | [OPEN] |
| Q-3 | A device that never stamps anything (Modbus without clock registers, S7 or Logix read directly): O-4 says a device whose clock cannot be read is not a valid source. P-4 and step 1 propose that such a device may be pulled with `origin: forge`, because the only stamp that exists is Forge's own governed read time and the poll bound is recorded as uncertainty. Is that acceptable, or is a readable device clock required even when the device does not stamp? | [OPEN] |
| Q-4 | Default probe cadence 30 s (P-2); the fail-closed thresholds of three consecutive probes (P-5). | [OPEN] |
| Q-5 | Where a device supports PTP (CIP Sync, PTCP), is PTP required or is NTP-synced acceptable with class T0 declared? | [OPEN] |
| Q-6 | The exchange of P-9 changes `forge.v1.AdapterService`; the re-stamped FATS/FACTS specs return to you for approval. Proceed in that order (fields first, exchange second), or exchange first? | [OPEN] |

## 9. Sources

- RFC 5905, Network Time Protocol Version 4: https://www.rfc-editor.org/rfc/rfc5905.html (stratum §3 and Figure 11, four timestamps §7.3, offset and delay §8, poll intervals §5 and §7.3)
- chrony project, accuracy figures: https://chrony-project.org/
- IEC 61850-5 time-performance classes, OMICRON/PAC World: https://www.pacw.org/time-in-iec-61850-based-substation-protection-and-control-systems ; WSU WPRC 2020 paper: https://esic.wsu.edu/documents/2023/10/western-protective-relay-conference-2020-time-in-substation-protection-and-control-systems-principles-and-applications.pdf
- IEC 61850-7-2 `TimeQuality` (amendment excerpt): https://redmine.ucaiug.org/attachments/download/3278/61850-7-2%20pp45-47%20qualityFlags.pdf ; Beckhoff TF6510 flags: https://infosys.beckhoff.com/content/1031/tf6510_tc3_iec61850/13846206475.html
- OPC UA Part 4 §7.32 `RequestHeader`: https://reference.opcfoundation.org/v105/Core/docs/Part4/7.32 ; `ResponseHeader.Timestamp` discussion: https://opcfoundation.org/forum/opc-ua-standard/validity-of-timestamp-in-responseheader ; Part 4 §7.11 `DataValue`: https://reference.opcfoundation.org/specs/OPC-10000-4/7.11 ; Part 5 §12.10 `ServerStatusDataType`: https://reference.opcfoundation.org/Core/Part5/12.10
- ODVA CIP Sync: https://www.odva.org/technology-standards/distinct-cip-services/cip-sync/
- Rockwell, `TimeSynchronize` object: https://www.rockwellautomation.com/en-fi/docs/studio-5000-logix-designer/37-00/contents-ditamap/instruction-set/input-output-instructions/access-the-timesynchronize-object.html ; coordinated system time: https://prod-aem.rockwellautomation.com/en-se/docs/studio-5000-logix-designer/37-00/contents-ditamap/studio-5000-logix-designer/access-remote-i-o/coordinated-system-time.html ; ControlLogix time synchronisation overview: https://theautomationblog.com/time-synchronization-in-controllogix-systems/
- pycomm3 `LogixDriver.get_plc_time` / `set_plc_time`: https://pycomm3.readthedocs.io/en/latest/api_reference/logix_driver.html
- python-snap7 `Client.get_plc_datetime`: https://python-snap7.readthedocs.io/en/latest/API/client.html
- Siemens S7 clock instructions and NTP in TIA Portal (vendor-adjacent tutorials, to be confirmed against the S7-1500 system manual): https://industrialmonitordirect.com/blogs/knowledgebase/reading-time-from-siemens-s7-plc-sfc1-read-clk-and-tod-format ; https://industrialmonitordirect.com/ro/blogs/knowledgebase/ntp-server-configuration-on-s7-1500-plcs-and-hmi-in-tia-portal
- Schneider Modicon M340/M580 clock words: https://www.se.com/ph/en/faqs/FA230499/ ; register map write-up: https://industrialmonitordirect.com/blogs/knowledgebase/schneider-m340-rtc-system-words-sw50-sw53-configuration
- Sparkplug 3.0 payloads chapter (normative timestamp statements): https://github.com/eclipse-sparkplug/sparkplug/blob/master/specification/src/main/asciidoc/chapters/Sparkplug_6_Payloads.adoc
- Kepware timestamps (PTC community): https://community.ptc.com/kepware-396/question-regarding-servertimestamp-and-sourcetimestamp-175527 ; KB CS320340: https://www.ptc.com/en/support/article/CS320340
- Ignition timestamps: https://forum.inductiveautomation.com/t/history-t-stamp-in-the-future/29507 ; https://forum.inductiveautomation.com/t/source-timestamping-in-opcua-driver/4860 ; https://forum.inductiveautomation.com/t/fixing-a-5-hour-opc-timestamp-offset-plc-to-ignition/114182 ; `timestampOf`: https://docs.inductiveautomation.com/docs/8.3/appendix/expression-functions/advanced/timestampOf
- PTP accuracy, general: https://www.electronicdesign.com/home/article/21201671/ieee-1588-to-transform-timing-synchronization ; PROFINET IRT reference implementation: https://zhaw.ch/en/engineering/institutes-centres/ines/products-and-services/profinet
- `asyncua` 2.1.0 source, `asyncua/client/ua_client.py` (`check_answer`, `_setup_request_header`, `UaClient.read`), in the project's virtual environment.
