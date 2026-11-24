# FACTS — Forge Adapter Conformance Test Specification

Governs adapter behavior by validating that adapter specs declare complete,
consistent, and hash-verified contracts.

## Package Structure

```
facts/                             # this package: the runner only
└── runners/
    └── facts_runner.py            # FACTSRunner — static + live checks

forge-core/contract/fxts/facts/schema/   # the schema, its released versions and registry
forge-modules/<module>/fxts/facts/       # each module's spec, <adapter_id>.facts.json
```

## Quick Start

```python
import asyncio, json
from forge_core.fxts.facts.runners.facts_runner import FACTSRunner

runner = FACTSRunner(schema_path="schema/facts.schema.json")
spec = json.load(open("specs/forge-wms.facts.json"))
report = asyncio.run(runner.run(target="forge-wms", spec=spec))
print(report.summary())  # the outcome is PASS, FAIL or INCOMPLETE; see report.not_run
```

## Status

244/244 tests passing. See `forge-core/docs/facts-developer-guide.md` for the full developer guide.
