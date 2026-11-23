import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { ClsService } from "nestjs-cls";
import {
  EnumS88StepState,
  EnumProductionPhase,
  EnumDeviationType,
  EnumDeviationSeverity,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { StepExecutionService } from "../../stepExecution/stepExecution.service";
import { BatchDeviationService } from "../../batchDeviation/batchDeviation.service";
import { BatchService } from "../../batch/batch.service";
import { MashingStepParameterService } from "../../mashingStepParameter/mashingStepParameter.service";
import { MashingExecutionService } from "../mashingExecution.service";
import { MqttDomainPublisherService } from "../../mqttDomainPublisher/mqttDomainPublisher.service";

describe("MashingExecutionService", () => {
  let service: MashingExecutionService;
  let prisma: any;
  let stepExecutionService: any;
  let batchDeviationService: any;
  let batchService: any;

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };

  const mockClsService = {
    get: jest.fn().mockReturnValue("test-user-id"),
  };

  const mockStepExecutionService = {
    createStepExecution: jest.fn(),
    startStep: jest.fn(),
    completeStep: jest.fn(),
    pauseStep: jest.fn(),
    resumeStep: jest.fn(),
    holdStep: jest.fn(),
    abortStep: jest.fn(),
  };

  const mockBatchDeviationService = {
    recordDeviation: jest.fn(),
  };

  const mockBatchService = {
    GetBatchId: jest.fn(),
  };

  const mockPrismaService = {
    batch: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    scheduleOrderRecipeInstance: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    stepExecution: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    mashingProtocolStep: {
      findUnique: jest.fn(),
    },
    mashingProtocolStepActual: {
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockClsService.get.mockReturnValue("test-user-id");
    mockStepExecutionService.createStepExecution.mockResolvedValue({});
    mockStepExecutionService.startStep.mockResolvedValue({});
    mockStepExecutionService.completeStep.mockResolvedValue({});
    mockBatchDeviationService.recordDeviation.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MashingExecutionService,
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: StepExecutionService,
          useValue: mockStepExecutionService,
        },
        {
          provide: BatchDeviationService,
          useValue: mockBatchDeviationService,
        },
        { provide: BatchService, useValue: mockBatchService },
        {
          provide: MashingStepParameterService,
          useValue: { recordParameterActual: jest.fn(), getParameterActuals: jest.fn() },
        },
        { provide: ClsService, useValue: mockClsService },
        { provide: WINSTON_MODULE_PROVIDER, useValue: mockLogger },
        {
          provide: MqttDomainPublisherService,
          useValue: { publishDomainEvent: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<MashingExecutionService>(MashingExecutionService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("getOrCreateMashingBatch", () => {
    it("should return existing batch if one exists", async () => {
      const existingBatch = {
        id: "batch-1",
        batchId: "MAS.24H15.001",
      };

      mockPrismaService.batch.findFirst.mockResolvedValue(existingBatch);

      const result = await service.getOrCreateMashingBatch("so-1");

      expect(result).toBe("batch-1");
      expect(mockBatchService.GetBatchId).not.toHaveBeenCalled();
    });

    it("should create a new batch if none exists", async () => {
      const soInstance = { id: "sori-1", scheduleOrderId: "so-1" };
      const recipeInfo = {
        id: "sori-1",
        recipe: { Recipe: "Bourbon Mash Bill #1", revision: 3 },
      };
      const newBatch = {
        id: "batch-new",
        batchId: "MAS.24H15.002",
      };

      mockPrismaService.batch.findFirst.mockResolvedValue(null);
      mockPrismaService.scheduleOrderRecipeInstance.findFirst.mockResolvedValue(
        soInstance
      );
      mockPrismaService.scheduleOrderRecipeInstance.findUnique.mockResolvedValue(
        recipeInfo
      );
      mockBatchService.GetBatchId.mockResolvedValue(newBatch);
      mockPrismaService.batch.update.mockResolvedValue({});

      const result = await service.getOrCreateMashingBatch("so-1");

      expect(result).toBe("batch-new");
      expect(mockBatchService.GetBatchId).toHaveBeenCalledWith(
        expect.objectContaining({ operation: "Mashing01" })
      );
      expect(mockPrismaService.batch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "batch-new" },
          data: expect.objectContaining({
            recipeName: "Bourbon Mash Bill #1",
            recipeRevision: 3,
          }),
        })
      );
    });

    it("should throw NotFoundException if schedule order instance not found", async () => {
      mockPrismaService.batch.findFirst.mockResolvedValue(null);
      mockPrismaService.scheduleOrderRecipeInstance.findFirst.mockResolvedValue(
        null
      );

      await expect(
        service.getOrCreateMashingBatch("nonexistent")
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("startMashingStep", () => {
    const scheduleOrderId = "so-1";
    const mashingProtocolStepId = "mps-1";

    const mockMashingStep = {
      id: "mps-1",
      index: 0,
      stepType: "MashIn",
      promptMessage: "Mash In at 155°F",
      temperatureSetpoint: 155,
      stepTime: 30,
      mashingProtocol: {
        id: "mp-1",
        scheduleOrderRecipeInstance: {
          scheduleOrderId: "so-1",
        },
      },
    };

    it("should create and start a new step execution", async () => {
      const existingBatch = { id: "batch-1", batchId: "MAS.24H15.001" };
      const createdStep = {
        id: "se-1",
        state: EnumS88StepState.Idle,
      };
      const startedStep = {
        id: "se-1",
        state: EnumS88StepState.Running,
        stepName: "Mash In at 155°F",
        batchId: "batch-1",
      };

      mockPrismaService.mashingProtocolStep.findUnique.mockResolvedValue(
        mockMashingStep
      );
      mockPrismaService.batch.findFirst.mockResolvedValue(existingBatch);
      mockPrismaService.stepExecution.findFirst.mockResolvedValue(null);
      mockStepExecutionService.createStepExecution.mockResolvedValue(
        createdStep
      );
      mockStepExecutionService.startStep.mockResolvedValue(startedStep);

      const result = await service.startMashingStep(
        scheduleOrderId,
        mashingProtocolStepId
      );

      expect(result.state).toBe(EnumS88StepState.Running);
      expect(mockStepExecutionService.createStepExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId: "batch-1",
          phase: EnumProductionPhase.Mashing,
          stepIndex: 0,
          stepName: "Mash In at 155°F",
          mashingProtocolStepId: "mps-1",
          plannedDuration: 1800, // 30 min * 60
        })
      );
      expect(mockStepExecutionService.startStep).toHaveBeenCalledWith("se-1");
    });

    it("should start existing Idle step execution", async () => {
      const existingBatch = { id: "batch-1" };
      const existingExecution = {
        id: "se-existing",
        state: EnumS88StepState.Idle,
      };
      const startedStep = {
        id: "se-existing",
        state: EnumS88StepState.Running,
      };

      mockPrismaService.mashingProtocolStep.findUnique.mockResolvedValue(
        mockMashingStep
      );
      mockPrismaService.batch.findFirst.mockResolvedValue(existingBatch);
      mockPrismaService.stepExecution.findFirst.mockResolvedValue(
        existingExecution
      );
      mockStepExecutionService.startStep.mockResolvedValue(startedStep);

      const result = await service.startMashingStep(
        scheduleOrderId,
        mashingProtocolStepId
      );

      expect(result.state).toBe(EnumS88StepState.Running);
      expect(
        mockStepExecutionService.createStepExecution
      ).not.toHaveBeenCalled();
      expect(mockStepExecutionService.startStep).toHaveBeenCalledWith(
        "se-existing"
      );
    });

    it("should throw if step already running", async () => {
      const existingBatch = { id: "batch-1" };
      const runningExecution = {
        id: "se-running",
        state: EnumS88StepState.Running,
      };

      mockPrismaService.mashingProtocolStep.findUnique.mockResolvedValue(
        mockMashingStep
      );
      mockPrismaService.batch.findFirst.mockResolvedValue(existingBatch);
      mockPrismaService.stepExecution.findFirst.mockResolvedValue(
        runningExecution
      );

      await expect(
        service.startMashingStep(scheduleOrderId, mashingProtocolStepId)
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw if mashing step not found", async () => {
      mockPrismaService.mashingProtocolStep.findUnique.mockResolvedValue(null);

      await expect(
        service.startMashingStep(scheduleOrderId, "nonexistent")
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw if step does not belong to schedule order", async () => {
      const wrongStep = {
        ...mockMashingStep,
        mashingProtocol: {
          scheduleOrderRecipeInstance: {
            scheduleOrderId: "different-so",
          },
        },
      };

      mockPrismaService.mashingProtocolStep.findUnique.mockResolvedValue(
        wrongStep
      );

      await expect(
        service.startMashingStep(scheduleOrderId, mashingProtocolStepId)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("completeMashingStep", () => {
    const stepExecutionId = "se-1";
    const actuals = {
      actualTemperature: 155,
      actualDuration: 1800,
    };

    const mockStepExecution = {
      id: "se-1",
      batchId: "batch-1",
      mashingProtocolStepId: "mps-1",
      state: EnumS88StepState.Running,
      stepName: "Mash In",
      batch: { id: "batch-1" },
    };

    const mockMashingStep = {
      id: "mps-1",
      index: 0,
      temperatureSetpoint: 155,
      stepTime: 30, // 30 minutes
      mashingProtocol: { id: "mp-1" },
    };

    const mockCompletedStep = {
      id: "se-1",
      batchId: "batch-1",
      state: EnumS88StepState.Complete,
      stepName: "Mash In",
      phase: EnumProductionPhase.Mashing,
      stepIndex: 0,
      actualStartTime: new Date(Date.now() - 1800000),
      actualEndTime: new Date(),
      actualDuration: 1800,
      startedBy: "test-user-id",
      completedBy: "test-user-id",
      createdAt: new Date(),
    };

    it("should complete step and record actuals without deviations", async () => {
      const mockActual = {
        id: "actual-1",
        actualValue: 155,
        timeActualValue: 30,
        stepCompletedAt: new Date(),
        createdBy: "test-user-id",
        createdAt: new Date(),
      };

      mockPrismaService.stepExecution.findUnique.mockResolvedValue(
        mockStepExecution
      );
      mockPrismaService.mashingProtocolStep.findUnique.mockResolvedValue(
        mockMashingStep
      );
      mockStepExecutionService.completeStep.mockResolvedValue(
        mockCompletedStep
      );
      mockPrismaService.mashingProtocolStepActual.create.mockResolvedValue(
        mockActual
      );

      const result = await service.completeMashingStep(
        stepExecutionId,
        actuals
      );

      expect(result.stepExecution.state).toBe(EnumS88StepState.Complete);
      expect(result.deviations).toHaveLength(0);
      expect(
        mockPrismaService.mashingProtocolStepActual.create
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mashingProtocolId: "mp-1",
            mashingProtocolStepId: "mps-1",
            actualValue: 155,
            stepExecutionId: "se-1",
          }),
        })
      );
    });

    it("should detect temperature deviation when exceeding tolerance", async () => {
      const actualsWithDeviation = {
        actualTemperature: 165, // 10°F above setpoint of 155, > 5°F tolerance
      };

      const mockDeviation = {
        id: "dev-1",
        batchId: "batch-1",
        deviationType: EnumDeviationType.ParameterOutOfSpec,
        severity: EnumDeviationSeverity.Minor,
        status: "Open",
        parameterName: "MashTemperature",
        plannedValue: 155,
        actualValue: 165,
        deviationPercent: 6.45,
        units: "°F",
        description: "Temperature deviation",
        isAutoDetected: true,
        detectedAt: new Date(),
        detectedBy: "test-user-id",
      };

      mockPrismaService.stepExecution.findUnique.mockResolvedValue(
        mockStepExecution
      );
      mockPrismaService.mashingProtocolStep.findUnique.mockResolvedValue(
        mockMashingStep
      );
      mockStepExecutionService.completeStep.mockResolvedValue(
        mockCompletedStep
      );
      mockPrismaService.mashingProtocolStepActual.create.mockResolvedValue({
        id: "actual-1",
        actualValue: 165,
        createdAt: new Date(),
        createdBy: "test-user-id",
      });
      mockBatchDeviationService.recordDeviation.mockResolvedValue(
        mockDeviation
      );

      const result = await service.completeMashingStep(
        stepExecutionId,
        actualsWithDeviation
      );

      expect(result.deviations).toHaveLength(1);
      expect(mockBatchDeviationService.recordDeviation).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId: "batch-1",
          deviationType: EnumDeviationType.ParameterOutOfSpec,
          parameterName: "MashTemperature",
          plannedValue: 155,
          actualValue: 165,
          isAutoDetected: true,
        })
      );
    });

    it("should NOT detect temperature deviation within tolerance", async () => {
      const actualsWithinTolerance = {
        actualTemperature: 158, // 3°F above setpoint, within 5°F tolerance
      };

      mockPrismaService.stepExecution.findUnique.mockResolvedValue(
        mockStepExecution
      );
      mockPrismaService.mashingProtocolStep.findUnique.mockResolvedValue(
        mockMashingStep
      );
      mockStepExecutionService.completeStep.mockResolvedValue(
        mockCompletedStep
      );
      mockPrismaService.mashingProtocolStepActual.create.mockResolvedValue({
        id: "actual-1",
        actualValue: 158,
        createdAt: new Date(),
        createdBy: "test-user-id",
      });

      const result = await service.completeMashingStep(
        stepExecutionId,
        actualsWithinTolerance
      );

      expect(result.deviations).toHaveLength(0);
      expect(mockBatchDeviationService.recordDeviation).not.toHaveBeenCalled();
    });

    it("should detect timing deviation when exceeding threshold", async () => {
      const actualsWithTimingDeviation = {
        actualTemperature: 155,
        actualDuration: 2400, // 40 min (actual) vs 30 min (planned) = 33% deviation
      };

      const mockDeviation = {
        id: "dev-1",
        batchId: "batch-1",
        deviationType: EnumDeviationType.TimingDeviation,
        severity: EnumDeviationSeverity.Critical,
        status: "Open",
        parameterName: "StepDuration",
        plannedValue: 1800,
        actualValue: 2400,
        description: "Timing deviation",
        isAutoDetected: true,
        detectedAt: new Date(),
        detectedBy: "test-user-id",
      };

      mockPrismaService.stepExecution.findUnique.mockResolvedValue(
        mockStepExecution
      );
      mockPrismaService.mashingProtocolStep.findUnique.mockResolvedValue(
        mockMashingStep
      );
      mockStepExecutionService.completeStep.mockResolvedValue(
        mockCompletedStep
      );
      mockPrismaService.mashingProtocolStepActual.create.mockResolvedValue({
        id: "actual-1",
        actualValue: 155,
        createdAt: new Date(),
        createdBy: "test-user-id",
      });
      mockBatchDeviationService.recordDeviation.mockResolvedValue(
        mockDeviation
      );

      const result = await service.completeMashingStep(
        stepExecutionId,
        actualsWithTimingDeviation
      );

      expect(result.deviations).toHaveLength(1);
      expect(mockBatchDeviationService.recordDeviation).toHaveBeenCalledWith(
        expect.objectContaining({
          deviationType: EnumDeviationType.TimingDeviation,
          parameterName: "StepDuration",
          plannedValue: 1800,
          actualValue: 2400,
        })
      );
    });

    it("should throw if step execution not found", async () => {
      mockPrismaService.stepExecution.findUnique.mockResolvedValue(null);

      await expect(
        service.completeMashingStep("nonexistent", actuals)
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw if step is not linked to mashing protocol", async () => {
      const stepWithoutMashing = {
        ...mockStepExecution,
        mashingProtocolStepId: null,
      };

      mockPrismaService.stepExecution.findUnique.mockResolvedValue(
        stepWithoutMashing
      );

      await expect(
        service.completeMashingStep(stepExecutionId, actuals)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("delegation methods", () => {
    it("pauseMashingStep should delegate to stepExecutionService.pauseStep", async () => {
      const mockResult = { id: "se-1", state: EnumS88StepState.Paused };
      mockStepExecutionService.pauseStep.mockResolvedValue(mockResult);

      const result = await service.pauseMashingStep("se-1", "Break time");

      expect(mockStepExecutionService.pauseStep).toHaveBeenCalledWith(
        "se-1",
        "Break time"
      );
      expect(result).toEqual(mockResult);
    });

    it("resumeMashingStep should delegate to stepExecutionService.resumeStep", async () => {
      const mockResult = { id: "se-1", state: EnumS88StepState.Running };
      mockStepExecutionService.resumeStep.mockResolvedValue(mockResult);

      const result = await service.resumeMashingStep("se-1");

      expect(mockStepExecutionService.resumeStep).toHaveBeenCalledWith("se-1");
      expect(result).toEqual(mockResult);
    });

    it("holdMashingStep should delegate to stepExecutionService.holdStep", async () => {
      const mockResult = { id: "se-1", state: EnumS88StepState.Held };
      mockStepExecutionService.holdStep.mockResolvedValue(mockResult);

      const result = await service.holdMashingStep("se-1", "Equipment failure");

      expect(mockStepExecutionService.holdStep).toHaveBeenCalledWith(
        "se-1",
        "Equipment failure"
      );
      expect(result).toEqual(mockResult);
    });

    it("abortMashingStep should delegate to stepExecutionService.abortStep", async () => {
      const mockResult = { id: "se-1", state: EnumS88StepState.Aborted };
      mockStepExecutionService.abortStep.mockResolvedValue(mockResult);

      const result = await service.abortMashingStep("se-1", "Emergency");

      expect(mockStepExecutionService.abortStep).toHaveBeenCalledWith(
        "se-1",
        "Emergency"
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe("getMashingState", () => {
    it("should return full mashing state for a schedule order", async () => {
      const soInstance = {
        id: "sori-1",
        mashingProtocols: [
          {
            id: "mp-1",
            steps: [
              {
                id: "mps-1",
                index: 0,
                stepType: "MashIn",
                promptMessage: "Mash In",
                temperatureSetpoint: 155,
                stepTime: 30,
              },
              {
                id: "mps-2",
                index: 1,
                stepType: "Rest",
                promptMessage: "Rest",
                temperatureSetpoint: 155,
                stepTime: 60,
              },
            ],
            mashingProtocolStepActuals: [
              {
                mashingProtocolStepId: "mps-1",
                actualValue: 155,
              },
            ],
          },
        ],
        batches: [{ id: "batch-1", batchId: "MAS.24H15.001" }],
      };

      const stepExecutions = [
        {
          id: "se-1",
          batchId: "batch-1",
          mashingProtocolStepId: "mps-1",
          stepIndex: 0,
          stepName: "Mash In",
          state: EnumS88StepState.Complete,
          actualStartTime: new Date(Date.now() - 3600000),
          actualEndTime: new Date(Date.now() - 1800000),
          actualDuration: 1800,
        },
        {
          id: "se-2",
          batchId: "batch-1",
          mashingProtocolStepId: "mps-2",
          stepIndex: 1,
          stepName: "Rest",
          state: EnumS88StepState.Running,
          actualStartTime: new Date(Date.now() - 600000),
          actualEndTime: null,
          actualDuration: null,
        },
      ];

      mockPrismaService.scheduleOrderRecipeInstance.findFirst.mockResolvedValue(
        soInstance
      );
      mockPrismaService.stepExecution.findMany.mockResolvedValue(
        stepExecutions
      );

      const result = await service.getMashingState("so-1");

      expect(result.scheduleOrderId).toBe("so-1");
      expect(result.batchId).toBe("MAS.24H15.001");
      expect(result.completedSteps).toHaveLength(1);
      expect(result.currentStep).toBeDefined();
      expect(result.currentStep!.state).toBe(EnumS88StepState.Running);
      expect(result.pendingSteps).toHaveLength(0); // Both steps have executions
      expect(result.overallProgress).toBe(50); // 1 of 2 complete
    });

    it("should throw if schedule order instance not found", async () => {
      mockPrismaService.scheduleOrderRecipeInstance.findFirst.mockResolvedValue(
        null
      );

      await expect(service.getMashingState("nonexistent")).rejects.toThrow(
        NotFoundException
      );
    });

    it("should handle no batch yet (before first step start)", async () => {
      const soInstance = {
        id: "sori-1",
        mashingProtocols: [
          {
            id: "mp-1",
            steps: [
              {
                id: "mps-1",
                index: 0,
                stepType: "MashIn",
                promptMessage: "Mash In",
                temperatureSetpoint: 155,
                stepTime: 30,
              },
            ],
            mashingProtocolStepActuals: [],
          },
        ],
        batches: [],
      };

      mockPrismaService.scheduleOrderRecipeInstance.findFirst.mockResolvedValue(
        soInstance
      );

      const result = await service.getMashingState("so-1");

      expect(result.batchId).toBeUndefined();
      expect(result.currentStep).toBeUndefined();
      expect(result.completedSteps).toHaveLength(0);
      expect(result.pendingSteps).toHaveLength(1);
      expect(result.overallProgress).toBe(0);
    });
  });

  describe("getMashingStepExecution", () => {
    it("should return step execution for a mashing protocol step", async () => {
      const soInstance = {
        id: "sori-1",
        batches: [{ id: "batch-1", batchId: "MAS.24H15.001" }],
      };
      const stepExecution = {
        id: "se-1",
        batchId: "batch-1",
        mashingProtocolStepId: "mps-1",
        state: EnumS88StepState.Running,
      };

      mockPrismaService.scheduleOrderRecipeInstance.findFirst.mockResolvedValue(
        soInstance
      );
      mockPrismaService.stepExecution.findFirst.mockResolvedValue(
        stepExecution
      );

      const result = await service.getMashingStepExecution("so-1", "mps-1");

      expect(result).toEqual(stepExecution);
    });

    it("should return null if no batch exists", async () => {
      mockPrismaService.scheduleOrderRecipeInstance.findFirst.mockResolvedValue(
        null
      );

      const result = await service.getMashingStepExecution("so-1", "mps-1");

      expect(result).toBeNull();
    });
  });

  describe("severity calculation", () => {
    it("should return Minor for ≤10% deviation", async () => {
      // Test via completeMashingStep with 6.45% temp deviation (10°F / 155°F)
      const actuals = { actualTemperature: 165 }; // 10°F off from 155
      const mockStep = {
        id: "se-1",
        batchId: "batch-1",
        mashingProtocolStepId: "mps-1",
        state: EnumS88StepState.Running,
        batch: { id: "batch-1" },
      };
      const mockMashingStep = {
        id: "mps-1",
        index: 0,
        temperatureSetpoint: 155,
        stepTime: null,
        mashingProtocol: { id: "mp-1" },
      };

      mockPrismaService.stepExecution.findUnique.mockResolvedValue(mockStep);
      mockPrismaService.mashingProtocolStep.findUnique.mockResolvedValue(
        mockMashingStep
      );
      mockStepExecutionService.completeStep.mockResolvedValue({
        ...mockStep,
        state: EnumS88StepState.Complete,
        actualStartTime: new Date(),
        actualEndTime: new Date(),
        createdAt: new Date(),
        id: "se-1",
      });
      mockPrismaService.mashingProtocolStepActual.create.mockResolvedValue({
        id: "actual-1",
        actualValue: 165,
        createdAt: new Date(),
        createdBy: "test-user-id",
      });
      mockBatchDeviationService.recordDeviation.mockResolvedValue({
        id: "dev-1",
        severity: EnumDeviationSeverity.Minor,
      });

      await service.completeMashingStep("se-1", actuals);

      // 10/155 = 6.45% → Minor
      expect(mockBatchDeviationService.recordDeviation).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: EnumDeviationSeverity.Minor,
        })
      );
    });
  });
});
