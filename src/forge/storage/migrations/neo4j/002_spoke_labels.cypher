// 002 — Spoke module label indexes
// Index on spoke_id for fast per-module queries

CREATE INDEX spoke_adapter_idx IF NOT EXISTS FOR (a:Adapter) ON (a.spoke_id);
CREATE INDEX spoke_entity_idx IF NOT EXISTS FOR (e:Entity) ON (e.spoke_id);
CREATE CONSTRAINT module_id IF NOT EXISTS FOR (m:Module) REQUIRE m.module_id IS UNIQUE
