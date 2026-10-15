import { BadRequestException, ConflictException } from "@nestjs/common";
import {
  CHANGEOVER_COMMANDS,
  ChangeoverForgeWriteTarget,
  changeoverTag,
  parseChangeoverTag,
} from "../changeover.forge-write";
import { ChangeoverState, VALID_AREAS } from "../changeover.types";
import {
  ChangeoverRequestDto,
  CipCompleteDto,
  RecipeLoadedDto,
  ResetErrorDto,
  StartProductionDto,
} from "../dto/changeover.dto";
import { loadForgeConfig } from "../../forge/forge.config";
import { ForgeWriteService, WriteRejectedError } from "../../forge/forge-write.service";

function transition(prev: ChangeoverState, next: ChangeoverState, area = "cooker") {
  return { success: true, previousState: prev, currentState: next, area, message: `${prev} -> ${next}` };
}

function makeChangeover() {
  const state = {
    state: ChangeoverState.RECIPE_LOADING,
    area: "cooker",
    activeSOId: "so-1",
    nextSOId: "so-2",
    assetId: "COOKER-01",
    error: null,
    enteredAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:05:00.000Z",
    metadata: {},
  };
  return {
    requestChangeover: jest.fn(async () => transition(ChangeoverState.PRODUCTION, ChangeoverState.AWAITING_CHANGEOVER)),
    cipComplete: jest.fn(async () => transition(ChangeoverState.AWAITING_CHANGEOVER, ChangeoverState.RECIPE_LOADING)),
    recipeLoaded: jest.fn(async () => transition(ChangeoverState.RECIPE_LOADING, ChangeoverState.READY_TO_START)),
    startProduction: jest.fn(async () => transition(ChangeoverState.READY_TO_START, ChangeoverState.PRODUCTION)),
    resetError: jest.fn(async () => transition(ChangeoverState.ERROR, ChangeoverState.CIP_COMPLETE, "fermentation")),
    getAreaState: jest.fn(() => ({ ...state })),
  };
}

const config = loadForgeConfig((k) => ({ FORGE_HUB_ENABLED: "true" })[k]);
const ctx = { confirm: false, requestedBy: "forge-hub" };

describe("parseChangeoverTag", () => {
  it("accepts dotted and slashed forms", () => {
    expect(parseChangeoverTag("mes.changeover.cooker.cip-complete")).toEqual({ area: "cooker", command: "cip-complete" });
    expect(parseChangeoverTag("mes/changeover/barreling/reset")).toEqual({ area: "barreling", command: "reset" });
  });

  it("rejects malformed, unknown and read-only tags with invalid_tag", () => {
    for (const bad of ["mes.changeover.cooker", "mes.queue.cooker.request", "mes.changeover.stillhouse.request", "mes.changeover.cooker.launch", "mes.changeover.cooker.state"]) {
      expect(() => parseChangeoverTag(bad)).toThrow(WriteRejectedError);
      try {
        parseChangeoverTag(bad);
      } catch (err) {
        expect((err as WriteRejectedError).code).toBe("invalid_tag");
      }
    }
    expect(() => parseChangeoverTag("mes.changeover.cooker.state")).toThrow("read-only");
  });
});

describe("ChangeoverForgeWriteTarget", () => {
  let changeover: ReturnType<typeof makeChangeover>;
  let writes: ForgeWriteService;
  let target: ChangeoverForgeWriteTarget;

  beforeEach(() => {
    changeover = makeChangeover();
    writes = new ForgeWriteService();
    target = new ChangeoverForgeWriteTarget(changeover as any, writes, config);
    target.onModuleInit();
  });

  it("registers itself under mes.changeover and describes every area/command plus the state tag", () => {
    expect(writes.getStats().targets).toEqual(["mes.changeover"]);
    const tags = target.describe();
    expect(tags).toHaveLength(VALID_AREAS.length * (Object.keys(CHANGEOVER_COMMANDS).length + 1));
    const cip = tags.find((t) => t.tag_path === "mes.changeover.cooker.cip-complete")!;
    expect(cip.metadata).toMatchObject({
      area: "cooker",
      command: "cip-complete",
      payload: "CipCompleteDto",
      accepted_states: [ChangeoverState.CIP_IN_PROGRESS, ChangeoverState.AWAITING_CHANGEOVER],
      rest: "POST /api/changeover/cooker/cip-complete",
    });
    expect(tags.find((t) => t.tag_path === changeoverTag("barreling", "state"))!.metadata).toEqual({ area: "barreling", readback: true });
  });

  it("maps each command to the service method with a validated DTO instance", async () => {
    await target.write("mes.changeover.cooker.request", { requestedBy: "ot", force: true, reason: "done" }, ctx);
    expect(changeover.requestChangeover).toHaveBeenCalledWith("cooker", expect.any(ChangeoverRequestDto));
    expect(changeover.requestChangeover).toHaveBeenCalledWith(
      "cooker",
      expect.objectContaining({ requestedBy: "ot", force: true, reason: "done" })
    );

    await target.write("mes.changeover.cooker.cip-complete", { cipStartTime: "2026-06-01T08:00:00Z", cipEndTime: "2026-06-01T09:00:00Z", cipDurationSeconds: 3600 }, ctx);
    expect(changeover.cipComplete).toHaveBeenCalledWith("cooker", expect.any(CipCompleteDto));

    await target.write("mes.changeover.cooker.recipe-loaded", { scheduleOrderRecipeInstanceId: "sori-1", sourceUpdatedAt: "2026-06-01T07:00:00Z", cookerNumber: "3" }, ctx);
    expect(changeover.recipeLoaded).toHaveBeenCalledWith("cooker", expect.any(RecipeLoadedDto));

    const res = await target.write("mes/changeover/cooker/start-production", { startedBy: "op-7" }, ctx);
    expect(changeover.startProduction).toHaveBeenCalledWith("cooker", expect.any(StartProductionDto));
    expect(res).toEqual({ success: true, message: "cooker: READY_TO_START -> PRODUCTION (READY_TO_START -> PRODUCTION)" });

    await target.write("mes.changeover.fermentation.reset", { targetState: "CIP_COMPLETE", resetBy: "eng" }, ctx);
    expect(changeover.resetError).toHaveBeenCalledWith("fermentation", expect.any(ResetErrorDto));
  });

  it("rejects non-object, invalid and unknown-field payloads before touching the service", async () => {
    const codes: string[] = [];
    for (const [tag, value] of [
      ["mes.changeover.cooker.request", "not-an-object"],
      ["mes.changeover.cooker.request", null],
      ["mes.changeover.cooker.request", [1]],
      ["mes.changeover.cooker.cip-complete", { cipStartTime: "a" }],
      ["mes.changeover.cooker.request", { requestedBy: "ot", typo: 1 }],
      ["mes.changeover.cooker.reset", { targetState: "BOGUS", resetBy: "x" }],
    ] as Array<[string, unknown]>) {
      try {
        await target.write(tag, value, ctx);
        throw new Error(`expected rejection for ${tag}`);
      } catch (err) {
        expect(err).toBeInstanceOf(WriteRejectedError);
        codes.push((err as WriteRejectedError).code);
      }
    }
    expect(codes).toEqual(Array(6).fill("invalid_payload"));
    expect(changeover.requestChangeover).not.toHaveBeenCalled();
    expect(changeover.cipComplete).not.toHaveBeenCalled();
    expect(changeover.resetError).not.toHaveBeenCalled();
  });

  it("translates service exceptions into reject codes and lets unknown errors through", async () => {
    changeover.cipComplete.mockRejectedValueOnce(new BadRequestException("Operation 'cipComplete' requires state [...]"));
    await expect(target.write("mes.changeover.cooker.cip-complete", { cipStartTime: "a", cipEndTime: "b" }, ctx)).rejects.toMatchObject({ code: "invalid_state" });

    changeover.recipeLoaded.mockRejectedValueOnce(new ConflictException("Recipe version mismatch"));
    await expect(
      target.write("mes.changeover.cooker.recipe-loaded", { scheduleOrderRecipeInstanceId: "s", sourceUpdatedAt: "t", cookerNumber: "1" }, ctx)
    ).rejects.toMatchObject({ code: "conflict", message: "Recipe version mismatch" });

    changeover.startProduction.mockRejectedValueOnce(new Error("connection reset"));
    await expect(target.write("mes.changeover.cooker.start-production", { startedBy: "x" }, ctx)).rejects.toThrow("connection reset");

    // through the registry the refusals become results, the unknown error still throws
    changeover.cipComplete.mockRejectedValueOnce(new BadRequestException("nope"));
    const refused = await writes.write("mes.changeover.cooker.cip-complete", { cipStartTime: "a", cipEndTime: "b" }, ctx);
    expect(refused).toEqual({ success: false, message: "invalid_state: nope", code: "invalid_state" });
  });

  it("returns the area state as a read-back record when confirm is set", async () => {
    const res = await target.write("mes.changeover.cooker.cip-complete", { cipStartTime: "a", cipEndTime: "b" }, { confirm: true, requestedBy: "forge-hub" });
    expect(res.success).toBe(true);
    const rb = res.readback!;
    expect(rb.source).toEqual({ adapter_id: "forge-mes", system: "forge-mes", tag_path: "mes.changeover.cooker.state" });
    expect(rb.context.equipment_id).toBe("COOKER-01");
    expect(rb.context.area).toBe("distillery01");
    expect(rb.context.site).toBe("whk01");
    expect(rb.context.operating_mode).toBe("RECIPE_LOADING");
    expect(rb.context.extra).toMatchObject({
      entity_type: "Changeover",
      event_type: "changeover.cip-complete",
      entity_id: "cooker-changeover",
      schedule_order_id: "so-1",
      changeover_area: "cooker",
      changeover_state: "RECIPE_LOADING",
      write_command: "cip-complete",
      write_requested_by: "forge-hub",
    });
    const payload = JSON.parse(rb.value.json_value);
    expect(payload.transition).toMatchObject({ previousState: "AWAITING_CHANGEOVER", currentState: "RECIPE_LOADING" });
    expect(payload.nextSOId).toBe("so-2");
    expect(rb.lineage.transformation_chain).toEqual(["forge-mes-backend:domain-event", "forge-mes-backend:write-readback"]);
    expect(rb.timestamp.source_time.seconds).toBe(String(Math.floor(Date.parse("2026-06-01T12:05:00Z") / 1000)));
  });
});
