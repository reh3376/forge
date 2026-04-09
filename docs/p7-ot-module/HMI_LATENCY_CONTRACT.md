# HMI Latency Contract — OT Module Tag Access Performance

**Status:** Active
**Owner:** OT Module (P7)
**Consumer:** Forge UI / HMI Builder Module
**Date:** 2026-04-08

## Performance Requirement

All tag value reads and context enrichment must complete within **300ms end-to-end** as measured from the HMI render loop requesting a tag value to the enriched result being available for display. This is a hard requirement driven by ISA-101 HMI design standards (which recommend < 250ms for primary process displays).

## Latency Budget Breakdown

| Stage | Target | Mechanism |
|-------|--------|-----------|
| Tag value lookup | < 1ms | In-memory dict (`TagRegistry._values`) |
| Path resolution (area, site, equipment) | < 1ms (cached) / < 5ms (cold) | `EnrichmentPipeline._path_cache` dict |
| Dynamic context (batch, mode) | < 1ms | Area-keyed dict lookups |
| Record assembly | < 2ms | Pydantic model construction |
| **Total enrichment pipeline** | **< 5ms** | All in-memory, no I/O |
| Network transport (hub → HMI) | < 50ms | Local network / IPC |
| HMI render cycle | < 100ms | Frontend framework budget |
| **End-to-end budget** | **< 155ms** | Well within 300ms |

## Architecture Decisions Supporting < 300ms

### 1. All Tag Values Are In-Memory (D1)

`TagRegistry._values` is a Python dict keyed by tag path. Lookups are O(1) hash access. At WHK's scale (~5,000 tags), the entire working set fits in < 50MB RAM. There are no database queries on the read path.

### 2. Path Resolution Is Cached (D2)

The `EnrichmentPipeline` caches path-based resolution results (area, site, equipment_id) after the first call per tag path. These fields are deterministic for a given path and resolver configuration — they only change on config reload (rare).

- Cache hit: dict lookup, ~100ns
- Cache miss: regex match + string split, ~5μs
- Cache invalidation: `invalidate_path_cache()` on config reload, `invalidate_path(tag_path)` for single eviction

### 3. Dynamic Fields Are O(1) Dict Lookups (D3)

Batch context and operating mode are keyed by area name. WHK has ~10 areas, so these dicts are tiny. Resolution is a single dict.get() call.

### 4. No Disk I/O on the Read Path (D4)

The store-and-forward SQLite buffer is only used on the **write path** (buffering records when the hub is disconnected). The read path — which is what the HMI uses — never touches disk.

### 5. Subscription-Based Push Model (D5)

The OT adapter supports subscription callbacks (`subscribe(tags, callback)`). The HMI module should subscribe to tag changes rather than polling. This means:
- Values are pushed on change, not requested on a timer
- The HMI display updates reactively, not on a fixed polling interval
- Network round-trips are eliminated for subscribed tags

## What the HMI Module Must Do

1. **Subscribe to tags** via `OTModuleAdapter.subscribe()` rather than polling `collect()`
2. **Cache tag definitions** locally — definitions are immutable and don't need re-fetching
3. **Use the i3X Browse API** only for initial tag discovery and navigation, not for live values
4. **Batch value requests** when bulk-reading (the registry's `get_tag_and_value()` avoids two separate dict lookups)

## What Must NOT Be on the Hot Path

These operations are acceptable during setup or config but must never run during the HMI render loop:

- Tag template instantiation (one-time during configuration)
- Resolver rule compilation (one-time on startup or config reload)
- Store-and-forward buffer operations (write path only)
- i3X browse API calls (discovery/navigation, not live values)
- `EnrichmentPipeline.invalidate_path_cache()` (config reload only)

## Monitoring

The `EnrichmentPipeline.path_cache_size` property exposes the number of cached path resolutions. A healthy system at steady state should show `path_cache_size == total_tag_count`. If cache size drops to 0 unexpectedly, it indicates an unintended cache invalidation.

## Scan Class Intervals (Reference)

| Scan Class | Interval | Use Case |
|------------|----------|----------|
| CRITICAL | 100ms | Safety interlocks, active alarms |
| HIGH | 500ms | Active process values |
| STANDARD | 1000ms | Normal monitoring (default) |
| SLOW | 5000ms | Ambient, utility, rarely-changing |

The HMI must handle tags at all scan classes. The 300ms budget applies to the time from value change to screen update, not the scan interval itself.
