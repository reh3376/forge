// 001 — Core Neo4j constraints
// Replaces inline Python from deploy/docker/init-entrypoint.sh lines 176-191

CREATE CONSTRAINT adapter_id IF NOT EXISTS FOR (a:Adapter) REQUIRE a.adapter_id IS UNIQUE;
CREATE CONSTRAINT product_id IF NOT EXISTS FOR (p:DataProduct) REQUIRE p.product_id IS UNIQUE;
CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.entity_id IS UNIQUE;
CREATE CONSTRAINT schema_id IF NOT EXISTS FOR (s:Schema) REQUIRE s.schema_id IS UNIQUE
