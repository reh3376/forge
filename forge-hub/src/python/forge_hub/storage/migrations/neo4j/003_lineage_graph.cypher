// 003 — Lineage graph constraints and indexes
// Supports tracing transformation chains through the graph

CREATE CONSTRAINT lineage_id IF NOT EXISTS FOR (l:LineageEntry) REQUIRE l.lineage_id IS UNIQUE;
CREATE INDEX lineage_product_idx IF NOT EXISTS FOR (l:LineageEntry) ON (l.product_id);
CREATE INDEX lineage_output_idx IF NOT EXISTS FOR (l:LineageEntry) ON (l.output_record_id)
