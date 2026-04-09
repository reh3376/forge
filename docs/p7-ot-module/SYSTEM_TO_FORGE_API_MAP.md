# system.* → forge.* API Mapping Reference

**Version**: 1.0.0
**Phase**: P7 OT Module — Phase 6 (Script Migration)
**Scope**: All 52 unique `system.*` API calls found across 430 hand-written Ignition Jython 2.7 scripts in `whk-distillery01-ignition-global`

---

## How to Use This Document

This is the conversion guide for migrating Ignition Jython scripts to Forge Python 3.12+.
Each entry shows the Ignition call, its Forge equivalent, and key behavioral differences.

**General migration rules:**

1. All Forge calls are **async** — add `await` and make the calling function `async def`
2. Forge uses **keyword arguments** where Ignition uses positional
3. Java types become Python types (`ArrayList` → `list`, `BasicDataset` → `Dataset`)
4. Java `SimpleDateFormat` patterns → Python `strftime` (see `forge.date` converter)
5. Error handling uses Python exceptions, not Java try/catch

---

## forge.tag (→ system.tag.*)

| # | Ignition API | Count | Forge Equivalent | Notes |
|---|-------------|-------|------------------|-------|
| 1 | `system.tag.readBlocking([paths])` | 39 | `await forge.tag.read(path)` / `await forge.tag.read_multiple(paths)` | Returns `TagReadResult` (value, quality, timestamp). Single path returns one result; list returns list. |
| 2 | `system.tag.writeBlocking([paths], [values])` | 35 | `await forge.tag.write(path, value)` | One tag at a time. For batch writes, loop or use list comprehension with `asyncio.gather()`. |
| 3 | `system.tag.browseTags(path)` | 8 | `await forge.tag.browse(path)` | Returns list of `BrowseNode` (name, path, type, value). |
| 4 | `system.tag.getConfiguration(path)` | 3 | `await forge.tag.get_config(path)` | Returns dict of tag configuration properties. |
| 5 | `system.tag.exists(path)` | 2 | `await forge.tag.exists(path)` | Returns `bool`. |
| 6 | `system.tag.read(path)` | 4 | `await forge.tag.read(path)` | Legacy Ignition API; same Forge target as `readBlocking`. |

**Migration example:**
```python
# Ignition Jython 2.7
vals = system.tag.readBlocking(["[WHK01]Distillery01/TIT_2010/Out_PV"])
temp = vals[0].value

# Forge Python 3.12+
result = await forge.tag.read("WH/WHK01/Distillery01/TIT_2010/Out_PV")
temp = result.value
```

---

## forge.db (→ system.db.*)

| # | Ignition API | Count | Forge Equivalent | Notes |
|---|-------------|-------|------------------|-------|
| 7 | `system.db.runPrepQuery(query, args, db)` | 28 | `await forge.db.query(sql, params, database=db)` | Returns `QueryResult` with `.rows`, `.columns`, `.row_count`. |
| 8 | `system.db.runPrepUpdate(query, args, db)` | 15 | `await forge.db.query(sql, params, database=db)` | Same method — Forge unifies query/update. Check `result.rows_affected`. |
| 9 | `system.db.runNamedQuery(path, params)` | 12 | `await forge.db.named_query(name, params)` | Named queries registered via `forge.db.register_named_query()`. |
| 10 | `system.db.runScalarQuery(query, db)` | 5 | `await forge.db.scalar(sql, params, database=db)` | Returns single value directly (not wrapped). |
| 11 | `system.db.runQuery(query, db)` | 3 | `await forge.db.query(sql, database=db)` | Unparameterized — prefer parameterized `query()` for safety. |
| 12 | `system.db.beginTransaction(db)` | 2 | `async with forge.db.transaction(database=db) as tx:` | Context manager — auto-commits on success, auto-rollbacks on exception. |
| 13 | `system.db.commitTransaction(tx)` | 2 | *(implicit — handled by context manager exit)* | No explicit commit needed. |
| 14 | `system.db.rollbackTransaction(tx)` | 1 | *(implicit — raise exception inside `async with` block)* | Raise any exception to trigger rollback. |
| 15 | `system.db.closeTransaction(tx)` | 1 | *(implicit — context manager handles cleanup)* | No explicit close needed. |

**Migration example:**
```python
# Ignition Jython 2.7
results = system.db.runPrepQuery(
    "SELECT * FROM work_orders WHERE status = ?", ["OPEN"], "cmms_db"
)

# Forge Python 3.12+
result = await forge.db.query(
    "SELECT * FROM work_orders WHERE status = $1",
    params=["OPEN"],
    database="cmms_db",
)
for row in result.rows:
    print(row)
```

---

## forge.net (→ system.net.*)

| # | Ignition API | Count | Forge Equivalent | Notes |
|---|-------------|-------|------------------|-------|
| 16 | `system.net.httpGet(url, headers)` | 18 | `await forge.net.http_get(url, headers=headers)` | Returns `HttpResponse` (status_code, text, json, headers). |
| 17 | `system.net.httpPost(url, data, headers)` | 14 | `await forge.net.http_post(url, data=data, headers=headers)` | `data` is auto-serialized to JSON if dict. |
| 18 | `system.net.httpPut(url, data, headers)` | 3 | `await forge.net.http_put(url, data=data, headers=headers)` | Same pattern as POST. |
| 19 | `system.net.httpDelete(url, headers)` | 2 | `await forge.net.http_delete(url, headers=headers)` | Returns `HttpResponse`. |

**Migration example:**
```python
# Ignition Jython 2.7
response = system.net.httpPost(
    "https://api.whiskeyhouse.com/v1/orders",
    system.util.jsonEncode(payload),
    {"Content-Type": "application/json"}
)

# Forge Python 3.12+
response = await forge.net.http_post(
    "https://api.whiskeyhouse.com/v1/orders",
    data=payload,  # auto-serialized
    headers={"Content-Type": "application/json"},
)
```

---

## forge.log (→ system.util.getLogger)

| # | Ignition API | Count | Forge Equivalent | Notes |
|---|-------------|-------|------------------|-------|
| 20 | `system.util.getLogger(name)` | 123 | `forge.log.get(name)` | Returns `ForgeLogger` with structured JSON output. |
| 21 | `logger.info(msg)` | — | `logger.info(msg)` | Same API. Forge adds structured fields (timestamp, script, level). |
| 22 | `logger.warn(msg)` | — | `logger.warning(msg)` | Python convention: `warning` not `warn`. |
| 23 | `logger.error(msg)` | — | `logger.error(msg)` | Same API. |
| 24 | `logger.debug(msg)` | — | `logger.debug(msg)` | Same API. |

**Migration example:**
```python
# Ignition Jython 2.7
logger = system.util.getLogger("cmms.work_orders")
logger.info("Created work order %s" % wo_id)

# Forge Python 3.12+
logger = forge.log.get("cmms.work_orders")
logger.info(f"Created work order {wo_id}")
```

---

## forge.date (→ system.date.*)

| # | Ignition API | Count | Forge Equivalent | Notes |
|---|-------------|-------|------------------|-------|
| 25 | `system.date.now()` | 15 | `forge.date.now()` | Returns timezone-aware `datetime` (UTC default). |
| 26 | `system.date.format(date, pattern)` | 11 | `forge.date.format(dt, pattern)` | Java `SimpleDateFormat` patterns auto-converted to `strftime`. |
| 27 | `system.date.parse(string, pattern)` | 7 | `forge.date.parse(string, pattern)` | Same auto-conversion for patterns. |
| 28 | `system.date.toMillis(date)` | 4 | `forge.date.to_millis(dt)` | Returns `int` (epoch milliseconds). |
| 29 | `system.date.fromMillis(millis)` | 3 | `forge.date.from_millis(millis)` | Returns timezone-aware `datetime`. |
| 30 | `system.date.midnight(date)` | 3 | `forge.date.midnight(dt)` | Returns midnight of the given date. |
| 31 | `system.date.addHours(date, hours)` | 6 | `forge.date.add_hours(dt, hours)` | Returns new `datetime`. |
| 32 | `system.date.addMinutes(date, mins)` | 4 | `forge.date.add_minutes(dt, minutes)` | Returns new `datetime`. |
| 33 | `system.date.addSeconds(date, secs)` | 2 | `forge.date.add_seconds(dt, seconds)` | Returns new `datetime`. |
| 34 | `system.date.addDays(date, days)` | 3 | `forge.date.add_days(dt, days)` | Returns new `datetime`. |
| 35 | `system.date.secondsBetween(d1, d2)` | 2 | `forge.date.seconds_between(dt1, dt2)` | Returns `int` (absolute difference). |
| 36 | `system.date.getHour24(date)` | 1 | `forge.date.get_hour(dt)` | Returns 0-23 int. |
| 37 | `system.date.getYear(date)` | 1 | `forge.date.get_year(dt)` | Returns 4-digit year. |
| 38 | `system.date.getDayOfYear(date)` | 1 | `forge.date.get_day_of_year(dt)` | Returns 1-366 int. |

**Migration example:**
```python
# Ignition Jython 2.7
now = system.date.now()
formatted = system.date.format(now, "yyyy-MM-dd HH:mm:ss")
one_hour_ago = system.date.addHours(now, -1)

# Forge Python 3.12+
now = forge.date.now()
formatted = forge.date.format(now, "yyyy-MM-dd HH:mm:ss")  # Java pattern auto-converted
one_hour_ago = forge.date.add_hours(now, -1)
```

---

## forge.dataset (→ system.dataset.*)

| # | Ignition API | Count | Forge Equivalent | Notes |
|---|-------------|-------|------------------|-------|
| 39 | `system.dataset.toDataSet(headers, data)` | 8 | `forge.dataset.create(columns, rows)` | Returns `Dataset` dataclass (not Java BasicDataset). |
| 40 | `system.dataset.toPyDataSet(dataset)` | 6 | `forge.dataset.to_py_dataset(dataset)` | Returns list of dicts (equivalent to Ignition's PyDataSet). |
| 41 | `system.dataset.addRow(dataset, row)` | 3 | `forge.dataset.add_row(dataset, row)` | Mutates in-place, returns dataset. |
| 42 | `system.dataset.deleteRows(dataset, rows)` | 2 | `forge.dataset.delete_rows(dataset, indices)` | Removes rows at given indices. |
| 43 | `system.dataset.setValue(ds, row, col, val)` | 2 | `forge.dataset.set_value(dataset, row, col, value)` | Column by index or name. |
| 44 | `system.dataset.getColumnHeaders(dataset)` | 1 | `forge.dataset.get_column_headers(dataset)` | Returns list of column name strings. |

**Migration example:**
```python
# Ignition Jython 2.7
headers = ["tag_path", "value", "quality"]
data = [["TIT_2010", 172.5, "Good"], ["LIT_6050B", 847.3, "Good"]]
ds = system.dataset.toDataSet(headers, data)
pyds = system.dataset.toPyDataSet(ds)

# Forge Python 3.12+
ds = forge.dataset.create(
    columns=["tag_path", "value", "quality"],
    rows=[["TIT_2010", 172.5, "Good"], ["LIT_6050B", 847.3, "Good"]],
)
records = forge.dataset.to_py_dataset(ds)  # list[dict]
```

---

## forge.util (→ system.util.* miscellaneous)

| # | Ignition API | Count | Forge Equivalent | Notes |
|---|-------------|-------|------------------|-------|
| 45 | `system.util.jsonEncode(obj)` | 10 | `forge.util.json_encode(obj)` | Uses Python `json.dumps`. Supports `indent` kwarg. |
| 46 | `system.util.jsonDecode(string)` | 8 | `forge.util.json_decode(string)` | Uses Python `json.loads`. |
| 47 | `system.util.getGlobals()` | 3 | `forge.util.get_globals()` | Returns shared dict for cross-script state. |
| 48 | `system.util.sendMessage(handler, payload)` | 3 | `await forge.util.send_message(handler, payload)` | Async. Returns `bool` success. |
| 49 | `system.util.sendRequest(project, handler, payload)` | 2 | `await forge.util.send_request(project, handler, payload)` | Async. Returns handler response or raises `RuntimeError`. |

---

## forge.perspective (→ system.perspective.*)

| # | Ignition API | Count | Forge Equivalent | Notes |
|---|-------------|-------|------------------|-------|
| 50 | `system.perspective.sendMessage(handler, payload, scope)` | 5 | `await forge.perspective.send_message(handler, payload, scope=scope)` | Dispatched via Forge event bus. Scope: page/session/gateway. |
| 51 | `system.perspective.navigate(page)` | 3 | `await forge.perspective.navigate(page)` | Publishes `hmi.navigate` event. |
| 52 | `system.perspective.openPopup(popup_id, view, params)` | 2 | `await forge.perspective.open_popup(popup_id, view_path, params=params)` | Publishes `perspective.popup.open` event. |

---

## forge.security (→ system.security.* / system.user.*)

These calls were identified but occur <5 times total. Forge equivalents are provided for completeness:

| Ignition API | Forge Equivalent |
|-------------|------------------|
| `system.security.getUsername()` | `forge.security.get_username()` |
| `system.security.getRoles()` | `(await forge.security.get_user()).roles` |
| `system.user.getUser(source, username)` | `await forge.security.get_user(username)` |

---

## forge.file (→ system.file.*)

These calls were identified but occur <5 times total:

| Ignition API | Forge Equivalent |
|-------------|------------------|
| `system.file.readFileAsString(path)` | `await forge.file.read_text(path)` |
| `system.file.writeFile(path, data)` | `await forge.file.write_text(path, data)` |
| `system.file.fileExists(path)` | `await forge.file.exists(path)` |

**Important**: Forge file operations are sandboxed — all paths are relative to a configured base directory. Absolute paths and traversal (`../`) are rejected.

---

## forge.alarm (→ system.alarm.*)

Alarm operations use the existing Phase 2B `forge.alarm` module:

| Ignition API | Forge Equivalent |
|-------------|------------------|
| `system.alarm.queryStatus()` | `await forge.alarm.get_active()` |
| `system.alarm.acknowledge([ids])` | `await forge.alarm.ack(alarm_ids, user)` |
| `system.alarm.getShelvedPaths()` | `await forge.alarm.get_active(state="SHELVED")` |

---

## Calls With No Direct Forge Equivalent

These Ignition-specific calls have no 1:1 mapping but are handled by Forge patterns:

| Ignition API | Forge Alternative |
|-------------|-------------------|
| `system.util.invokeAsynchronous(func)` | `forge.util.invoke_async(func)` — wraps in `asyncio.create_task()` |
| `system.perspective.download(filename, data)` | `await forge.perspective.download(filename, data)` |
| `system.perspective.print()` | `await forge.perspective.print_page()` |
| `system.util.getProjectName()` | `forge.util.get_project_name()` |
| `system.util.getProperty(key)` | `forge.util.get_property(key, default)` — reads from env vars |

---

## Migration Scope Summary

| Category | Script Count | Migration Path |
|----------|-------------|----------------|
| Auto-generated OpenAPI clients | 1,109 | **SKIP** — dead code, replaced by dedicated module adapters |
| CMMS middleware (`exchange/cmms/`) | 57 | **SKIP** — replaced by `whk-cmms` adapter module |
| MES integration (`core/mes/`, `core/OrderManagement/`) | 56 | **SKIP** — replaced by `whk-mes` adapter module |
| WMS barrel printing / sync | ~30 | **SKIP** — replaced by `whk-wms` adapter module |
| OT/SCADA control scripts | ~15 | **CONVERT** — Tier 1 priority (OT Module native) |
| Utility / shared libraries (`Framework/`, `core/util/`) | ~25 | **CONVERT** — Tier 1 (used by OT scripts) |
| HMI/Perspective UI scripts | ~27 | **CONVERT** — Tier 2 (via forge.perspective bridge) |
| Alarm handlers (`general/alarm_messenger/`) | ~24 | **CONVERT** — Tier 2 (via forge.alarm) |
| ORM layer (`plastic/`) | 14 | **EVALUATE** — May be replaced by forge.db patterns |
| Integration scripts (Atlassian, Azure) | 5 | **SKIP** — external integrations handled by dedicated services |
| WebDev endpoints (`com.inductiveautomation.webdev/`) | 192 | **CONVERT** — Tier 2 (via `@forge.api.route` decorators) |
