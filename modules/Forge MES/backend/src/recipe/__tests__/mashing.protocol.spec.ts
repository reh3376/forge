import { Test, TestingModule } from "@nestjs/testing";
import { RecipeGenerator } from "../recipe.generation";
import { RabbitMQProducerService } from "../../rabbitmq/rabbitmq.producer.service";
import { EnzymeDosingService } from "../enzyme.dosing";
import { PrismaClient, EnumMashingProtocolStepStepType } from "@prisma/client";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

// Mock services
jest.mock("@prisma/client");
jest.mock("../../rabbitmq/rabbitmq.producer.service");
jest.mock("../enzyme.dosing");

describe("RecipeGenerator - Mashing Protocol", () => {
  let service: RecipeGenerator;
  let prismaClient: jest.Mocked<PrismaClient>;
  let enzymeDosingService: jest.Mocked<EnzymeDosingService>;

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  } as unknown as Logger;

  const testData = {
    mashBill: "51-39-0-10", // corn-rye-wheat-malt
    totalGrainWeight: 10000,
    binAssignments: {
      bin1: "Corn",
      bin2: "Rye",
      bin3: "Malt",
    },
    mashingProtocol: [
      { action: "Add Liquid", liquidType01: "Water", qty: 5000 },
      { action: "Add Grain", grainType: "Corn", qty: 5100 },
      { action: "Hold", time: 2 },
      { action: "Add Grain", grainType: "Rye", qty: 3900 },
      { action: "Hold", time: 2 },
      { action: "Add Grain", grainType: "Malt", qty: 1000 },
      { action: "Add Additive", additiveType: "Viscoferm", qty: 0 },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecipeGenerator,
        {
          provide: RabbitMQProducerService,
          useValue: {
            emitMessage: jest.fn(),
          },
        },
        {
          provide: EnzymeDosingService,
          useValue: {
            calculateNormalizedEnzymeDosing: jest.fn().mockResolvedValue({
              ratio: 0.001,
              instructions: "Add enzyme during mashing",
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: WINSTON_MODULE_NEST_PROVIDER,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<RecipeGenerator>(RecipeGenerator);
    prismaClient = new PrismaClient() as jest.Mocked<PrismaClient>;
    enzymeDosingService = module.get(EnzymeDosingService);
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

    it("should reject protocol with incorrect grain sequence", () => {
      const invalidProtocol = [
        { action: "Add Grain", grainType: "Corn", qty: 5100 },
        { action: "Add Liquid", liquidType01: "Water", qty: 5000 },
        { action: "Hold", time: 2 },
      ];
      const result = service["validateMashingProtocolAgainstMashBill"](
        invalidProtocol,
        testData.mashBill
      );
      expect(result).toBeFalsy();
    });

    it("should handle multiple enzyme dosing calculations", () => {
      enzymeDosingService.calculateNormalizedEnzymeDosing
        .mockResolvedValueOnce({
          ratio: 0.001,
          instructions: "Add first enzyme",
        })
        .mockResolvedValueOnce({
          ratio: 0.002,
          instructions: "Add second enzyme",
        });

      // Test implementation here...
    });
  });

  describe("splitGrainAdditions", () => {
    it("should correctly split grain additions based on bin capacity", () => {
      const grainQuantities = {
        Corn: 6500,
        Rye: 3900,
        Malt: 1000,
      };

      const result = service["splitGrainAdditions"](
        "Corn",
        6500,
        testData.binAssignments,
        grainQuantities
      );

      expect(result).toHaveLength(1); // Single grain addition step
      expect(result[0].qty).toBe(6500);
      expect(result[0].action).toBe("Add Grain");
      expect(result[0].grainType).toBe("Corn");
    });

    it("should handle PreMalt correctly", () => {
      const grainQuantities = {
        Malt: 1000,
      };

      const result = service["splitGrainAdditions"](
        "PreMalt",
        100,
        testData.binAssignments,
        grainQuantities,
        true
      );

      expect(result).toHaveLength(1);
      expect(result[0].qty).toBe(100);
      expect(result[0].grainType).toBe("Malt");
    });
  });

  describe("setEnzymeDosing", () => {
    it("should correctly set enzyme dosing", async () => {
      enzymeDosingService.calculateNormalizedEnzymeDosing = jest
        .fn()
        .mockResolvedValue({
          ratio: 0.001,
          instructions: "Add enzyme during mashing",
        });

      const result = await service["setEnzymeDosing"](testData.mashingProtocol);

      const additiveStep = result.find(
        (step) => step.action === "Add Additive"
      );
      expect(additiveStep).toBeDefined();
      expect(additiveStep.qty).toBe(0.001);
    });

    it("should handle multiple enzyme types", async () => {
      const protocolWithMultipleEnzymes = [
        ...testData.mashingProtocol,
        { action: "Add Additive", additiveType: "Liquozyme", qty: 0 },
      ];

      enzymeDosingService.calculateNormalizedEnzymeDosing = jest
        .fn()
        .mockResolvedValueOnce({
          ratio: 0.001,
          instructions: "Add Viscoferm during mashing",
        })
        .mockResolvedValueOnce({
          ratio: 0.002,
          instructions: "Add Liquozyme during mashing",
        });

      const result = await service["setEnzymeDosing"](
        protocolWithMultipleEnzymes
      );

      const viscofermStep = result.find(
        (step) => step.additiveType === "Viscoferm"
      );
      const liquozymeStep = result.find(
        (step) => step.additiveType === "Liquozyme"
      );

      expect(viscofermStep.qty).toBe(0.001);
      expect(liquozymeStep.qty).toBe(0.002);
    });
  });

  describe("mapActionToStepType", () => {
    it("should correctly map actions to step types", () => {
      expect(service["mapActionToStepType"]("Hold")).toBe(
        EnumMashingProtocolStepStepType.Hold
      );
      expect(service["mapActionToStepType"]("Add Liquid")).toBe(
        EnumMashingProtocolStepStepType.LiquidAdd
      );
      expect(service["mapActionToStepType"]("Add Grain")).toBe(
        EnumMashingProtocolStepStepType.Hold
      );
      expect(service["mapActionToStepType"]("Add Additive")).toBe(
        EnumMashingProtocolStepStepType.AdditiveAdd
      );
      expect(service["mapActionToStepType"]("Prompt")).toBe(
        EnumMashingProtocolStepStepType.Prompt
      );
    });
  });
});
