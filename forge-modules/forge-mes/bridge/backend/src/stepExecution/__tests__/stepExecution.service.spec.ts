import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import {
  EnumS88StepState,
  EnumProductionPhase,
  EnumProductionEventType,
  EnumProductionEventCategory,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { MqttDomainPublisherService } from "../../mqttDomainPublisher/mqttDomainPublisher.service";
import { ProductionEventService } from "../../productionEvent/productionEvent.service";
import {
  StepExecutionService,
  VALID_STATE_TRANSITIONS,
} from "../stepExecution.service";

describe("StepExecutionService", () => {
  let service: StepExecutionService;
  let prisma: any;
  let productionEventService: any;

  const mockClsService = {
    get: jest.fn(),
  };

  const mockProductionEventService = {
    logEvent: jest.fn(),
  };

  const mockPrismaService = {
    batch: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    stepExecution: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    asset: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockClsService.get.mockReturnValue("test-user-id");
    mockProductionEventService.logEvent.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StepExecutionService,
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: ProductionEventService,
          useValue: mockProductionEventService,
        },
        { provide: ClsService, useValue: mockClsService },
        {
          provide: MqttDomainPublisherService,
          useValue: { publishDomainEvent: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<StepExecutionService>(StepExecutionService);
    prisma = module.get<PrismaService>(PrismaService);
    productionEventService = module.get<ProductionEventService>(
      ProductionEventService
    );
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("VALID_STATE_TRANSITIONS", () => {
    it("should allow Idle → Running", () => {
      expect(VALID_STATE_TRANSITIONS[EnumS88StepState.Idle]).toContain(
        EnumS88StepState.Running
      );
    });

    it("should allow Running → Complete, Paused, Held, Stopping, Aborting", () => {
      const transitions = VALID_STATE_TRANSITIONS[EnumS88StepState.Running];
      expect(transitions).toContain(EnumS88StepState.Complete);
      expect(transitions).toContain(EnumS88StepState.Paused);
      expect(transitions).toContain(EnumS88StepState.Held);
      expect(transitions).toContain(EnumS88StepState.Stopping);
      expect(transitions).toContain(EnumS88StepState.Aborting);
    });

    it("should allow Paused → Running, Restarting, Aborting", () => {
      const transitions = VALID_STATE_TRANSITIONS[EnumS88StepState.Paused];
      expect(transitions).toContain(EnumS88StepState.Running);
      expect(transitions).toContain(EnumS88StepState.Restarting);
      expect(transitions).toContain(EnumS88StepState.Aborting);
    });

    it("should allow Held → Restarting, Aborting", () => {
      const transitions = VALID_STATE_TRANSITIONS[EnumS88StepState.Held];
      expect(transitions).toContain(EnumS88StepState.Restarting);
      expect(transitions).toContain(EnumS88StepState.Aborting);
    });

    it("should have Complete and Aborted as terminal states", () => {
      expect(VALID_STATE_TRANSITIONS[EnumS88StepState.Complete]).toEqual([]);
      expect(VALID_STATE_TRANSITIONS[EnumS88StepState.Aborted]).toEqual([]);
    });

    it("should allow Restarting → Running", () => {
      expect(VALID_STATE_TRANSITIONS[EnumS88StepState.Restarting]).toContain(
        EnumS88StepState.Running
      );
    });
  });

  describe("createStepExecution", () => {
    const input = {
      batchId: "batch-1",
      phase: EnumProductionPhase.Mashing,
      stepName: "Heat to 155°F",
      stepIndex: 0,
      branchIndex: 0,
      mashingProtocolStepId: "mps-1",
    };

    it("should create a step execution in Idle state", async () => {
      const mockBatch = { id: "batch-1", batchId: "MAS.24H15.001" };
      const mockStepExecution = {
        id: "se-1",
        ...input,
        state: EnumS88StepState.Idle,
        createdBy: "test-user-id",
      };

      mockPrismaService.batch.findUnique.mockResolvedValue(mockBatch);
      mockPrismaService.stepExecution.findUnique.mockResolvedValue(null);
      mockPrismaService.stepExecution.create.mockResolvedValue(
        mockStepExecution
      );

      const result = await service.createStepExecution(input);

      expect(result.state).toBe(EnumS88StepState.Idle);
      expect(mockPrismaService.stepExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            batchId: "batch-1",
            stepName: "Heat to 155°F",
            stepIndex: 0,
            state: EnumS88StepState.Idle,
          }),
        })
      );
    });

    it("should throw NotFoundException if batch not found", async () => {
      mockPrismaService.batch.findUnique.mockResolvedValue(null);

      await expect(service.createStepExecution(input)).rejects.toThrow(
        NotFoundException
      );
    });

    it("should throw BadRequestException if step execution already exists", async () => {
      const mockBatch = { id: "batch-1" };
      const existingStep = { id: "se-existing" };

      mockPrismaService.batch.findUnique.mockResolvedValue(mockBatch);
      mockPrismaService.stepExecution.findUnique.mockResolvedValue(
        existingStep
      );

      await expect(service.createStepExecution(input)).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe("startStep", () => {
    it("should transition from Idle to Running", async () => {
      const mockStep = {
        id: "se-1",
        batchId: "batch-1",
        state: EnumS88StepState.Idle,
        stepName: "Heat to 155°F",
        phase: EnumProductionPhase.Mashing,
        stepIndex: 0,
        branchIndex: 0,
        stateHistory: [],
      };
      const updatedStep = {
        ...mockStep,
        state: EnumS88StepState.Running,
        previousState: EnumS88StepState.Idle,
      };

      mockPrismaService.stepExecution.findUnique.mockResolvedValue(mockStep);
      mockPrismaService.stepExecution.update.mockResolvedValue(updatedStep);
      mockPrismaService.batch.update.mockResolvedValue({});

      const result = await service.startStep("se-1");

      expect(result.state).toBe(EnumS88StepState.Running);
      expect(mockPrismaService.batch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { currentStepExecutionId: "se-1" },
        })
      );
      expect(mockProductionEventService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: EnumProductionEventType.StepStarted,
          eventCategory: EnumProductionEventCategory.StateChange,
        })
      );
    });

    it("should throw BadRequestException for invalid transition from Complete", async () => {
      const mockStep = {
        id: "se-1",
        state: EnumS88StepState.Complete,
        stepName: "Step",
      };

      mockPrismaService.stepExecution.findUnique.mockResolvedValue(mockStep);

      await expect(service.startStep("se-1")).rejects.toThrow(
        BadRequestException
      );
    });

    it("should throw NotFoundException if step not found", async () => {
      mockPrismaService.stepExecution.findUnique.mockResolvedValue(null);

      await expect(service.startStep("nonexistent")).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe("completeStep", () => {
    it("should transition from Running to Complete and calculate duration", async () => {
      const startTime = new Date(Date.now() - 300000); // 5 minutes ago
      const mockStep = {
        id: "se-1",
        batchId: "batch-1",
        state: EnumS88StepState.Running,
        stepName: "Heat to 155°F",
        phase: EnumProductionPhase.Mashing,
        stepIndex: 0,
        branchIndex: 0,
        actualStartTime: startTime,
        stateHistory: [],
      };
      const updatedStep = {
        ...mockStep,
        state: EnumS88StepState.Complete,
        previousState: EnumS88StepState.Running,
        actualDuration: 300,
      };

      mockPrismaService.stepExecution.findUnique.mockResolvedValue(mockStep);
      mockPrismaService.stepExecution.update.mockResolvedValue(updatedStep);

      const result = await service.completeStep("se-1");

      expect(result.state).toBe(EnumS88StepState.Complete);
      expect(mockPrismaService.stepExecution.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            state: EnumS88StepState.Complete,
            exitConditionMet: true,
          }),
        })
      );
      expect(mockProductionEventService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: EnumProductionEventType.StepCompleted,
        })
      );
    });

    it("should throw for invalid transition from Idle", async () => {
      const mockStep = {
        id: "se-1",
        state: EnumS88StepState.Idle,
        stepName: "Step",
      };

      mockPrismaService.stepExecution.findUnique.mockResolvedValue(mockStep);

      await expect(service.completeStep("se-1")).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe("pauseStep", () => {
    it("should transition from Running to Paused with reason", async () => {
      const mockStep = {
        id: "se-1",
        batchId: "batch-1",
        state: EnumS88StepState.Running,
        stepName: "Heat to 155°F",
        phase: EnumProductionPhase.Mashing,
        stepIndex: 0,
        branchIndex: 0,
        stateHistory: [],
      };
      const updatedStep = {
        ...mockStep,
        state: EnumS88StepState.Paused,
        pauseReason: "Waiting for ingredient",
      };

      mockPrismaService.stepExecution.findUnique.mockResolvedValue(mockStep);
      mockPrismaService.stepExecution.update.mockResolvedValue(updatedStep);

      const result = await service.pauseStep("se-1", "Waiting for ingredient");

      expect(result.state).toBe(EnumS88StepState.Paused);
      expect(mockPrismaService.stepExecution.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            state: EnumS88StepState.Paused,
            pauseReason: "Waiting for ingredient",
          }),
        })
      );
      expect(mockProductionEventService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: EnumProductionEventType.StepPaused,
          description: "Waiting for ingredient",
        })
      );
    });
  });

  describe("resumeStep", () => {
    it("should transition from Paused through Restarting to Running", async () => {
      const mockStep = {
        id: "se-1",
        batchId: "batch-1",
        state: EnumS88StepState.Paused,
        stepName: "Heat to 155°F",
        phase: EnumProductionPhase.Mashing,
        stepIndex: 0,
        branchIndex: 0,
        stateHistory: [],
      };
      const restartingStep = {
        ...mockStep,
        state: EnumS88StepState.Restarting,
      };
      const runningStep = { ...mockStep, state: EnumS88StepState.Running };

      mockPrismaService.stepExecution.findUnique.mockResolvedValue(mockStep);
      mockPrismaService.stepExecution.update
        .mockResolvedValueOnce(restartingStep)
        .mockResolvedValueOnce(runningStep);

      const result = await service.resumeStep("se-1");

      expect(result.state).toBe(EnumS88StepState.Running);
      expect(mockPrismaService.stepExecution.update).toHaveBeenCalledTimes(2);
      expect(mockProductionEventService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: EnumProductionEventType.StepResumed,
        })
      );
    });
  });

  describe("holdStep", () => {
    it("should transition from Running to Held with reason", async () => {
      const mockStep = {
        id: "se-1",
        batchId: "batch-1",
        state: EnumS88StepState.Running,
        stepName: "Heat to 155°F",
        phase: EnumProductionPhase.Mashing,
        stepIndex: 0,
        branchIndex: 0,
        stateHistory: [],
      };
      const updatedStep = {
        ...mockStep,
        state: EnumS88StepState.Held,
        holdReason: "Equipment malfunction",
      };

      mockPrismaService.stepExecution.findUnique.mockResolvedValue(mockStep);
      mockPrismaService.stepExecution.update.mockResolvedValue(updatedStep);

      const result = await service.holdStep("se-1", "Equipment malfunction");

      expect(result.state).toBe(EnumS88StepState.Held);
      expect(mockPrismaService.stepExecution.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            state: EnumS88StepState.Held,
            holdReason: "Equipment malfunction",
          }),
        })
      );
      expect(mockProductionEventService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: EnumProductionEventType.StepHeld,
        })
      );
    });
  });

  describe("abortStep", () => {
    it("should transition from Running through Aborting to Aborted", async () => {
      const mockStep = {
        id: "se-1",
        batchId: "batch-1",
        state: EnumS88StepState.Running,
        stepName: "Heat to 155°F",
        phase: EnumProductionPhase.Mashing,
        stepIndex: 0,
        branchIndex: 0,
        stateHistory: [],
      };
      const abortingStep = {
        ...mockStep,
        state: EnumS88StepState.Aborting,
      };
      const abortedStep = { ...mockStep, state: EnumS88StepState.Aborted };

      mockPrismaService.stepExecution.findUnique.mockResolvedValue(mockStep);
      mockPrismaService.stepExecution.update
        .mockResolvedValueOnce(abortingStep)
        .mockResolvedValueOnce(abortedStep);

      const result = await service.abortStep("se-1", "Critical failure");

      expect(result.state).toBe(EnumS88StepState.Aborted);
      expect(mockPrismaService.stepExecution.update).toHaveBeenCalledTimes(2);
      expect(mockProductionEventService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: EnumProductionEventType.StepAborted,
          description: "Critical failure",
        })
      );
    });

    it("should allow aborting from Paused state", async () => {
      const mockStep = {
        id: "se-1",
        batchId: "batch-1",
        state: EnumS88StepState.Paused,
        stepName: "Step",
        phase: EnumProductionPhase.Mashing,
        stepIndex: 0,
        branchIndex: 0,
        stateHistory: [],
      };

      mockPrismaService.stepExecution.findUnique.mockResolvedValue(mockStep);
      mockPrismaService.stepExecution.update.mockResolvedValue({
        ...mockStep,
        state: EnumS88StepState.Aborted,
      });

      const result = await service.abortStep("se-1", "Emergency");

      expect(mockPrismaService.stepExecution.update).toHaveBeenCalled();
    });

    it("should throw for aborting from Complete state", async () => {
      const mockStep = {
        id: "se-1",
        state: EnumS88StepState.Complete,
        stepName: "Step",
      };

      mockPrismaService.stepExecution.findUnique.mockResolvedValue(mockStep);

      await expect(service.abortStep("se-1", "Too late")).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe("allocateEquipment", () => {
    it("should assign equipment to a step execution", async () => {
      const mockStep = {
        id: "se-1",
        batchId: "batch-1",
        phase: EnumProductionPhase.Mashing,
        stepIndex: 0,
        stepName: "Heat to 155°F",
      };
      const mockAsset = { id: "asset-1", name: "Mash Tun #1" };
      const updatedStep = {
        ...mockStep,
        allocatedAssetId: "asset-1",
        equipmentMode: "Heating",
      };

      mockPrismaService.stepExecution.findUnique.mockResolvedValue(mockStep);
      mockPrismaService.asset.findUnique.mockResolvedValue(mockAsset);
      mockPrismaService.stepExecution.update.mockResolvedValue(updatedStep);

      const result = await service.allocateEquipment(
        "se-1",
        "asset-1",
        "Heating"
      );

      expect(result.allocatedAssetId).toBe("asset-1");
      expect(mockProductionEventService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: EnumProductionEventType.EquipmentAllocated,
          assetId: "asset-1",
        })
      );
    });

    it("should throw NotFoundException if asset not found", async () => {
      const mockStep = { id: "se-1", batchId: "batch-1" };

      mockPrismaService.stepExecution.findUnique.mockResolvedValue(mockStep);
      mockPrismaService.asset.findUnique.mockResolvedValue(null);

      await expect(
        service.allocateEquipment("se-1", "nonexistent")
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("getSfcState", () => {
    it("should return structured SFC state for a batch", async () => {
      const mockBatch = {
        id: "batch-1",
        currentStepExecutionId: "se-2",
      };
      const mockSteps = [
        {
          id: "se-1",
          batchId: "batch-1",
          phase: EnumProductionPhase.Mashing,
          stepIndex: 0,
          branchIndex: 0,
          stepName: "Heat",
          state: EnumS88StepState.Complete,
          actualStartTime: new Date(),
          actualEndTime: new Date(),
          actualDuration: 300,
        },
        {
          id: "se-2",
          batchId: "batch-1",
          phase: EnumProductionPhase.Mashing,
          stepIndex: 1,
          branchIndex: 0,
          stepName: "Hold",
          state: EnumS88StepState.Running,
          actualStartTime: new Date(),
          actualEndTime: null,
          actualDuration: null,
        },
      ];
      const currentStep = mockSteps[1];

      mockPrismaService.batch.findUnique.mockResolvedValue(mockBatch);
      mockPrismaService.stepExecution.findMany.mockResolvedValue(mockSteps);
      mockPrismaService.stepExecution.findUnique.mockResolvedValue(currentStep);

      const result = await service.getSfcState("batch-1");

      expect(result.batchId).toBe("batch-1");
      expect(result.phases).toHaveLength(1);
      expect(result.phases[0].phase).toBe(EnumProductionPhase.Mashing);
      expect(result.phases[0].totalSteps).toBe(2);
      expect(result.phases[0].completedSteps).toBe(1);
      expect(result.activeSteps).toHaveLength(1);
    });

    it("should throw NotFoundException if batch not found", async () => {
      mockPrismaService.batch.findUnique.mockResolvedValue(null);

      await expect(service.getSfcState("nonexistent")).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe("getStepExecutions", () => {
    it("should return step executions for a batch", async () => {
      const mockSteps = [
        { id: "se-1", batchId: "batch-1", phase: EnumProductionPhase.Mashing },
      ];

      mockPrismaService.stepExecution.findMany.mockResolvedValue(mockSteps);

      const result = await service.getStepExecutions("batch-1");

      expect(result).toEqual(mockSteps);
      expect(mockPrismaService.stepExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { batchId: "batch-1" },
        })
      );
    });

    it("should filter by phase when provided", async () => {
      mockPrismaService.stepExecution.findMany.mockResolvedValue([]);

      await service.getStepExecutions("batch-1", "Mashing");

      expect(mockPrismaService.stepExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { batchId: "batch-1", phase: "Mashing" },
        })
      );
    });
  });

  describe("getCurrentStep", () => {
    it("should return current step execution", async () => {
      const mockBatch = { currentStepExecutionId: "se-1" };
      const mockStep = { id: "se-1", state: EnumS88StepState.Running };

      mockPrismaService.batch.findUnique.mockResolvedValue(mockBatch);
      mockPrismaService.stepExecution.findUnique.mockResolvedValue(mockStep);

      const result = await service.getCurrentStep("batch-1");

      expect(result).toEqual(mockStep);
    });

    it("should return null if no current step", async () => {
      mockPrismaService.batch.findUnique.mockResolvedValue({
        currentStepExecutionId: null,
      });

      const result = await service.getCurrentStep("batch-1");

      expect(result).toBeNull();
    });
  });
});
