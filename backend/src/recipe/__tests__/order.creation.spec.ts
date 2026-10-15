import { Test, TestingModule } from "@nestjs/testing";
import { RecipeGenerator } from "../recipe.generation";
import { RabbitMQProducerService } from "../../rabbitmq/rabbitmq.producer.service";
import { EnzymeDosingService } from "../enzyme.dosing";
import {
  PrismaClient,
  ProductionOrder,
  ScheduleOrder,
  ScheduleOrderQueue,
  EnumProductionOrderStatus,
  EnumScheduleOrderStatus,
  EnumUnitProcedureName,
} from "@prisma/client";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { Logger } from "@nestjs/common";
import {
  mockPrismaClient,
  mockRabbitMQService,
  mockEnzymeDosingService,
  mockLogger,
  createTestingModule,
} from "./test.setup";

// Mock data
const mockProductionOrder = {
  id: "productionOrder1",
  orderNumber: "PO-001",
  totalFermenters: 2,
  status: EnumProductionOrderStatus.Initiated,
  quantity: 100,
};

const mockScheduleOrder = {
  id: "scheduleOrder1",
  orderNumber: "SO-001",
  productionOrderAllocation: 100,
  status: EnumScheduleOrderStatus.Scheduled,
};

const mockScheduleOrderQueue = {
  id: "scheduleOrderQueue1",
  nextUnitProcedureName: "Mashing01",
  queueIndex: 0,
};

describe("RecipeGenerator - Order Creation", () => {
  let module: TestingModule;
  let service: RecipeGenerator;
  let prismaClient: PrismaClient;
  let rabbitMQProducerService: RabbitMQProducerService;
  let enzymeDosingService: EnzymeDosingService;

  const testData = {
    customerCode: "TEST_CUSTOMER",
    mashBill: "70-20-0-10", // corn-rye-wheat-malt
    finalProof: 90,
    barrelInfo: "NEW_CHAR",
    customerName: "Test Customer",
    orderQty: 100,
    totalGrainWeight: 1000,
    bblsPerFerm: 5,
    username: "testuser",
    waterQty: 500,
    backsetQty: 100,
    bblItemNumbers: ["BARREL1"],
    yeastItemNumbersQtys: { YEAST1: 1 },
    mashingProtocol: [
      { action: "Add Liquid", liquidType01: "Water", qty: 500 },
      { action: "Add Grain", grainType: "Corn", qty: 700 },
      { action: "Hold", time: 2 },
      { action: "Add Grain", grainType: "Rye", qty: 200 },
      { action: "Hold", time: 2 },
      { action: "Add Grain", grainType: "Malt", qty: 100 },
      { action: "Add Additive", additiveType: "Viscoferm", qty: 0 },
    ],
    recipeParameters: [],
    binAssignments: {
      bin1: "Corn",
      bin2: "Rye",
      bin3: "Malt",
    },
    recipeId: "recipe1",
    itemId: "item1",
    bomId: "bom1",
    customerId: "cust1",
    recipeGroupId: "group1",
    unitProcedureId: "unit1",
  };

  beforeEach(async () => {
    // Create testing module
    module = await createTestingModule();

    // Get service instances
    service = module.get<RecipeGenerator>(RecipeGenerator);
    prismaClient = mockPrismaClient;
    rabbitMQProducerService = module.get<RabbitMQProducerService>(
      RabbitMQProducerService
    );
    enzymeDosingService = module.get<EnzymeDosingService>(EnzymeDosingService);

    // Reset all mocks before each test
    jest.clearAllMocks();

    // Set up mock implementations with proper type casting
    (mockPrismaClient.productionOrder.create as jest.Mock).mockResolvedValue(
      mockProductionOrder
    );
    (mockPrismaClient.scheduleOrder.create as jest.Mock).mockResolvedValue(
      mockScheduleOrder
    );
    (mockPrismaClient.scheduleOrderQueue.create as jest.Mock).mockResolvedValue(
      mockScheduleOrderQueue
    );
  });

  describe("Production Order Creation", () => {
    it("should create a production order with correct data", async () => {
      const result = await (service as any)["createProductionOrder"](
        prismaClient,
        testData.recipeId,
        testData.itemId,
        testData.bomId,
        testData.customerId,
        testData.customerCode,
        testData.orderQty,
        testData.bblsPerFerm,
        testData.username
      );

      expect(result).toEqual({
        id: "productionOrder1",
        orderNumber: "PO-001",
        totalFermenters: 2,
        status: EnumProductionOrderStatus.Initiated,
        quantity: 100,
      });

      expect(mockPrismaClient.productionOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          recipe: { connect: { id: testData.recipeId } },
          item: { connect: { id: testData.itemId } },
          bom: { connect: { id: testData.bomId } },
          customer: { connect: { id: testData.customerId } },
          status: EnumProductionOrderStatus.Initiated,
          customerCode: testData.customerCode,
          quantity: testData.orderQty,
          totalCooks: expect.any(Number),
          totalFermenters: expect.any(Number),
          createdBy: testData.username,
        }),
      });

      expect(mockRabbitMQService.emitMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          recordName: "ProductionOrder",
          event_type: "create",
          data: mockProductionOrder,
        })
      );
    });
  });

  describe("Schedule Order Creation", () => {
    it("should create a schedule order with correct data", async () => {
      // createScheduleOrder now calls recipe.findUnique to get recipe name
      (mockPrismaClient.recipe.findUnique as jest.Mock).mockResolvedValue({
        id: "recipe1",
        Recipe: "TEST-70-20-0-10-v01",
      });

      // Need to set BBLS_PER_FERM and FINAL_PROOF on the service instance
      (service as any).BBLS_PER_FERM = testData.bblsPerFerm;
      (service as any).FINAL_PROOF = testData.finalProof;

      const result = await (service as any)["createScheduleOrder"](
        prismaClient,
        testData.recipeId,
        testData.recipeGroupId,
        testData.orderQty,
        testData.username
      );

      expect(result).toEqual({
        id: "scheduleOrder1",
        orderNumber: "SO-001",
        productionOrderAllocation: 100,
        status: EnumScheduleOrderStatus.Scheduled,
      });

      expect(mockPrismaClient.scheduleOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: EnumScheduleOrderStatus.Scheduled,
          recipeName: "TEST-70-20-0-10-v01",
          recipeGroup: { connect: { id: testData.recipeGroupId } },
          createdBy: testData.username,
        }),
      });

      expect(mockRabbitMQService.emitMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          recordName: "ScheduleOrder",
          event_type: "create",
          data: mockScheduleOrder,
        })
      );
    });
  });

  describe("Schedule Order Queue Creation", () => {
    it("should create a schedule order queue entry", async () => {
      // Mock aggregate to return max queueIndex of 0
      (mockPrismaClient.scheduleOrderQueue.aggregate as jest.Mock).mockResolvedValue({
        _max: { queueIndex: 0 },
      });
      // Mock unitProcedure.findUnique
      (mockPrismaClient.unitProcedure.findUnique as jest.Mock).mockResolvedValue({
        id: testData.unitProcedureId,
        name: "Mashing01",
        operations: [],
      });
      // Mock asset.findMany
      (mockPrismaClient.asset.findMany as jest.Mock).mockResolvedValue([]);

      const result = await (service as any)["createScheduleOrderQueue"](
        prismaClient,
        "schedule1",
        testData.unitProcedureId,
        testData.username
      );

      expect(result).toEqual({
        id: "scheduleOrderQueue1",
        nextUnitProcedureName: "Mashing01",
        queueIndex: 0,
      });

      expect(mockPrismaClient.scheduleOrderQueue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          scheduleOrder: { connect: { id: "schedule1" } },
          queueIndex: 1,
          createdBy: testData.username,
        }),
      });
    });

    it("should handle first queue entry correctly", async () => {
      // Mock aggregate to return null (no entries yet)
      (mockPrismaClient.scheduleOrderQueue.aggregate as jest.Mock).mockResolvedValue({
        _max: { queueIndex: null },
      });
      // Mock unitProcedure.findUnique
      (mockPrismaClient.unitProcedure.findUnique as jest.Mock).mockResolvedValue({
        id: testData.unitProcedureId,
        name: "Mashing01",
        operations: [],
      });
      // Mock asset.findMany
      (mockPrismaClient.asset.findMany as jest.Mock).mockResolvedValue([]);

      const result = await (service as any)["createScheduleOrderQueue"](
        prismaClient,
        "schedule1",
        testData.unitProcedureId,
        testData.username
      );

      expect(result).toEqual({
        id: "scheduleOrderQueue1",
        nextUnitProcedureName: "Mashing01",
        queueIndex: 0,
      });

      expect(mockPrismaClient.scheduleOrderQueue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          queueIndex: 1,
        }),
      });
    });
  });
});
