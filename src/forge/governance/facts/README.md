# FACTS — Forge Adapter Conformance Test Specification

Governs adapter behavior by validating that adapter specs declare complete,
consistent, and hash-verified contracts.

## Package Structure

```
facts/
├── schema/
│   └── facts.schema.json          # JSON Schema draft 2020-12 (10 top-level properties)
├── specs/
│   ├── whk-wms.facts.json         # WMS adapter spec (14 data sources)
│   └── whk-mes.facts.json         # MES adapter spec (17 data sources)
└── runners/
    └── facts_runner.py            # FACTSRunner — static + live checks
```

## Quick Start

```python
import asyncio, json
from forge.governance.facts.runners.facts_runner import FACTSRunner

runner = FACTSRunner(schema_path="schema/facts.schema.json")
spec = json.load(open("specs/whk-wms.facts.json"))
report = asyncio.run(runner.run(target="whk-wms", spec=spec))
print(f"{'PASS' if report.passed else 'FAIL'}: {report.pass_count}/{report.total}")
```

## Status

244/244 tests passing. See `docs/governance/facts-developer-guide.md` for the full developer guide.
