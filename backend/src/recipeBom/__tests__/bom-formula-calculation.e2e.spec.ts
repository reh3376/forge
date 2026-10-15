import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../prisma/prisma.module";
import { PrismaService } from "../../prisma/prisma.service";
import { ScheduleOrderRecipeInstanceService } from "../../scheduleOrderRecipeInstance/scheduleOrderRecipeInstance.service";
import { BomCalculationService, LoadInputs } from "../bom-calculation.service";
import { ExpressionEngineService } from "../../expressionEngine/expression-engine.service";
import { EnzymeDosingService } from "../../recipe/enzyme.dosing";
import { FormulaLibraryService } from "../../formulaLibrary/formula-library.service";
import { AuditService } from "../../audit/audit.service";
import { ProductionEventService } from "../../productionEvent/productionEvent.service";
import { BatchDeviationService } from "../../batchDeviation/batchDeviation.service";
import { ClsModule } from "nestjs-cls";
import {
  EnumBomCalculationMode,
  EnumBomFormulaType,
  EnumRecipeBomItemOperation,
  EnumRecipeWhiskeyType,
} from "@prisma/client";

/**
 * E2E Tests for BOM Formula Calculation
 *
 * These tests seed real data into the database, trigger the complete BOM calculation
 * flow through service calls, and verify results in the database.
 *
 * Test coverage:
 * - Formula configuration copied during ScheduleOrderRecipeInstance creation
 * - BOM calculations triggered with correct grain/water loads
 * - All calculation modes: STATIC, FORMULA_GRAIN, FORMULA_WATER
 * - RecipeBomActual records created with correct calculated quantities
 */
describe("BOM Formula Calculation (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let instanceService: ScheduleOrderRecipeInstanceService;
  let bomCalculationService: BomCalculationService;

  // Track created IDs for cleanup
  const createdIds = {
    recipeId: null as string | null,
    recipeBomId: null as string | null,
    recipeBomItemIds: [] as string[],
    recipeGroupId: null as string | null,
    scheduleOrderId: null as string | null,
    instanceId: null as string | null,
    itemIds: [] as string[],
  };

  // Test data references
  let staticItemId: string;
  let grainItemId: string;
  let waterItemId: string;
  let customerId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        ClsModule.forRoot({
          global: true,
          middleware: { mount: false },
        }),
      ],
      providers: [
        ScheduleOrderRecipeInstanceService,
        BomCalculationService,
        ExpressionEngineService,
        {
          provide: EnzymeDosingService,
          useValue: {
            calculateNormalizedDose: jest.fn().mockReturnValue(0),
            getEnzymeConfiguration: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: FormulaLibraryService,
          useValue: {
            getFormula: jest.fn().mockResolvedValue(null),
            evaluateFormula: jest
              .fn()
              .mockResolvedValue({ success: true, value: 0 }),
          },
        },
        {
          provide: AuditService,
          useValue: {
            createAuditLog: jest.fn().mockResolvedValue({}),
            logChange: jest.fn().mockResolvedValue({}),
            log: jest.fn(),
          },
        },
        {
          provide: ProductionEventService,
          useValue: {
            createEvent: jest.fn().mockResolvedValue({}),
            findMany: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: BatchDeviationService,
          useValue: {
            createDeviation: jest.fn().mockResolvedValue({}),
            findMany: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    instanceService = moduleFixture.get<ScheduleOrderRecipeInstanceService>(
      ScheduleOrderRecipeInstanceService
    );
    bomCalculationService = moduleFixture.get<BomCalculationService>(
      BomCalculationService
    );
    await app.init();

    // Seed test data
    await seedTestData();

    // Create the ScheduleOrderRecipeInstance (triggers formula copy)
    // Note: BOM calculation during createFromScheduleOrder may fail due to transaction timing
    const instance = await instanceService.createFromScheduleOrder(
      createdIds.scheduleOrderId!,
      "e2e-test"
    );
    createdIds.instanceId = instance.id;

    // Manually trigger BOM calculation now that the instance is committed
    const loads: LoadInputs = {
      grainLoad: 3000,
      waterLoad: 241,
      mashBill: "70-21-00-09",
    };
    await bomCalculationService.calculateInitialBomQuantities(
      createdIds.instanceId!,
      loads
    );
  }, 120000); // 120 second timeout for setup

  afterAll(async () => {
    if (prisma) {
      await cleanupTestData();
    }
    if (app) {
      await app.close();
    }
  }, 30000);

  async function seedTestData() {
    // 1. Find existing customer (avoid creating test customers with real names)
    const customer = await prisma.customer.findFirst();
    if (!customer) {
      throw new Error(
        "No customer found for testing - please seed the database first"
      );
    }
    customerId = customer.id;

    // 2. Create test items with E2E prefix
    const staticItem = await prisma.item.create({
      data: {
        itemNumber: `E2E-STATIC-${Date.now()}`,
        itemName: "E2E Test Static Item",
        itemType: "ENZYME",
        erpId: `E2E-ERP-STATIC-${Date.now()}`,
        createdBy: "e2e-test",
      },
    });
    staticItemId = staticItem.id;
    createdIds.itemIds.push(staticItem.id);

    const grainItem = await prisma.item.create({
      data: {
        itemNumber: `E2E-GRAIN-${Date.now()}`,
        itemName: "E2E Test Grain Item",
        itemType: "GRAIN",
        erpId: `E2E-ERP-GRAIN-${Date.now()}`,
        createdBy: "e2e-test",
      },
    });
    grainItemId = grainItem.id;
    createdIds.itemIds.push(grainItem.id);

    const waterItem = await prisma.item.create({
      data: {
        itemNumber: `E2E-WATER-${Date.now()}`,
        itemName: "E2E Test Water Item",
        itemType: "WATER",
        erpId: `E2E-ERP-WATER-${Date.now()}`,
        createdBy: "e2e-test",
      },
    });
    waterItemId = waterItem.id;
    createdIds.itemIds.push(waterItem.id);

    // 3. Create test recipe (use generic test mash bill, not real customer codes)
    const recipeName = `E2E-TEST-FORMULA-${Date.now()}`;
    const recipe = await prisma.recipe.create({
      data: {
        Recipe: recipeName,
        whiskeyType: EnumRecipeWhiskeyType.RyeBourbon,
        active: true,
        customer: { connect: { id: customerId } },
        customerCode: "70-21-00-09", // Test mash bill format
        createdBy: "e2e-test",
      },
    });
    createdIds.recipeId = recipe.id;

    // 4. Create RecipeBom
    const bom = await prisma.recipeBom.create({
      data: {
        recipe: { connect: { id: recipe.id } },
        revision: "1",
        master: true,
        running: true,
      },
    });
    createdIds.recipeBomId = bom.id;

    // 5. Create BOM items with different calculation modes
    const staticBomItem = await prisma.recipeBomItem.create({
      data: {
        recipeBoms: { connect: { id: bom.id } },
        item: { connect: { id: staticItemId } },
        quantity: 100,
        operation: EnumRecipeBomItemOperation.Mashing01,
        calculationMode: EnumBomCalculationMode.STATIC,
        createdBy: "e2e-test",
      },
    });
    createdIds.recipeBomItemIds.push(staticBomItem.id);

    const grainBomItem = await prisma.recipeBomItem.create({
      data: {
        recipeBoms: { connect: { id: bom.id } },
        item: { connect: { id: grainItemId } },
        quantity: 0,
        operation: EnumRecipeBomItemOperation.Mashing01,
        calculationMode: EnumBomCalculationMode.FORMULA_GRAIN,
        formulaType: EnumBomFormulaType.SIMPLE_RATIO,
        formulaMultiplier: 0.7, // 70% of grain load
        createdBy: "e2e-test",
      },
    });
    createdIds.recipeBomItemIds.push(grainBomItem.id);

    const waterBomItem = await prisma.recipeBomItem.create({
      data: {
        recipeBoms: { connect: { id: bom.id } },
        item: { connect: { id: waterItemId } },
        quantity: 0,
        operation: EnumRecipeBomItemOperation.Mashing01,
        calculationMode: EnumBomCalculationMode.FORMULA_WATER,
        formulaType: EnumBomFormulaType.SIMPLE_RATIO,
        formulaMultiplier: 0.25, // 25% of water load
        createdBy: "e2e-test",
      },
    });
    createdIds.recipeBomItemIds.push(waterBomItem.id);

    // 6. Create RecipeGroup (required for ScheduleOrder)
    const recipeGroup = await prisma.recipeGroup.create({
      data: {
        recipe: recipeName,
        createdBy: "e2e-test",
        recipes: { connect: { id: recipe.id } },
      },
    });
    createdIds.recipeGroupId = recipeGroup.id;

    // 7. Create ScheduleOrder
    const scheduleOrder = await prisma.scheduleOrder.create({
      data: {
        name: `E2E-TEST-ORDER-${Date.now()}`,
        recipeName: recipeName,
        recipeGroup: { connect: { id: recipeGroup.id } },
        scheduleOrderRecipe: { connect: { id: recipe.id } },
        totalGrainWeight: 3000, // 3000 lbs grain load
        totalWaterVolume: 241, // 241 gallons water load
        productionOrderAllocation: {},
      },
    });
    createdIds.scheduleOrderId = scheduleOrder.id;
  }

  async function cleanupTestData() {
    try {
      // Delete in reverse dependency order

      // 1. Delete RecipeBomActuals
      if (createdIds.instanceId) {
        await prisma.recipeBomActual.deleteMany({
          where: { scheduleOrderRecipeInstanceId: createdIds.instanceId },
        });
      }

      // 2. Delete RecipeParameters linked to instance
      if (createdIds.instanceId) {
        await prisma.recipeParameter.deleteMany({
          where: { scheduleOrderRecipeInstanceId: createdIds.instanceId },
        });
      }

      // 3. Delete MashingProtocolSteps and MashingProtocols linked to instance
      if (createdIds.instanceId) {
        const protocols = await prisma.mashingProtocol.findMany({
          where: { scheduleOrderRecipeInstanceId: createdIds.instanceId },
          select: { id: true },
        });
        for (const protocol of protocols) {
          await prisma.mashingProtocolStep.deleteMany({
            where: { mashingProtocolId: protocol.id },
          });
        }
        await prisma.mashingProtocol.deleteMany({
          where: { scheduleOrderRecipeInstanceId: createdIds.instanceId },
        });
      }

      // 4. Delete SO-level RecipeBomItems and RecipeBoms
      if (createdIds.instanceId) {
        const soBoms = await prisma.recipeBom.findMany({
          where: { scheduleOrderRecipeInstanceId: createdIds.instanceId },
          select: { id: true },
        });
        for (const soBom of soBoms) {
          await prisma.recipeBomItem.deleteMany({
            where: { recipeBomsId: soBom.id },
          });
        }
        await prisma.recipeBom.deleteMany({
          where: { scheduleOrderRecipeInstanceId: createdIds.instanceId },
        });
      }

      // 5. Delete ScheduleOrderRecipeInstance
      if (createdIds.instanceId) {
        await prisma.scheduleOrderRecipeInstance
          .delete({
            where: { id: createdIds.instanceId },
          })
          .catch(() => {}); // Ignore if not exists
      }

      // 6. Delete ScheduleOrder
      if (createdIds.scheduleOrderId) {
        await prisma.scheduleOrder
          .delete({
            where: { id: createdIds.scheduleOrderId },
          })
          .catch(() => {});
      }

      // 7. Delete master RecipeBomItems
      for (const id of createdIds.recipeBomItemIds) {
        await prisma.recipeBomItem.delete({ where: { id } }).catch(() => {});
      }

      // 8. Delete master RecipeBom
      if (createdIds.recipeBomId) {
        await prisma.recipeBom
          .delete({
            where: { id: createdIds.recipeBomId },
          })
          .catch(() => {});
      }

      // 9. Delete RecipeGroup
      if (createdIds.recipeGroupId) {
        await prisma.recipeGroup
          .delete({
            where: { id: createdIds.recipeGroupId },
          })
          .catch(() => {});
      }

      // 10. Delete Recipe
      if (createdIds.recipeId) {
        await prisma.recipe
          .delete({
            where: { id: createdIds.recipeId },
          })
          .catch(() => {});
      }

      // 11. Delete test items (by E2E prefix)
      await prisma.item.deleteMany({
        where: { itemNumber: { startsWith: "E2E-" } },
      });

      // 12. Delete any formula execution logs created during test
      // FormulaExecutionLog may have been created - clean up by timestamp
      const testStartTime = new Date(Date.now() - 300000); // 5 minutes ago
      await prisma.formulaExecutionLog
        .deleteMany({
          where: { executedAt: { gte: testStartTime } },
        })
        .catch(() => {});
    } catch (error) {
      console.warn("Cleanup warning:", error);
    }
  }

  describe("ScheduleOrderRecipeInstance creation", () => {
    it("should have created instance during setup", async () => {
      // Instance was created in beforeAll
      expect(createdIds.instanceId).toBeDefined();

      // Verify instance exists in database
      const instance = await prisma.scheduleOrderRecipeInstance.findUnique({
        where: { id: createdIds.instanceId! },
      });
      expect(instance).toBeDefined();
      expect(instance?.scheduleOrderId).toBe(createdIds.scheduleOrderId);
    });

    it("should copy formula configuration to SO-level BOM items", async () => {
      // Verify: SO-level RecipeBom and items created with formula config
      const soBoms = await prisma.recipeBom.findMany({
        where: { scheduleOrderRecipeInstanceId: createdIds.instanceId! },
        include: {
          recipeBomITem: true,
        },
      });

      expect(soBoms.length).toBeGreaterThan(0);

      // Find BOM items with formula config
      const allBomItems = soBoms.flatMap((bom) => bom.recipeBomITem);
      expect(allBomItems.length).toBe(3); // STATIC, FORMULA_GRAIN, FORMULA_WATER

      const grainItem = allBomItems.find(
        (item) => item.calculationMode === EnumBomCalculationMode.FORMULA_GRAIN
      );
      expect(grainItem).toBeDefined();
      expect(grainItem?.formulaType).toBe(EnumBomFormulaType.SIMPLE_RATIO);
      expect(grainItem?.formulaMultiplier).toBe(0.7);

      const waterItem = allBomItems.find(
        (item) => item.calculationMode === EnumBomCalculationMode.FORMULA_WATER
      );
      expect(waterItem).toBeDefined();
      expect(waterItem?.formulaType).toBe(EnumBomFormulaType.SIMPLE_RATIO);
      expect(waterItem?.formulaMultiplier).toBe(0.25);
    });
  });

  describe("BOM quantity calculation", () => {
    it("should calculate STATIC mode - fixed quantity", async () => {
      const actuals = await prisma.recipeBomActual.findMany({
        where: {
          scheduleOrderRecipeInstanceId: createdIds.instanceId!,
        },
        include: {
          recipeBomItem: {
            include: { item: true },
          },
        },
      });

      // Find the STATIC mode actual
      const staticActual = actuals.find(
        (a) => a.recipeBomItem.calculationMode === EnumBomCalculationMode.STATIC
      );

      expect(staticActual).toBeDefined();
      expect(staticActual?.quantityPlanned).toBe(100);
    });

    it("should calculate FORMULA_GRAIN - grainLoad × multiplier", async () => {
      // grainLoad=3000, multiplier=0.70 → expected: 2100
      const actuals = await prisma.recipeBomActual.findMany({
        where: {
          scheduleOrderRecipeInstanceId: createdIds.instanceId!,
        },
        include: {
          recipeBomItem: {
            include: { item: true },
          },
        },
      });

      const grainActual = actuals.find(
        (a) =>
          a.recipeBomItem.calculationMode ===
          EnumBomCalculationMode.FORMULA_GRAIN
      );

      expect(grainActual).toBeDefined();
      expect(grainActual?.quantityPlanned).toBe(2100); // 3000 × 0.70 = 2100
      expect(grainActual?.grainLoadAtCalculation).toBe(3000);
    });

    it("should calculate FORMULA_WATER - waterLoad × multiplier", async () => {
      // waterLoad=241, multiplier=0.25 → expected: 60.25
      const actuals = await prisma.recipeBomActual.findMany({
        where: {
          scheduleOrderRecipeInstanceId: createdIds.instanceId!,
        },
        include: {
          recipeBomItem: {
            include: { item: true },
          },
        },
      });

      const waterActual = actuals.find(
        (a) =>
          a.recipeBomItem.calculationMode ===
          EnumBomCalculationMode.FORMULA_WATER
      );

      expect(waterActual).toBeDefined();
      expect(waterActual?.quantityPlanned).toBe(60.25); // 241 × 0.25 = 60.25
      expect(waterActual?.waterLoadAtCalculation).toBe(241);
    });

    it("should create RecipeBomActual records with audit data", async () => {
      const actuals = await prisma.recipeBomActual.findMany({
        where: {
          scheduleOrderRecipeInstanceId: createdIds.instanceId!,
        },
      });

      expect(actuals.length).toBe(3); // STATIC, FORMULA_GRAIN, FORMULA_WATER

      // Verify audit data present
      for (const actual of actuals) {
        expect(actual.createdBy).toBeDefined();
        expect(actual.createdAt).toBeDefined();
      }
    });
  });

  describe("Formula configuration traceability", () => {
    it("should record grain load at calculation time", async () => {
      const actuals = await prisma.recipeBomActual.findMany({
        where: {
          scheduleOrderRecipeInstanceId: createdIds.instanceId!,
        },
        include: {
          recipeBomItem: true,
        },
      });

      // Formula-based actuals should have load recorded
      const grainActual = actuals.find(
        (a) =>
          a.recipeBomItem.calculationMode ===
          EnumBomCalculationMode.FORMULA_GRAIN
      );
      expect(grainActual?.grainLoadAtCalculation).toBe(3000);
    });

    it("should record water load at calculation time", async () => {
      const actuals = await prisma.recipeBomActual.findMany({
        where: {
          scheduleOrderRecipeInstanceId: createdIds.instanceId!,
        },
        include: {
          recipeBomItem: true,
        },
      });

      const waterActual = actuals.find(
        (a) =>
          a.recipeBomItem.calculationMode ===
          EnumBomCalculationMode.FORMULA_WATER
      );
      expect(waterActual?.waterLoadAtCalculation).toBe(241);
    });
  });
});
