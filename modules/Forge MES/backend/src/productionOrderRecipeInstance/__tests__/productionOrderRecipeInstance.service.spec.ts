import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../../prisma/prisma.service";
import { ProductionOrderRecipeInstanceService } from "../productionOrderRecipeInstance.service";

describe("ProductionOrderRecipeInstanceService", () => {
  let service: ProductionOrderRecipeInstanceService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    $transaction: jest.fn(),
    scheduleOrderQueue: {
      findUnique: jest.fn(),
    },
    productionOrderRecipeInstance: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    recipeParameter: {
      create: jest.fn(),
    },
    recipeBom: {
      create: jest.fn(),
    },
    recipeBomItem: {
      create: jest.fn(),
    },
    mashingProtocol: {
      create: jest.fn(),
    },
    mashingProtocolStep: {
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductionOrderRecipeInstanceService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ProductionOrderRecipeInstanceService>(
      ProductionOrderRecipeInstanceService
    );
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("createProductionOrderRecipeInstanceFromScheduleQueue", () => {
    it("should throw error if schedule order queue not found", async () => {
      const scheduleOrderQueueId = "non-existent-id";
      const createdBy = "test-user";

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        mockPrismaService.scheduleOrderQueue.findUnique.mockResolvedValue(null);
        return callback(mockPrismaService);
      });

      await expect(
        service.createProductionOrderRecipeInstanceFromScheduleQueue(
          scheduleOrderQueueId,
          createdBy
        )
      ).rejects.toThrow(
        `Schedule order queue with id ${scheduleOrderQueueId} not found`
      );
    });

    it("should throw error if schedule order queue is not at index 1", async () => {
      const scheduleOrderQueueId = "test-queue-id";
      const createdBy = "test-user";

      const mockScheduleOrderQueue = {
        id: scheduleOrderQueueId,
        queueIndex: 0, // Not at index 1
        scheduleOrder: null,
      };

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        mockPrismaService.scheduleOrderQueue.findUnique.mockResolvedValue(
          mockScheduleOrderQueue
        );
        return callback(mockPrismaService);
      });

      await expect(
        service.createProductionOrderRecipeInstanceFromScheduleQueue(
          scheduleOrderQueueId,
          createdBy
        )
      ).rejects.toThrow(
        "Schedule order queue must be at index 1 (next in line for mashing) to create production order recipe instance. Current index: 0"
      );
    });

    it("should throw error if no production order found", async () => {
      const scheduleOrderQueueId = "test-queue-id";
      const createdBy = "test-user";

      const mockScheduleOrderQueue = {
        id: scheduleOrderQueueId,
        queueIndex: 1, // Correct index for processing
        scheduleOrder: {
          productionOrders: [], // Empty array
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        mockPrismaService.scheduleOrderQueue.findUnique.mockResolvedValue(
          mockScheduleOrderQueue
        );
        return callback(mockPrismaService);
      });

      await expect(
        service.createProductionOrderRecipeInstanceFromScheduleQueue(
          scheduleOrderQueueId,
          createdBy
        )
      ).rejects.toThrow(
        `No production order found for schedule order queue ${scheduleOrderQueueId}`
      );
    });

    it("should throw error if no recipe found", async () => {
      const scheduleOrderQueueId = "test-queue-id";
      const createdBy = "test-user";

      const mockScheduleOrderQueue = {
        id: scheduleOrderQueueId,
        queueIndex: 1, // Correct index for processing
        scheduleOrder: {
          productionOrders: [
            {
              id: "production-order-id",
              recipe: null, // No recipe
            },
          ],
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        mockPrismaService.scheduleOrderQueue.findUnique.mockResolvedValue(
          mockScheduleOrderQueue
        );
        return callback(mockPrismaService);
      });

      await expect(
        service.createProductionOrderRecipeInstanceFromScheduleQueue(
          scheduleOrderQueueId,
          createdBy
        )
      ).rejects.toThrow(
        "No recipe found for production order production-order-id"
      );
    });

    it("should successfully create production order recipe instance with all related data", async () => {
      const scheduleOrderQueueId = "test-queue-id";
      const createdBy = "test-user";

      const mockScheduleOrderQueue = {
        id: scheduleOrderQueueId,
        queueIndex: 1, // Correct index for processing
        scheduleOrder: {
          productionOrders: [
            {
              id: "production-order-id",
              recipe: {
                id: "recipe-id",
                parameters: [
                  {
                    id: "param-1",
                    recipeParamName: "Temperature",
                    recipeParamDescription: "Mash temperature",
                    description: "Temperature for mashing",
                    className: "TemperatureParam",
                    active: true,
                    required: true,
                    recipeSetpointType: "NUMERICAL",
                    recipeNumericalSetpoint: 65.5,
                    recipeSetpointBooleanValue: null,
                    recipeSetpointLowerLimit: 60.0,
                    recipeSetpointUpperLimit: 70.0,
                    revision: 1,
                    schemaVersion: "1.0",
                    unitsId: "units-id",
                    operationId: "operation-id",
                  },
                ],
                recipeBoms: [
                  {
                    id: "bom-id",
                    revision: 1,
                    recipeBomITem: [
                      {
                        id: "bom-item-id",
                        quantity: 100,
                        operation: "ADD",
                        itemId: "item-id",
                        displayUnitsId: "display-units-id",
                      },
                    ],
                  },
                ],
                mashingProtocol: {
                  id: "protocol-id",
                  name: "Standard Mash",
                  isTemplate: true,
                  master: true,
                  running: false,
                  revision: 1,
                  templateCategory: "STANDARD",
                  templateDescription: "Standard mashing protocol",
                  steps: [
                    {
                      id: "step-id",
                      index: 0,
                      stepType: "MASH",
                      holdType: "TIME",
                      stepTime: 60,
                      temperatureSetpoint: 65.5,
                      temperatureActual: null,
                      heatEnabled: true,
                      heatTempSp: 65.5,
                      coolEnabled: false,
                      coolTempSp: null,
                      agitatorEnabled: true,
                      agitatorSpdSp: 50,
                      promptMessage: "Start mashing",
                    },
                  ],
                },
              },
            },
          ],
        },
      };

      const mockCreatedInstance = {
        id: "instance-id",
        productionOrder:
          mockScheduleOrderQueue.scheduleOrder.productionOrders[0],
        recipe: mockScheduleOrderQueue.scheduleOrder.productionOrders[0].recipe,
        recipeBom: [],
        mashingProtocol: [],
      };

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        mockPrismaService.scheduleOrderQueue.findUnique.mockResolvedValue(
          mockScheduleOrderQueue
        );
        mockPrismaService.productionOrderRecipeInstance.create.mockResolvedValue(
          { id: "instance-id" }
        );
        mockPrismaService.recipeParameter.create.mockResolvedValue({
          id: "param-instance-id",
        });
        mockPrismaService.recipeBom.create.mockResolvedValue({
          id: "bom-instance-id",
        });
        mockPrismaService.recipeBomItem.create.mockResolvedValue({
          id: "bom-item-instance-id",
        });
        mockPrismaService.mashingProtocol.create.mockResolvedValue({
          id: "protocol-instance-id",
        });
        mockPrismaService.mashingProtocolStep.create.mockResolvedValue({
          id: "step-instance-id",
        });
        mockPrismaService.productionOrderRecipeInstance.findUnique.mockResolvedValue(
          mockCreatedInstance
        );

        return callback(mockPrismaService);
      });

      const result =
        await service.createProductionOrderRecipeInstanceFromScheduleQueue(
          scheduleOrderQueueId,
          createdBy
        );

      expect(result).toEqual(mockCreatedInstance);
      expect(
        mockPrismaService.productionOrderRecipeInstance.create
      ).toHaveBeenCalledWith({
        data: {
          productionOrder: { connect: { id: "production-order-id" } },
          recipe: { connect: { id: "recipe-id" } },
          createdBy,
        },
      });
      expect(mockPrismaService.recipeParameter.create).toHaveBeenCalled();
      expect(mockPrismaService.recipeBom.create).toHaveBeenCalled();
      expect(mockPrismaService.recipeBomItem.create).toHaveBeenCalled();
      expect(mockPrismaService.mashingProtocol.create).toHaveBeenCalled();
      expect(mockPrismaService.mashingProtocolStep.create).toHaveBeenCalled();
    });
  });
});
