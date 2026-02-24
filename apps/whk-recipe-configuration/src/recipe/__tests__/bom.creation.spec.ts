import { Test, TestingModule } from "@nestjs/testing";
import { RecipeGenerator } from "../recipe.generation";
import { RabbitMQProducerService } from "../../rabbitmq/rabbitmq.producer.service";
import { EnzymeDosingService } from "../enzyme.dosing";
import { PrismaClient } from "@prisma/client";
import { Logger } from "@nestjs/common";
import {
  createTestingModule,
  mockPrismaClient,
  mockRabbitMQService,
  mockEnzymeDosingService,
  mockItem,
} from "./test.setup";

// Define EnumRecipeBomItemOperation locally since we can't import it
enum EnumRecipeBomItemOperation {
  ADDITIVE = "ADDITIVE",
  NON_ADDITIVE = "NON_ADDITIVE",
}

describe("RecipeGenerator - BOM Creation", () => {
  let service: RecipeGenerator;
  let prismaClient: PrismaClient;
  let rabbitMQProducerService: RabbitMQProducerService;
  let enzymeDosingService: EnzymeDosingService;

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    const module = await createTestingModule();
    service = module.get<RecipeGenerator>(RecipeGenerator);
    prismaClient = mockPrismaClient;
    rabbitMQProducerService = module.get<RabbitMQProducerService>(
      RabbitMQProducerService
    );
    enzymeDosingService = module.get<EnzymeDosingService>(EnzymeDosingService);

    // Set up mock implementations
    (prismaClient.item.findFirst as jest.Mock).mockImplementation(
      (params: any) => {
        if (params?.where?.itemNumber?.equals) {
          return Promise.resolve({
            ...mockItem,
            itemNumber: params.where.itemNumber.equals,
          });
        }
        return Promise.resolve(mockItem);
      }
    );

    (prismaClient.customer.findFirst as jest.Mock).mockResolvedValue({
      id: "customer1",
      name: "Test Customer",
      customerCode: "TEST_CUSTOMER",
    });

    (prismaClient.recipe.findFirst as jest.Mock).mockResolvedValue(null);
    (prismaClient.bom.findFirst as jest.Mock).mockResolvedValue({
      id: "bom1",
      bomRevision: "BOM-TEST_CUSTOMER-70-20-0-10-v01",
    });

    // Default: no existing recipeBom, so BOM creation path is triggered
    (prismaClient.recipeBom.findFirst as jest.Mock).mockResolvedValue(null);

    (prismaClient.recipeBom.create as jest.Mock).mockResolvedValue({
      id: "recipeBom1",
      revision: "01",
      master: true,
    });

    // Set up mock implementations
    enzymeDosingService.calculateEnzymeDosing = jest.fn().mockReturnValue({
      dose: 10,
      instructions: "Add enzyme during mashing",
    });

    // Mock calculateNormalizedEnzymeDosing for setEnzymeDosing
    enzymeDosingService.calculateNormalizedEnzymeDosing = jest.fn().mockResolvedValue({
      ratio: 0.0005,
      instructions: "Add during saccharification",
    });
  });

  describe("createRecipeData", () => {
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
    };

    it("should create recipe data with barrel items", async () => {
      // Mock item.findFirst to return a barrel item
      jest.spyOn(prismaClient.item, "findFirst").mockResolvedValueOnce({
        id: "barrel1",
        code: "NEW_CHAR_BARREL",
        name: "New Char Barrel",
        type: "BARREL",
      } as any);

      // Mock recipeBom.create
      jest.spyOn(prismaClient.recipeBom, "create").mockResolvedValueOnce({
        id: "recipeBom1",
      } as any);

      // Mock recipeBomItem.createMany
      jest
        .spyOn(prismaClient.recipeBomItem, "createMany")
        .mockResolvedValueOnce({
          count: 1,
        } as any);

      await service.createRecipeData(
        testData.customerCode,
        testData.mashBill,
        testData.finalProof,
        testData.barrelInfo,
        testData.customerName,
        testData.orderQty,
        testData.totalGrainWeight,
        testData.bblsPerFerm,
        testData.username,
        testData.waterQty,
        testData.backsetQty,
        testData.bblItemNumbers,
        testData.yeastItemNumbersQtys,
        testData.mashingProtocol,
        testData.recipeParameters,
        testData.binAssignments
      );

      expect(prismaClient.recipeBom.create).toHaveBeenCalled();
      expect(prismaClient.recipeBomItem.createMany).toHaveBeenCalled();
      expect(rabbitMQProducerService.emitMessage).toHaveBeenCalled();
    });

    it("should create recipe data with yeast items", async () => {
      // Mock item.findFirst to return a yeast item
      jest.spyOn(prismaClient.item, "findFirst").mockResolvedValueOnce({
        id: "yeast1",
        code: "DISTILLERS_YEAST",
        name: "Distillers Yeast",
        type: "YEAST",
      } as any);

      // Mock recipeBom.create
      jest.spyOn(prismaClient.recipeBom, "create").mockResolvedValueOnce({
        id: "recipeBom1",
      } as any);

      // Mock recipeBomItem.createMany
      jest
        .spyOn(prismaClient.recipeBomItem, "createMany")
        .mockResolvedValueOnce({
          count: 1,
        } as any);

      await service.createRecipeData(
        testData.customerCode,
        testData.mashBill,
        testData.finalProof,
        testData.barrelInfo,
        testData.customerName,
        testData.orderQty,
        testData.totalGrainWeight,
        testData.bblsPerFerm,
        testData.username,
        testData.waterQty,
        testData.backsetQty,
        testData.bblItemNumbers,
        testData.yeastItemNumbersQtys,
        testData.mashingProtocol,
        testData.recipeParameters,
        testData.binAssignments
      );

      expect(prismaClient.recipeBom.create).toHaveBeenCalled();
      expect(prismaClient.recipeBomItem.createMany).toHaveBeenCalled();
      expect(rabbitMQProducerService.emitMessage).toHaveBeenCalled();
    });

    it("should handle missing items gracefully", async () => {
      // Mock item.findFirst to return null - the main item lookup will fail
      (prismaClient.item.findFirst as jest.Mock).mockResolvedValue(null);

      // When the main item is not found, createRecipeData throws an error
      await expect(
        service.createRecipeData(
          testData.customerCode,
          testData.mashBill,
          testData.finalProof,
          testData.barrelInfo,
          testData.customerName,
          testData.orderQty,
          testData.totalGrainWeight,
          testData.bblsPerFerm,
          testData.username,
          testData.waterQty,
          testData.backsetQty,
          testData.bblItemNumbers,
          testData.yeastItemNumbersQtys,
          testData.mashingProtocol,
          testData.recipeParameters,
          testData.binAssignments
        )
      ).rejects.toThrow("not found");
    });

    it("should use existing recipe BOM when one already exists", async () => {
      // Mock recipeBom.findFirst to return an existing BOM (override the null default)
      (prismaClient.recipeBom.findFirst as jest.Mock).mockResolvedValue({
        id: "recipeBom1",
      } as any);

      // Mock recipeBomItem.findMany to return existing items
      (prismaClient.recipeBomItem.findMany as jest.Mock).mockResolvedValue([
        {
          id: "recipeBomItem1",
          itemId: "item1",
          quantity: 1,
          operation: "ADDITIVE",
          item: mockItem,
        } as any,
      ]);

      await service.createRecipeData(
        testData.customerCode,
        testData.mashBill,
        testData.finalProof,
        testData.barrelInfo,
        testData.customerName,
        testData.orderQty,
        testData.totalGrainWeight,
        testData.bblsPerFerm,
        testData.username,
        testData.waterQty,
        testData.backsetQty,
        testData.bblItemNumbers,
        testData.yeastItemNumbersQtys,
        testData.mashingProtocol,
        testData.recipeParameters,
        testData.binAssignments
      );

      // When recipeBom already exists, create should NOT be called
      expect(prismaClient.recipeBom.create).not.toHaveBeenCalled();
      // RabbitMQ message should still be emitted for the recipe
      expect(rabbitMQProducerService.emitMessage).toHaveBeenCalled();
    });

    it("should create new recipe BOM if none exists", async () => {
      // Mock recipeBom.findFirst to return null
      (prismaClient.recipeBom.findFirst as jest.Mock).mockResolvedValueOnce(
        null
      );

      // Mock item.findFirst to return an item
      (prismaClient.item.findFirst as jest.Mock).mockResolvedValueOnce({
        id: "item1",
        code: "TEST_ITEM",
        name: "Test Item",
        type: "OTHER",
        itemNumber: "TEST_ITEM_NUMBER",
        active: true,
        baseBomItem: false,
        createdAt: new Date(),
        createdBy: "system",
        erpId: "ERP001",
        itemRevision: 1,
        schemaVersion: "1.0",
      });

      // Mock recipeBom.create
      (prismaClient.recipeBom.create as jest.Mock).mockResolvedValueOnce({
        id: "recipeBom1",
        revision: "01",
        master: true,
      });

      // Mock recipeBomItem.createMany
      (
        prismaClient.recipeBomItem.createMany as jest.Mock
      ).mockResolvedValueOnce({
        count: 1,
      });

      await service.createRecipeData(
        testData.customerCode,
        testData.mashBill,
        testData.finalProof,
        testData.barrelInfo,
        testData.customerName,
        testData.orderQty,
        testData.totalGrainWeight,
        testData.bblsPerFerm,
        testData.username,
        testData.waterQty,
        testData.backsetQty,
        testData.bblItemNumbers,
        testData.yeastItemNumbersQtys,
        testData.mashingProtocol,
        testData.recipeParameters,
        testData.binAssignments
      );

      expect(prismaClient.recipeBom.create).toHaveBeenCalled();
      expect(prismaClient.recipeBomItem.createMany).toHaveBeenCalled();
      expect(rabbitMQProducerService.emitMessage).toHaveBeenCalled();
    });
  });
});
