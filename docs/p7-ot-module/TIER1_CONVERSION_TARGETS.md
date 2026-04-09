# Tier 1 Script Conversion Targets

**Phase**: P7 OT Module — Phase 6.1 (Epic 6.1.2: Identify Migration Scope)
**Date**: 2026-04-09
**Total Tier 1 files**: 82 (of 430 hand-written; 1,109 auto-generated excluded)

---

## Conversion Decision Matrix

Scripts fall into four categories based on their relationship to Forge modules:

| Decision | Count | Meaning |
|----------|-------|---------|
| **CONVERT** | 42 | Rewrite to Python 3.12+ using forge.* SDK |
| **REPLACE** | 18 | Functionality absorbed by existing Forge module/adapter |
| **DEFER** | 14 | Tier 2 — UI/Perspective scripts converted after OT core |
| **DROP** | 8 | Dead code, duplicates, or developer-only tooling |

---

## 1. Framework/ (5 files)

| File | Decision | Rationale |
|------|----------|-----------|
| `Framework/Popup/code.py` | DEFER | HMI — uses `forge.perspective.open_popup()` when ready |
| `Framework/Tags/code.py` | CONVERT | Core tag browsing → `forge.tag.browse()` |
| `Framework/Constructors/code.py` | DROP | Uses Ignition Document API (Java); no OT value |
| `Framework/Environment/code.py` | CONVERT | `.env` loading → `forge.util.get_property()` |
| `Framework/Documents/code.py` | DROP | Ignition Document API; no OT value |

---

## 2. core/util/ (14 files)

| File | Decision | Rationale |
|------|----------|-----------|
| `core/util/Colors/code.py` | DEFER | UI styling — no OT dependency |
| `core/util/Exports/code.py` | CONVERT | Tag export → `forge.tag.browse()` + `forge.file` |
| `core/util/File/code.py` | REPLACE | Direct map → `forge.file` module |
| `core/util/Log/code.py` | REPLACE | Direct map → `forge.log` module |
| `core/util/Navigation/code.py` | CONVERT | Zone/tag browsing → `forge.tag.browse()` |
| `core/util/Notifications/code.py` | DEFER | HMI messaging → `forge.perspective.send_message()` |
| `core/util/OpenPopup/code.py` | DEFER | HMI popup → `forge.perspective.open_popup()` |
| `core/util/Parse/code.py` | CONVERT | Serial/barcode parsing — pure Python rewrite |
| `core/util/Time/code.py` | REPLACE | UTC↔ET conversion → `forge.date` with timezone |
| `core/util/Typing/Dataset/code.py` | REPLACE | Dataset↔JSON → `forge.dataset.to_json()/from_json()` |
| `core/util/Typing/checks/code.py` | CONVERT | Email/date validation — pure Python rewrite |
| `core/util/Typing/identifiers/code.py` | DROP | UUID generation — `import uuid` in stdlib |
| `core/util/Numerical/code.py` | DROP | Fraction conversion — rarely used, stdlib `fractions` |
| `core/util/csv/barcodeCSVParsing/code.py` | CONVERT | CSV barcode import → Python csv module + forge.log |

---

## 3. core/networking/ (14 files)

| File | Decision | Rationale |
|------|----------|-----------|
| `core/networking/HTTP/code.py` | REPLACE | HTTP client → `forge.net` module |
| `core/networking/Ping/code.py` | CONVERT | Health checks → `forge.net.http_get()` |
| `core/networking/graphql/base/code.py` | CONVERT | GraphQL client → `forge.net.http_post()` + typed queries |
| `core/networking/graphql/connection/code.py` | CONVERT | Scope detection → `forge.util.get_scope()` |
| `core/networking/graphql/entraOAuth2M2MAuth/code.py` | CONVERT | OAuth2 M2M → `forge.net.http_post()` token exchange |
| `core/networking/graphql/mes/*` (5 files) | REPLACE | MES queries → `whk-mes` adapter module |
| `core/networking/rest/classicAuth/code.py` | CONVERT | Basic auth → `forge.net` with headers |
| `core/networking/rest/jwtAuth/code.py` | CONVERT | JWT auth → `forge.net` with Bearer header |
| `core/networking/rest/entraOAuth2M2MAuth/code.py` | CONVERT | OAuth2 → `forge.net` + token management |
| `core/networking/rest/IntellectAPI/code.py` | REPLACE | Intellect → `intellect-integration-service` |
| `core/networking/utils/code.py` | CONVERT | URL builder → pure Python |
| `core/networking/mqttVanillaTransmission/callables/code.py` | REPLACE | MQTT → OT Module native MQTT broker |

---

## 4. core/errors/ (1 file)

| File | Decision | Rationale |
|------|----------|-----------|
| `core/errors/networkingErrors/code.py` | CONVERT | Java exceptions → Python exception classes |

---

## 5. general/ (34 files, excluding alarm_messenger)

| File | Decision | Rationale |
|------|----------|-----------|
| `general/config/code.py` | CONVERT | Config loading → `forge.file.read_text()` |
| `general/files/code.py` | REPLACE | File ops → `forge.file` module |
| `general/utilities/code.py` | CONVERT | Date/UUID/project utils → `forge.date` + `forge.util` |
| `general/conversions/code.py` | REPLACE | Dataset conversion → `forge.dataset` |
| `general/json/code.py` | REPLACE | JSON search → `forge.util.json_decode()` + Python |
| `general/tags_json_conversion/code.py` | CONVERT | Tag export format → `forge.tag` + `forge.util.json_encode()` |
| `general/tag_exports/code.py` | CONVERT | Tag config export → `forge.tag.get_config()` |
| `general/featureflags/code.py` | CONVERT | Feature flags → `forge.file.read_text()` + json |
| `general/comments/comments/code.py` | CONVERT | Comments CRUD → `forge.db.query()` |
| `general/csv_tag_write_tool/csv_importer/code.py` | CONVERT | CSV→tag writer → csv module + `forge.tag.write()` |
| `general/group_and_reorder_table/util/code.py` | DROP | Table manipulation — rarely used |
| `general/perspective/dropdown/code.py` | DEFER | HMI component |
| `general/perspective/table/code.py` | DEFER | HMI table export |
| `general/perspective/tools/code.py` | DEFER | HMI exception popups |
| `general/perspective_screenshot/url/code.py` | DROP | Screenshot tool — development only |
| `general/ui/*` (12 files) | DEFER | All UI modules deferred to Tier 2 |
| `general/csb/schedule/code.py` | CONVERT | Cron scheduling → `@forge.timer()` decorator |
| `general/csb/cron/*` (3 files) | DROP | Cron parsing — replaced by TriggerRegistry timers |
| `general/multithreading/code.py` | CONVERT | Thread mgmt → `asyncio.create_task()` / `forge.util.invoke_async()` |
| `general/tools/logging/code.py` | REPLACE | Logging → `forge.log` |
| `general/tools/meta/code.py` | DROP | Introspection — not needed in Forge scripts |
| `general/tools/yaml/*` (15 files) | DROP | Bundled PyYAML — use `import yaml` from PyPI |
| `general/tools/timing/code.py` | CONVERT | Performance timing → Python `time.perf_counter()` |
| `general/svg/*` (2 files) | DEFER | SVG generation — HMI concern |

---

## 6. plastic/ ORM (14 files)

| File | Decision | Rationale |
|------|----------|-----------|
| `plastic/core/code.py` | CONVERT | ORM base → simplified `forge.db` wrapper |
| `plastic/meta/code.py` | CONVERT | Metaclass → Python 3.12 dataclass + `__init_subclass__` |
| `plastic/record/code.py` | CONVERT | RecordType → `@dataclass` |
| `plastic/recordset/code.py` | CONVERT | RecordSet → Python list + generator patterns |
| `plastic/column/code.py` | CONVERT | Column descriptor → dataclass field |
| `plastic/connectors/base/code.py` | CONVERT | Abstract connector → `forge.db` protocol |
| `plastic/connectors/ignition/code.py` | REPLACE | `system.db.*` connector → `forge.db` module directly |
| `plastic/connectors/mysql/code.py` | DROP | JDBC connector — not applicable in Forge |
| `plastic/connectors/postgres/code.py` | DROP | JDBC connector — `forge.db` uses asyncpg |
| `plastic/connectors/sqlite/code.py` | DROP | JDBC connector — rarely used |
| `plastic/metaqueries/base/code.py` | CONVERT | SQL gen base → pure Python |
| `plastic/metaqueries/ignition/code.py` | REPLACE | Ignition dialect → standard PostgreSQL via forge.db |
| `plastic/metaqueries/mysql/code.py` | DROP | MySQL dialect — not in Forge stack |
| `plastic/metaqueries/postgres/code.py` | CONVERT | PostgreSQL SQL gen → forge.db parameterized queries |

---

## Conversion Priority Order

### Sprint 19 (Tier 1 Core — OT operations)

**Wave 1: Foundation** (8 files → forge equivalents exist)
1. `core/errors/networkingErrors/code.py` → Python exceptions
2. `Framework/Environment/code.py` → `forge.util.get_property()`
3. `Framework/Tags/code.py` → `forge.tag.browse()`
4. `core/util/Parse/code.py` → Pure Python
5. `core/util/Typing/checks/code.py` → Pure Python validation
6. `core/util/csv/barcodeCSVParsing/code.py` → csv + forge.log
7. `general/config/code.py` → `forge.file.read_text()`
8. `general/multithreading/code.py` → asyncio

**Wave 2: Networking** (8 files → forge.net)
1. `core/networking/Ping/code.py` → `forge.net.http_get()`
2. `core/networking/graphql/base/code.py` → `forge.net.http_post()`
3. `core/networking/graphql/connection/code.py` → `forge.util.get_scope()`
4. `core/networking/graphql/entraOAuth2M2MAuth/code.py` → OAuth2 token mgmt
5. `core/networking/rest/classicAuth/code.py` → `forge.net` + Basic auth
6. `core/networking/rest/jwtAuth/code.py` → `forge.net` + Bearer
7. `core/networking/rest/entraOAuth2M2MAuth/code.py` → OAuth2
8. `core/networking/utils/code.py` → URL building

**Wave 3: Data & ORM** (10 files → forge.db + forge.dataset)
1. `plastic/core/code.py` → ORM base
2. `plastic/meta/code.py` → Metaclass → `__init_subclass__`
3. `plastic/record/code.py` → `@dataclass`
4. `plastic/recordset/code.py` → generators
5. `plastic/column/code.py` → field descriptors
6. `plastic/connectors/base/code.py` → forge.db protocol
7. `plastic/metaqueries/base/code.py` → SQL generation
8. `plastic/metaqueries/postgres/code.py` → parameterized queries
9. `general/comments/comments/code.py` → `forge.db.query()`
10. `general/csv_tag_write_tool/csv_importer/code.py` → csv + `forge.tag.write()`

**Wave 4: Utilities** (6 files)
1. `general/utilities/code.py` → `forge.date` + `forge.util`
2. `general/tags_json_conversion/code.py` → `forge.tag` + JSON
3. `general/tag_exports/code.py` → `forge.tag.get_config()`
4. `general/featureflags/code.py` → `forge.file` + JSON
5. `general/csb/schedule/code.py` → `@forge.timer()`
6. `general/tools/timing/code.py` → `time.perf_counter()`

---

## Java Interop Migration Notes

These Jython scripts import Java classes that have no Python equivalent — they need specific attention:

| Java Import | Files Using It | Python Alternative |
|------------|---------------|-------------------|
| `com.inductiveautomation.ignition.common.document` | Framework/Constructors, Documents | Dropped — not needed |
| `java.time.*`, `java.util.Date` | core/util/Time | `datetime` + `zoneinfo` (stdlib) |
| `java.net.InetAddress` | core/networking/Ping | `socket.getaddrinfo()` |
| `java.util.Base64` | core/networking/rest/* | `base64` (stdlib) |
| `java.lang.Exception` | core/errors | Python `Exception` base class |
| `java.lang.String` | various | Python `str` |
| `java.util.ArrayList` | various | Python `list` |
| `javax.swing.*` | general/tools | Dropped — no Swing in Forge |
