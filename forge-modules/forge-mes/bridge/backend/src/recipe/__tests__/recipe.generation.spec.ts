import { Test, TestingModule } from "@nestjs/testing";
import { RecipeGenerator } from "../recipe.generation";
import { RabbitMQProducerService } from "../../rabbitmq/rabbitmq.producer.service";
import { EnzymeDosingService } from "../enzyme.dosing";
import { PrismaService } from "../../prisma/prisma.service";
import { Logger } from "@nestjs/common";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import {
  EnumRecipeWhiskeyType,
  EnumProductionOrderStatus,
  EnumScheduleOrderStatus,
  EnumUnitProcedureName,
} from "@prisma/client";
import { createTestingModule, mockPrismaClient, mockItem } from "./test.setup";

// Mock services
jest.mock("@prisma/client");
jest.mock("../../rabbitmq/rabbitmq.producer.service");
jest.mock("../enzyme.dosing");

describe("RecipeGenerator", () => {
  let module: TestingModule;
  let service: RecipeGenerator;
  let prismaClient: PrismaService;
  let rabbitMQProducerService: RabbitMQProducerService;
  let enzymeDosingService: EnzymeDosingService;

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  } as unknown as Logger;

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

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    module = await createTestingModule();
    service = module.get<RecipeGenerator>(RecipeGenerator);
    prismaClient = module.get<PrismaService>(PrismaService);
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
  });

  describe("createRecipeData", () => {
    it("should create a complete recipe with all associated data", async () => {
      // Mock finding an existing recipe
      (prismaClient.recipe.findFirst as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          id: "recipe1",
          Recipe: "TEST-70-20-0-10-v01",
          customerCode: "TEST_CUSTOMER",
          mashBill: "70-20-0-10",
        })
      );

      // Mock finding an existing BOM
      (prismaClient.bom.findFirst as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          id: "bom1",
          bomRevision: "BOM-TEST_CUSTOMER-70-20-0-10-v01",
        })
      );

      // Mock finding an existing recipe BOM
      (prismaClient.recipeBom.findFirst as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          id: "recipeBom1",
          revision: "01",
          master: true,
        })
      );

      const result = await service.createRecipeData(
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

      expect(result).toBeDefined();
      expect(result.recipe).toEqual(
        expect.objectContaining({
          id: "recipe1",
          Recipe: "TEST-70-20-0-10-v01",
          customerCode: "TEST_CUSTOMER",
          mashBill: "70-20-0-10",
        })
      );

      expect(result.recipeBom).toEqual(
        expect.objectContaining({
          id: "recipeBom1",
          revision: "01",
          master: true,
        })
      );

      expect(prismaClient.item.findFirst).toHaveBeenCalled();
      expect(prismaClient.customer.findFirst).toHaveBeenCalled();
      expect(prismaClient.recipe.findFirst).toHaveBeenCalled();
    });

    it("should handle existing recipe gracefully", async () => {
      // Mock finding an existing recipe
      (prismaClient.recipe.findFirst as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          id: "recipe1",
          Recipe: "TEST-70-20-0-10-v01",
          customerCode: "TEST_CUSTOMER",
          mashBill: "70-20-0-10",
        })
      );

      // Mock finding an existing BOM
      (prismaClient.bom.findFirst as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          id: "bom1",
          bomRevision: "BOM-TEST_CUSTOMER-70-20-0-10-v01",
        })
      );

      // Mock finding an existing recipe BOM
      (prismaClient.recipeBom.findFirst as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          id: "recipeBom1",
          revision: "01",
          master: true,
        })
      );

      const result = await service.createRecipeData(
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

      expect(result).toBeDefined();
      expect(result.recipe).toEqual(
        expect.objectContaining({
          id: "recipe1",
          Recipe: "TEST-70-20-0-10-v01",
          customerCode: "TEST_CUSTOMER",
          mashBill: "70-20-0-10",
        })
      );

      expect(result.recipeBom).toEqual(
        expect.objectContaining({
          id: "recipeBom1",
          revision: "01",
          master: true,
        })
      );

      expect(prismaClient.recipe.findFirst).toHaveBeenCalled();
      expect(prismaClient.recipe.create).not.toHaveBeenCalled();
    });
  });

  describe("validateMashingProtocolAgainstMashBill", () => {
    it("should validate correct mashing protocol", () => {
      const result = service["validateMashingProtocolAgainstMashBill"](
        testData.mashingProtocol,
        testData.mashBill
      );
      expect(result).toBeTruthy();
    });

    it("should reject protocol with missing grains", () => {
      const invalidProtocol = testData.mashingProtocol.filter(
        (step) => step.action !== "Add Grain"
      );
      const result = service["validateMashingProtocolAgainstMashBill"](
        invalidProtocol,
        testData.mashBill
      );
      expect(result).toBeFalsy();
    });
  });

  describe("detectWhiskeyType", () => {
    it("should correctly identify Rye Bourbon", () => {
      const result = service["detectWhiskeyType"]("51-39-0-10");
      expect(result).toBe(EnumRecipeWhiskeyType.RyeBourbon);
    });

    it("should correctly identify Wheated Bourbon", () => {
      const result = service["detectWhiskeyType"]("51-0-39-10");
      expect(result).toBe(EnumRecipeWhiskeyType.WheatedBourbon);
    });

    it("should correctly identify Rye Whiskey", () => {
      const result = service["detectWhiskeyType"]("0-51-39-10");
      expect(result).toBe(EnumRecipeWhiskeyType.RyeWhiskey);
    });
  });

  describe("validateBinAssignments", () => {
    it("should validate correct bin assignments", () => {
      const result = service["validateBinAssignments"](testData.binAssignments);
      expect(result).toBeTruthy();
    });

    it("should reject invalid bin assignments", () => {
      const invalidAssignments = {
        bin1: "InvalidGrain",
        bin2: "Rye",
        bin3: "Malt",
      };
      const result = service["validateBinAssignments"](invalidAssignments);
      expect(result).toBeFalsy();
    });
  });
});
