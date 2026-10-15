import {
  ForgeWriteService,
  ForgeWriteTarget,
  SpokeWriteResult,
  WriteContext,
  WriteRejectedError,
  WriteTagDescriptor,
  normalizeTagPath,
} from "../forge-write.service";

class FakeTarget implements ForgeWriteTarget {
  calls: Array<{ tagPath: string; value: unknown; ctx: WriteContext }> = [];
  constructor(
    readonly prefix: string,
    private readonly behaviour: (tagPath: string, value: unknown) => SpokeWriteResult = () => ({
      success: true,
      message: "ok",
    })
  ) {}
  describe(): WriteTagDescriptor[] {
    return [{ tag_path: `${this.prefix}.x`, data_type: "object", description: "x" }];
  }
  async write(tagPath: string, value: unknown, ctx: WriteContext): Promise<SpokeWriteResult> {
    this.calls.push({ tagPath, value, ctx });
    return this.behaviour(tagPath, value);
  }
}

const ctx: WriteContext = { confirm: false, requestedBy: "forge-hub" };

describe("normalizeTagPath", () => {
  it("accepts slashes and dots and trims junk", () => {
    expect(normalizeTagPath("mes/changeover/cooker/request")).toBe("mes.changeover.cooker.request");
    expect(normalizeTagPath(" .mes..changeover. ")).toBe("mes.changeover");
    expect(normalizeTagPath("")).toBe("");
  });
});

describe("ForgeWriteService", () => {
  let service: ForgeWriteService;

  beforeEach(() => {
    service = new ForgeWriteService();
  });

  it("routes to the longest matching prefix and counts outcomes", async () => {
    const generic = new FakeTarget("mes");
    const changeover = new FakeTarget("mes.changeover");
    service.register(generic);
    service.register(changeover);

    const res = await service.write("mes/changeover/cooker/request", { a: 1 }, ctx);
    expect(res).toEqual({ success: true, message: "ok" });
    expect(changeover.calls).toHaveLength(1);
    expect(changeover.calls[0].tagPath).toBe("mes.changeover.cooker.request");
    expect(generic.calls).toHaveLength(0);

    await service.write("mes.other.tag", 1, ctx);
    expect(generic.calls).toHaveLength(1);

    const stats = service.getStats();
    expect(stats).toMatchObject({ received: 2, succeeded: 2, rejected: 0, failed: 0 });
    expect(stats.targets).toEqual(["mes", "mes.changeover"]);
    expect(stats.lastTagPath).toBe("mes.other.tag");
    expect(stats.lastWriteAt).toBeDefined();
  });

  it("rejects unknown and empty tags without throwing", async () => {
    service.register(new FakeTarget("mes.changeover"));
    const none = await service.write("wms.inventory.adjust", 1, ctx);
    expect(none.success).toBe(false);
    expect(none.code).toBe("no_target");
    expect(none.message).toContain("mes.changeover");

    const empty = await service.write("  ", 1, ctx);
    expect(empty.code).toBe("invalid_tag");
    expect(service.getStats()).toMatchObject({ received: 2, rejected: 2 });
  });

  it("turns WriteRejectedError into a refused result and re-throws other errors", async () => {
    service.register(
      new FakeTarget("mes.changeover", (tagPath) => {
        if (tagPath.endsWith("boom")) throw new Error("db down");
        throw new WriteRejectedError("invalid_state", "wrong state");
      })
    );
    const refused = await service.write("mes.changeover.cooker.request", {}, ctx);
    expect(refused).toEqual({
      success: false,
      message: "invalid_state: wrong state",
      code: "invalid_state",
    });
    await expect(service.write("mes.changeover.cooker.boom", {}, ctx)).rejects.toThrow("db down");
    expect(service.getStats()).toMatchObject({ received: 2, rejected: 1, failed: 1, lastError: "db down" });
  });

  it("refuses duplicate prefixes, allows re-registering the same target, and describes all tags", () => {
    const t = new FakeTarget("mes.changeover");
    service.register(t);
    service.register(t);
    expect(() => service.register(new FakeTarget("mes/changeover/"))).toThrow("already registered");
    expect(() => service.register(new FakeTarget(""))).toThrow("must not be empty");
    service.register(new FakeTarget("mes.alpha"));
    expect(service.describe().map((d) => d.tag_path)).toEqual(["mes.alpha.x", "mes.changeover.x"]);
    expect(service.unregister("mes.alpha")).toBe(true);
    expect(service.unregister("mes.alpha")).toBe(false);
  });

  it("counts a target's own success=false as rejected", async () => {
    service.register(new FakeTarget("mes", () => ({ success: false, message: "nope" })));
    const res = await service.write("mes.t", 1, ctx);
    expect(res.success).toBe(false);
    expect(service.getStats()).toMatchObject({ succeeded: 0, rejected: 1 });
  });
});
