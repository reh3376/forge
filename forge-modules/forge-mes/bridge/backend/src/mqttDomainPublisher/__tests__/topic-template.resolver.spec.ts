import { resolveTopicTemplate } from "../topic-template.resolver";

describe("resolveTopicTemplate", () => {
  it("resolves entityType and eventType", () => {
    const result = resolveTopicTemplate(
      "whk/mes/{area}/{entityType}/{eventType}",
      "ScheduleOrder",
      "cook_complete",
      {}
    );
    expect(result).toBe("whk/mes/distillery01/scheduleorder/cook_complete");
  });

  it("resolves area from context", () => {
    const result = resolveTopicTemplate(
      "whk/mes/{area}/test",
      "X",
      "y",
      {},
      { area: "plant02" }
    );
    expect(result).toBe("whk/mes/plant02/test");
  });

  it("defaults area to distillery01", () => {
    const result = resolveTopicTemplate("whk/{area}", "X", "y", {});
    expect(result).toBe("whk/distillery01");
  });

  it("resolves batchId from context over data", () => {
    const result = resolveTopicTemplate(
      "whk/{batchId}",
      "X",
      "y",
      { batchId: "from-data" },
      { batchId: "from-context" }
    );
    expect(result).toBe("whk/from-context");
  });

  it("falls back to data for batchId when context missing", () => {
    const result = resolveTopicTemplate("whk/{batchId}", "X", "y", {
      batchId: "batch-123",
    });
    expect(result).toBe("whk/batch-123");
  });

  it("resolves id from data", () => {
    const result = resolveTopicTemplate(
      "whk/{entityType}/{id}/event",
      "ScheduleOrder",
      "create",
      { id: "abc123" }
    );
    expect(result).toBe("whk/scheduleorder/abc123/event");
  });

  it("resolves arbitrary data keys", () => {
    const result = resolveTopicTemplate("whk/{cookerNumber}", "X", "y", {
      cookerNumber: "CK-01",
    });
    expect(result).toBe("whk/CK-01");
  });

  it("replaces unresolved vars with key name", () => {
    const result = resolveTopicTemplate("whk/{missing}", "X", "y", {});
    expect(result).toBe("whk/missing");
  });

  it("handles multiple variables in one template", () => {
    const result = resolveTopicTemplate(
      "whk/mes/{area}/deviation/{severity}/{batchId}",
      "BatchDeviation",
      "deviation_recorded",
      { id: "dev-1" },
      { area: "distillery01", severity: "Critical", batchId: "B-001" }
    );
    expect(result).toBe("whk/mes/distillery01/deviation/critical/B-001");
  });
});
