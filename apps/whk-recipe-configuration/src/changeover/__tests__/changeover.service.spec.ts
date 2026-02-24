import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { ChangeoverService } from "../changeover.service";
import { ChangeoverState, VALID_AREAS } from "../changeover.types";
import { PrismaService } from "../../prisma/prisma.service";
import { ScheduleOrderService } from "../../scheduleOrder/scheduleOrder.service";
import { ScheduleOrderQueueService } from "../../scheduleOrderQueue/scheduleOrderQueue.service";
import { ScheduleOrderRecipeInstanceService } from "../../scheduleOrderRecipeInstance/scheduleOrderRecipeInstance.service";
import { MqttService } from "../../providers/mqtt/mqtt.service";
import { AuditService } from "../../audit/audit.service";

describe("ChangeoverService", () => {
  let service: ChangeoverService;
  let prisma: any;
  let scheduleOrderService: any;
  let scheduleOrderQueueService: any;
  let scheduleOrderRecipeInstanceService: any;
  let mqttService: any;
  let auditService: any;

  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
    debug: jest.fn(),
  };

  const mockActiveSO = {
    id: "queue-0",
    queueIndex: 0,
    scheduleOrder: { id: "so-active", name: "SO-001", status: "InProgress" },
  };

  const mockNextSO = {
    id: "queue-1",
    queueIndex: 1,
    scheduleOrder: { id: "so-next", name: "SO-002", status: "Queued" },
  };

  const mockRecipe = {
    id: "recipe-instance-1",
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    recipe: { id: "recipe-1", Recipe: "Bourbon Mash", revision: 1 },
    recipeBoms: [],
    mashingProtocols: [],
    recipeParameters: [],
  };

  /** Helper: build a mock DB row for ChangeoverAreaState */
  function mockDbRow(
    area: string,
    state: string = "PRODUCTION",
    overrides: Record<string, any> = {}
  ) {
    return {
      id: `${area}-id`,
      area,
      state,
      activeSOId: null,
      nextSOId: null,
      assetId: null,
      error: null,
      metadata: {},
      enteredAt: new Date(),
      updatedAt: new Date(),
      createdAt: new Date(),
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = {
      changeoverAreaState: {
        upsert: jest
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(mockDbRow(where.area))
          ),
        update: jest.fn().mockImplementation(({ where, data }) =>
          Promise.resolve(
            mockDbRow(where.area, data.state ?? "PRODUCTION", {
              activeSOId: data.activeSOId ?? null,
              nextSOId: data.nextSOId ?? null,
              error: data.error ?? null,
              metadata: data.metadata ?? {},
              enteredAt: data.enteredAt ?? new Date(),
            })
          )
        ),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          // Return state that matches in-memory (the test sets this up via transitions)
          const areaState = (service as any).areaStates?.get(where.area);
          if (areaState) {
            return Promise.resolve(
              mockDbRow(where.area, areaState.state, {
                activeSOId: areaState.activeSOId,
                nextSOId: areaState.nextSOId,
                assetId: areaState.assetId,
                error: areaState.error,
                metadata: areaState.metadata,
              })
            );
          }
          return Promise.resolve(mockDbRow(where.area));
        }),
      },
      scheduleOrderQueue: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      scheduleOrder: {
        findUnique: jest.fn(),
      },
      asset: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      equipmentStateTransition: {
        create: jest.fn().mockResolvedValue({ id: "est-1" }),
      },
    };

    scheduleOrderService = {
      recordCookComplete: jest.fn(),
      recordRecipeLoadedToPLC: jest.fn().mockResolvedValue({
        success: true,
        loadedUpdatedAt: "2026-01-01T00:00:00Z",
      }),
      advanceScheduleOrderQueue: jest.fn().mockResolvedValue({
        success: true,
        previousSOId: "so-active",
        newActiveSOId: "so-next",
        newActiveSOName: "SO-002",
        nextOrderId: "so-third",
        newQueueState: [],
      }),
    };

    scheduleOrderQueueService = {
      startOrder: jest.fn(),
    };

    scheduleOrderRecipeInstanceService = {
      getWithAllComponents: jest.fn().mockResolvedValue(mockRecipe),
    };

    mqttService = {
      publish: jest.fn().mockResolvedValue(undefined),
      isBrokerConnected: jest.fn().mockReturnValue(true),
      getConnectedBrokers: jest.fn().mockReturnValue(["broker-1"]),
    };

    auditService = {
      logChange: jest.fn().mockResolvedValue({ id: "audit-log-1" }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChangeoverService,
        { provide: PrismaService, useValue: prisma },
        { provide: ScheduleOrderService, useValue: scheduleOrderService },
        {
          provide: ScheduleOrderQueueService,
          useValue: scheduleOrderQueueService,
        },
        {
          provide: ScheduleOrderRecipeInstanceService,
          useValue: scheduleOrderRecipeInstanceService,
        },
        { provide: MqttService, useValue: mqttService },
        { provide: AuditService, useValue: auditService },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<ChangeoverService>(ChangeoverService);
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Initial State ─────────────────────────────────────────────

  describe("getAreaState", () => {
    it("should return PRODUCTION state on init for all areas", () => {
      const state = service.getAreaState("cooker");
      expect(state.state).toBe(ChangeoverState.PRODUCTION);
      expect(state.area).toBe("cooker");

      expect(service.getAreaState("fermentation").state).toBe(
        ChangeoverState.PRODUCTION
      );
      expect(service.getAreaState("barreling").state).toBe(
        ChangeoverState.PRODUCTION
      );
    });

    it("should throw for invalid area", () => {
      expect(() => service.getAreaState("invalid" as any)).toThrow(
        BadRequestException
      );
    });

    it("should upsert all 3 areas on init", () => {
      expect(prisma.changeoverAreaState.upsert).toHaveBeenCalledTimes(3);
      for (const area of VALID_AREAS) {
        expect(prisma.changeoverAreaState.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { area },
            create: expect.objectContaining({ area, state: "PRODUCTION" }),
          })
        );
      }
    });
  });

  // ─── Request Changeover ────────────────────────────────────────

  describe("requestChangeover", () => {
    beforeEach(() => {
      prisma.scheduleOrderQueue.findFirst
        .mockResolvedValueOnce(mockActiveSO) // getActiveSO
        .mockResolvedValueOnce(mockNextSO); // getNextSO
      prisma.scheduleOrder.findUnique.mockResolvedValue({
        executedCooks: 5,
        totalCooks: 5,
      });
    });

    it("should transition from PRODUCTION to AWAITING_CHANGEOVER", async () => {
      const result = await service.requestChangeover("cooker", {
        requestedBy: "operator1",
      });

      expect(result.success).toBe(true);
      expect(result.previousState).toBe(ChangeoverState.PRODUCTION);
      expect(result.currentState).toBe(ChangeoverState.AWAITING_CHANGEOVER);
      expect(result.auditLogId).toBe("audit-log-1");
    });

    it("should persist state to DB", async () => {
      await service.requestChangeover("cooker", {
        requestedBy: "operator1",
      });

      expect(prisma.changeoverAreaState.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { area: "cooker" },
          data: expect.objectContaining({
            state: "AWAITING_CHANGEOVER",
            activeSOId: "so-active",
            nextSOId: "so-next",
          }),
        })
      );
    });

    it("should publish changeover state via MQTT", async () => {
      await service.requestChangeover("cooker", {
        requestedBy: "operator1",
      });

      expect(mqttService.publish).toHaveBeenCalledWith(
        "broker-1",
        "whk/whk01/cooker/changeover/state",
        expect.any(String),
        { retain: true }
      );
    });

    it("should throw if no active SO in queue", async () => {
      prisma.scheduleOrderQueue.findFirst.mockReset();
      prisma.scheduleOrderQueue.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.requestChangeover("cooker", { requestedBy: "op1" })
      ).rejects.toThrow("No active schedule order in queue");
    });

    it("should throw if no next SO in queue", async () => {
      prisma.scheduleOrderQueue.findFirst.mockReset();
      prisma.scheduleOrderQueue.findFirst
        .mockResolvedValueOnce(mockActiveSO)
        .mockResolvedValueOnce(null);

      await expect(
        service.requestChangeover("cooker", { requestedBy: "op1" })
      ).rejects.toThrow("No next schedule order in queue at index 1");
    });

    it("should throw if cooks are incomplete and force is not set", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue({
        executedCooks: 3,
        totalCooks: 5,
      });

      await expect(
        service.requestChangeover("cooker", { requestedBy: "op1" })
      ).rejects.toThrow("3/5 cooks complete");
    });

    it("should allow force changeover with incomplete cooks", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue({
        executedCooks: 3,
        totalCooks: 5,
      });

      const result = await service.requestChangeover("cooker", {
        requestedBy: "op1",
        force: true,
      });

      expect(result.success).toBe(true);
      expect(result.currentState).toBe(ChangeoverState.AWAITING_CHANGEOVER);
    });

    it("should throw if state is not PRODUCTION or COOK_COMPLETE", async () => {
      // Put into ERROR state first
      await service.transitionToError("cooker", "test error", "system");

      await expect(
        service.requestChangeover("cooker", { requestedBy: "op1" })
      ).rejects.toThrow("requires state");
    });
  });

  // ─── CIP Complete ─────────────────────────────────────────────

  describe("cipComplete", () => {
    beforeEach(async () => {
      prisma.scheduleOrderQueue.findFirst
        .mockResolvedValueOnce(mockActiveSO)
        .mockResolvedValueOnce(mockNextSO);
      prisma.scheduleOrder.findUnique.mockResolvedValue({
        executedCooks: 5,
        totalCooks: 5,
      });
      await service.requestChangeover("cooker", { requestedBy: "op1" });
      jest.clearAllMocks();
      mqttService.getConnectedBrokers.mockReturnValue(["broker-1"]);
      mqttService.publish.mockResolvedValue(undefined);
      auditService.logChange.mockResolvedValue({ id: "audit-log-2" });
      prisma.changeoverAreaState.update.mockImplementation(
        ({ where, data }: any) =>
          Promise.resolve(
            mockDbRow(where.area, data.state ?? "AWAITING_CHANGEOVER", {
              enteredAt: data.enteredAt ?? new Date(),
            })
          )
      );
      prisma.changeoverAreaState.findUnique.mockImplementation(
        ({ where }: any) => {
          const areaState = (service as any).areaStates?.get(where.area);
          return Promise.resolve(
            mockDbRow(where.area, areaState?.state ?? "AWAITING_CHANGEOVER", {
              activeSOId: areaState?.activeSOId,
              nextSOId: areaState?.nextSOId,
            })
          );
        }
      );
    });

    it("should transition through CIP_COMPLETE to RECIPE_LOADING", async () => {
      const result = await service.cipComplete("cooker", {
        cipStartTime: "2026-01-01T08:00:00Z",
        cipEndTime: "2026-01-01T09:00:00Z",
        cipDurationSeconds: 3600,
      });

      expect(result.success).toBe(true);
      expect(result.currentState).toBe(ChangeoverState.RECIPE_LOADING);
    });

    it("should load and publish next recipe", async () => {
      await service.cipComplete("cooker", {
        cipStartTime: "2026-01-01T08:00:00Z",
        cipEndTime: "2026-01-01T09:00:00Z",
      });

      expect(
        scheduleOrderRecipeInstanceService.getWithAllComponents
      ).toHaveBeenCalled();
      expect(mqttService.publish).toHaveBeenCalledWith(
        "broker-1",
        "whk/whk01/cooker/recipe/next",
        expect.any(String),
        { retain: true }
      );
    });

    it("should throw if not in AWAITING_CHANGEOVER or CIP_IN_PROGRESS", async () => {
      // Reset to PRODUCTION
      await service.onModuleInit();

      await expect(
        service.cipComplete("cooker", {
          cipStartTime: "2026-01-01T08:00:00Z",
          cipEndTime: "2026-01-01T09:00:00Z",
        })
      ).rejects.toThrow("requires state");
    });
  });

  // ─── Recipe Loaded ─────────────────────────────────────────────

  describe("recipeLoaded", () => {
    beforeEach(async () => {
      // Progress to RECIPE_LOADING
      prisma.scheduleOrderQueue.findFirst
        .mockResolvedValueOnce(mockActiveSO)
        .mockResolvedValueOnce(mockNextSO);
      prisma.scheduleOrder.findUnique.mockResolvedValue({
        executedCooks: 5,
        totalCooks: 5,
      });
      await service.requestChangeover("cooker", { requestedBy: "op1" });

      jest.clearAllMocks();
      mqttService.getConnectedBrokers.mockReturnValue(["broker-1"]);
      mqttService.publish.mockResolvedValue(undefined);
      auditService.logChange.mockResolvedValue({ id: "audit-log-3" });
      scheduleOrderRecipeInstanceService.getWithAllComponents.mockResolvedValue(
        mockRecipe
      );
      prisma.changeoverAreaState.update.mockImplementation(
        ({ where, data }: any) =>
          Promise.resolve(
            mockDbRow(where.area, data.state, {
              enteredAt: data.enteredAt ?? new Date(),
            })
          )
      );
      prisma.changeoverAreaState.findUnique.mockImplementation(
        ({ where }: any) => {
          const areaState = (service as any).areaStates?.get(where.area);
          return Promise.resolve(
            mockDbRow(where.area, areaState?.state, {
              activeSOId: areaState?.activeSOId,
              nextSOId: areaState?.nextSOId,
            })
          );
        }
      );

      await service.cipComplete("cooker", {
        cipStartTime: "2026-01-01T08:00:00Z",
        cipEndTime: "2026-01-01T09:00:00Z",
      });

      jest.clearAllMocks();
      mqttService.getConnectedBrokers.mockReturnValue(["broker-1"]);
      mqttService.publish.mockResolvedValue(undefined);
      auditService.logChange.mockResolvedValue({ id: "audit-log-4" });
      prisma.scheduleOrderQueue.findFirst.mockResolvedValue(mockNextSO);
      prisma.changeoverAreaState.update.mockImplementation(
        ({ where, data }: any) =>
          Promise.resolve(
            mockDbRow(where.area, data.state, {
              enteredAt: data.enteredAt ?? new Date(),
            })
          )
      );
      prisma.changeoverAreaState.findUnique.mockImplementation(
        ({ where }: any) => {
          const areaState = (service as any).areaStates?.get(where.area);
          return Promise.resolve(
            mockDbRow(where.area, areaState?.state, {
              activeSOId: areaState?.activeSOId,
              nextSOId: areaState?.nextSOId,
            })
          );
        }
      );
    });

    it("should transition through RECIPE_LOADED to READY_TO_START", async () => {
      const result = await service.recipeLoaded("cooker", {
        scheduleOrderRecipeInstanceId: "recipe-instance-1",
        sourceUpdatedAt: "2026-01-01T00:00:00Z",
        cookerNumber: "CK-01",
      });

      expect(result.success).toBe(true);
      expect(result.currentState).toBe(ChangeoverState.READY_TO_START);
    });

    it("should call recordRecipeLoadedToPLC", async () => {
      await service.recipeLoaded("cooker", {
        scheduleOrderRecipeInstanceId: "recipe-instance-1",
        sourceUpdatedAt: "2026-01-01T00:00:00Z",
        cookerNumber: "CK-01",
        loadedBy: "ignition",
      });

      expect(scheduleOrderService.recordRecipeLoadedToPLC).toHaveBeenCalledWith(
        {
          scheduleOrderId: "so-next",
          scheduleOrderRecipeInstanceId: "recipe-instance-1",
          cookerNumber: "CK-01",
          sourceUpdatedAt: "2026-01-01T00:00:00Z",
          loadedBy: "ignition",
        }
      );
    });

    it("should throw ConflictException on version mismatch", async () => {
      scheduleOrderService.recordRecipeLoadedToPLC.mockRejectedValue(
        new Error("Version mismatch detected")
      );

      await expect(
        service.recipeLoaded("cooker", {
          scheduleOrderRecipeInstanceId: "recipe-instance-1",
          sourceUpdatedAt: "old-timestamp",
          cookerNumber: "CK-01",
        })
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── Start Production ──────────────────────────────────────────

  describe("startProduction", () => {
    beforeEach(async () => {
      // Progress to READY_TO_START through full cycle
      prisma.scheduleOrderQueue.findFirst
        .mockResolvedValueOnce(mockActiveSO)
        .mockResolvedValueOnce(mockNextSO);
      prisma.scheduleOrder.findUnique.mockResolvedValue({
        executedCooks: 5,
        totalCooks: 5,
      });
      prisma.changeoverAreaState.update.mockImplementation(
        ({ where, data }: any) =>
          Promise.resolve(
            mockDbRow(where.area, data.state, {
              enteredAt: data.enteredAt ?? new Date(),
              activeSOId: data.activeSOId,
              nextSOId: data.nextSOId,
            })
          )
      );
      prisma.changeoverAreaState.findUnique.mockImplementation(
        ({ where }: any) => {
          const areaState = (service as any).areaStates?.get(where.area);
          return Promise.resolve(
            mockDbRow(where.area, areaState?.state ?? "PRODUCTION", {
              activeSOId: areaState?.activeSOId,
              nextSOId: areaState?.nextSOId,
            })
          );
        }
      );

      await service.requestChangeover("cooker", { requestedBy: "op1" });

      scheduleOrderRecipeInstanceService.getWithAllComponents.mockResolvedValue(
        mockRecipe
      );
      await service.cipComplete("cooker", {
        cipStartTime: "t1",
        cipEndTime: "t2",
      });

      prisma.scheduleOrderQueue.findFirst.mockResolvedValue(mockNextSO);
      scheduleOrderService.recordRecipeLoadedToPLC.mockResolvedValue({
        success: true,
      });
      await service.recipeLoaded("cooker", {
        scheduleOrderRecipeInstanceId: "ri-1",
        sourceUpdatedAt: "ts",
        cookerNumber: "CK-01",
      });

      jest.clearAllMocks();
      mqttService.getConnectedBrokers.mockReturnValue(["broker-1"]);
      mqttService.publish.mockResolvedValue(undefined);
      auditService.logChange.mockResolvedValue({ id: "audit-4" });
      prisma.scheduleOrderQueue.findMany.mockResolvedValue([]);
      prisma.changeoverAreaState.update.mockImplementation(
        ({ where, data }: any) =>
          Promise.resolve(
            mockDbRow(where.area, data.state, {
              enteredAt: data.enteredAt ?? new Date(),
              activeSOId: data.activeSOId,
              nextSOId: data.nextSOId,
            })
          )
      );
      prisma.changeoverAreaState.findUnique.mockImplementation(
        ({ where }: any) => {
          const areaState = (service as any).areaStates?.get(where.area);
          return Promise.resolve(
            mockDbRow(where.area, areaState?.state, {
              activeSOId: areaState?.activeSOId,
              nextSOId: areaState?.nextSOId,
            })
          );
        }
      );
      scheduleOrderService.advanceScheduleOrderQueue.mockResolvedValue({
        success: true,
        previousSOId: "so-active",
        newActiveSOId: "so-next",
        newActiveSOName: "SO-002",
        nextOrderId: "so-third",
        newQueueState: [],
      });
    });

    it("should transition to PRODUCTION and advance queue", async () => {
      const result = await service.startProduction("cooker", {
        startedBy: "operator1",
      });

      expect(result.success).toBe(true);
      expect(result.currentState).toBe(ChangeoverState.PRODUCTION);
      expect(
        scheduleOrderService.advanceScheduleOrderQueue
      ).toHaveBeenCalledWith({
        advancedBy: "operator1",
        notes: undefined,
      });
    });

    it("should publish queue state after production start", async () => {
      await service.startProduction("cooker", { startedBy: "op1" });

      expect(mqttService.publish).toHaveBeenCalledWith(
        "broker-1",
        "whk/whk01/cooker/changeover/state",
        expect.any(String),
        { retain: true }
      );
      expect(mqttService.publish).toHaveBeenCalledWith(
        "broker-1",
        "whk/whk01/cooker/queue/activeOrder",
        expect.any(String),
        { retain: true }
      );
    });

    it("should throw if queue advance fails", async () => {
      scheduleOrderService.advanceScheduleOrderQueue.mockResolvedValue({
        success: false,
        message: "No active SO",
      });

      await expect(
        service.startProduction("cooker", { startedBy: "op1" })
      ).rejects.toThrow("Queue advance failed");
    });
  });

  // ─── Get Next Recipe ───────────────────────────────────────────

  describe("getNextRecipe", () => {
    it("should return recipe data for next SO", async () => {
      prisma.scheduleOrderQueue.findFirst.mockResolvedValue(mockNextSO);

      const result = await service.getNextRecipe("cooker");

      expect(result.scheduleOrderId).toBe("so-next");
      expect(result.recipeInstanceId).toBe("recipe-instance-1");
    });

    it("should return null recipe when no next SO", async () => {
      prisma.scheduleOrderQueue.findFirst.mockResolvedValue(null);

      const result = await service.getNextRecipe("cooker");

      expect(result.recipe).toBeNull();
    });
  });

  // ─── Error + Reset ─────────────────────────────────────────────

  describe("resetError", () => {
    beforeEach(async () => {
      await service.transitionToError("cooker", "Equipment fault", "system");
    });

    it("should reset from ERROR to AWAITING_CHANGEOVER", async () => {
      const result = await service.resetError("cooker", {
        targetState: ChangeoverState.AWAITING_CHANGEOVER,
        resetBy: "supervisor",
        reason: "Fault cleared",
      });

      expect(result.success).toBe(true);
      expect(result.previousState).toBe(ChangeoverState.ERROR);
      expect(result.currentState).toBe(ChangeoverState.AWAITING_CHANGEOVER);
    });

    it("should reset from ERROR to CIP_COMPLETE", async () => {
      const result = await service.resetError("cooker", {
        targetState: ChangeoverState.CIP_COMPLETE,
        resetBy: "supervisor",
      });

      expect(result.currentState).toBe(ChangeoverState.CIP_COMPLETE);
    });

    it("should throw if not in ERROR state", async () => {
      await service.onModuleInit(); // reset to PRODUCTION

      await expect(
        service.resetError("cooker", {
          targetState: ChangeoverState.AWAITING_CHANGEOVER,
          resetBy: "supervisor",
        })
      ).rejects.toThrow("requires state [ERROR]");
    });

    it("should reject invalid target states", async () => {
      await expect(
        service.resetError("cooker", {
          targetState: ChangeoverState.PRODUCTION,
          resetBy: "supervisor",
        })
      ).rejects.toThrow("Cannot reset to PRODUCTION");
    });
  });

  // ─── transitionToError ─────────────────────────────────────────

  describe("transitionToError", () => {
    it("should transition any state to ERROR and persist", async () => {
      const result = await service.transitionToError(
        "cooker",
        "Equipment fault",
        "system"
      );

      expect(result.success).toBe(true);
      expect(result.currentState).toBe(ChangeoverState.ERROR);
      expect(service.getAreaState("cooker").error).toBe("Equipment fault");

      expect(prisma.changeoverAreaState.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { area: "cooker" },
          data: expect.objectContaining({
            state: "ERROR",
            error: "Equipment fault",
          }),
        })
      );
    });
  });

  // ─── Full Changeover Cycle ─────────────────────────────────────

  describe("full changeover cycle", () => {
    it("should complete PRODUCTION -> ... -> PRODUCTION", async () => {
      // Setup persistent mock for DB operations
      prisma.changeoverAreaState.update.mockImplementation(
        ({ where, data }: any) =>
          Promise.resolve(
            mockDbRow(where.area, data.state, {
              enteredAt: data.enteredAt ?? new Date(),
              activeSOId: data.activeSOId,
              nextSOId: data.nextSOId,
              error: data.error,
            })
          )
      );
      prisma.changeoverAreaState.findUnique.mockImplementation(
        ({ where }: any) => {
          const areaState = (service as any).areaStates?.get(where.area);
          return Promise.resolve(
            mockDbRow(where.area, areaState?.state ?? "PRODUCTION", {
              activeSOId: areaState?.activeSOId,
              nextSOId: areaState?.nextSOId,
              error: areaState?.error,
            })
          );
        }
      );

      // 1. Request changeover
      prisma.scheduleOrderQueue.findFirst
        .mockResolvedValueOnce(mockActiveSO)
        .mockResolvedValueOnce(mockNextSO);
      prisma.scheduleOrder.findUnique.mockResolvedValue({
        executedCooks: 5,
        totalCooks: 5,
      });

      let result = await service.requestChangeover("cooker", {
        requestedBy: "op1",
      });
      expect(result.currentState).toBe(ChangeoverState.AWAITING_CHANGEOVER);

      // 2. CIP complete
      result = await service.cipComplete("cooker", {
        cipStartTime: "t1",
        cipEndTime: "t2",
      });
      expect(result.currentState).toBe(ChangeoverState.RECIPE_LOADING);

      // 3. Recipe loaded
      prisma.scheduleOrderQueue.findFirst.mockResolvedValue(mockNextSO);
      scheduleOrderService.recordRecipeLoadedToPLC.mockResolvedValue({
        success: true,
      });

      result = await service.recipeLoaded("cooker", {
        scheduleOrderRecipeInstanceId: "ri-1",
        sourceUpdatedAt: "ts",
        cookerNumber: "CK-01",
      });
      expect(result.currentState).toBe(ChangeoverState.READY_TO_START);

      // 4. Start production
      prisma.scheduleOrderQueue.findMany.mockResolvedValue([]);
      scheduleOrderService.advanceScheduleOrderQueue.mockResolvedValue({
        success: true,
        previousSOId: "so-active",
        newActiveSOId: "so-next",
        nextOrderId: "so-third",
      });

      result = await service.startProduction("cooker", {
        startedBy: "op1",
      });
      expect(result.currentState).toBe(ChangeoverState.PRODUCTION);

      // Verify final state
      const finalState = service.getAreaState("cooker");
      expect(finalState.state).toBe(ChangeoverState.PRODUCTION);
      expect(finalState.activeSOId).toBe("so-next");
    });
  });

  // ─── MQTT Publish No Broker ────────────────────────────────────

  describe("MQTT with no connected broker", () => {
    it("should not throw when no broker is connected", async () => {
      mqttService.getConnectedBrokers.mockReturnValue([]);
      prisma.scheduleOrderQueue.findFirst
        .mockResolvedValueOnce(mockActiveSO)
        .mockResolvedValueOnce(mockNextSO);
      prisma.scheduleOrder.findUnique.mockResolvedValue({
        executedCooks: 5,
        totalCooks: 5,
      });

      const result = await service.requestChangeover("cooker", {
        requestedBy: "op1",
      });

      expect(result.success).toBe(true);
      expect(mqttService.publish).not.toHaveBeenCalled();
    });
  });

  // ─── Equipment State Management ──────────────────────────────────

  describe("equipment operational state", () => {
    it("should update asset operational state when assetId is set", async () => {
      // Link an asset to the cooker area
      prisma.changeoverAreaState.update.mockResolvedValue(
        mockDbRow("cooker", "PRODUCTION", { assetId: "asset-cooker-01" })
      );
      await service.setAreaAsset("cooker", "asset-cooker-01");

      // Setup for requestChangeover
      prisma.scheduleOrderQueue.findFirst
        .mockResolvedValueOnce(mockActiveSO)
        .mockResolvedValueOnce(mockNextSO);
      prisma.scheduleOrder.findUnique.mockResolvedValue({
        executedCooks: 5,
        totalCooks: 5,
      });
      prisma.asset.findUnique.mockResolvedValue({
        operationalState: "InUse",
      });
      prisma.changeoverAreaState.update.mockImplementation(
        ({ where, data }: any) =>
          Promise.resolve(
            mockDbRow(where.area, data.state ?? "PRODUCTION", {
              enteredAt: data.enteredAt ?? new Date(),
              activeSOId: data.activeSOId ?? null,
              nextSOId: data.nextSOId ?? null,
              assetId: "asset-cooker-01",
            })
          )
      );

      await service.requestChangeover("cooker", { requestedBy: "op1" });

      // Should have updated asset to Changeover state
      expect(prisma.asset.update).toHaveBeenCalledWith({
        where: { id: "asset-cooker-01" },
        data: { operationalState: "Changeover" },
      });

      // Should have created an equipment state transition record
      expect(prisma.equipmentStateTransition.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          assetId: "asset-cooker-01",
          fromState: "InUse",
          toState: "Changeover",
          triggerType: "SystemAction",
          changeoverArea: "cooker",
        }),
      });
    });

    it("should NOT update asset state when no assetId is set", async () => {
      prisma.scheduleOrderQueue.findFirst
        .mockResolvedValueOnce(mockActiveSO)
        .mockResolvedValueOnce(mockNextSO);
      prisma.scheduleOrder.findUnique.mockResolvedValue({
        executedCooks: 5,
        totalCooks: 5,
      });

      await service.requestChangeover("cooker", { requestedBy: "op1" });

      expect(prisma.asset.findUnique).not.toHaveBeenCalled();
      expect(prisma.asset.update).not.toHaveBeenCalled();
    });

    it("should skip equipment update when already in target state", async () => {
      prisma.changeoverAreaState.update.mockResolvedValue(
        mockDbRow("cooker", "PRODUCTION", { assetId: "asset-cooker-01" })
      );
      await service.setAreaAsset("cooker", "asset-cooker-01");

      prisma.scheduleOrderQueue.findFirst
        .mockResolvedValueOnce(mockActiveSO)
        .mockResolvedValueOnce(mockNextSO);
      prisma.scheduleOrder.findUnique.mockResolvedValue({
        executedCooks: 5,
        totalCooks: 5,
      });
      // Asset is already in Changeover state
      prisma.asset.findUnique.mockResolvedValue({
        operationalState: "Changeover",
      });
      prisma.changeoverAreaState.update.mockImplementation(
        ({ where, data }: any) =>
          Promise.resolve(
            mockDbRow(where.area, data.state ?? "PRODUCTION", {
              enteredAt: data.enteredAt ?? new Date(),
              activeSOId: data.activeSOId ?? null,
              nextSOId: data.nextSOId ?? null,
              assetId: "asset-cooker-01",
            })
          )
      );

      await service.requestChangeover("cooker", { requestedBy: "op1" });

      // Should NOT have updated asset (already in Changeover)
      expect(prisma.asset.update).not.toHaveBeenCalled();
      expect(prisma.equipmentStateTransition.create).not.toHaveBeenCalled();
    });
  });

  describe("setAreaAsset", () => {
    it("should persist assetId to DB and update cache", async () => {
      prisma.changeoverAreaState.update.mockResolvedValue(
        mockDbRow("cooker", "PRODUCTION", { assetId: "asset-1" })
      );

      await service.setAreaAsset("cooker", "asset-1");

      expect(prisma.changeoverAreaState.update).toHaveBeenCalledWith({
        where: { area: "cooker" },
        data: { assetId: "asset-1" },
      });

      const state = service.getAreaState("cooker");
      expect(state.assetId).toBe("asset-1");
    });

    it("should allow clearing assetId", async () => {
      prisma.changeoverAreaState.update.mockResolvedValue(
        mockDbRow("cooker", "PRODUCTION", { assetId: null })
      );

      await service.setAreaAsset("cooker", null);

      const state = service.getAreaState("cooker");
      expect(state.assetId).toBeNull();
    });
  });

  // ─── DB Persistence on Restart ─────────────────────────────────

  describe("state persistence across restarts", () => {
    it("should load existing state from DB on init", async () => {
      // Simulate a DB that already has AWAITING_CHANGEOVER
      prisma.changeoverAreaState.upsert.mockImplementation(({ where }: any) => {
        if (where.area === "cooker") {
          return Promise.resolve(
            mockDbRow("cooker", "AWAITING_CHANGEOVER", {
              activeSOId: "so-123",
              nextSOId: "so-456",
            })
          );
        }
        return Promise.resolve(mockDbRow(where.area));
      });

      await service.onModuleInit();

      const state = service.getAreaState("cooker");
      expect(state.state).toBe(ChangeoverState.AWAITING_CHANGEOVER);
      expect(state.activeSOId).toBe("so-123");
      expect(state.nextSOId).toBe("so-456");

      // Other areas still PRODUCTION
      expect(service.getAreaState("fermentation").state).toBe(
        ChangeoverState.PRODUCTION
      );
    });
  });
});
