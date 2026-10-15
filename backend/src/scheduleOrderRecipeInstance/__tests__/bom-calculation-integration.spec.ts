import { Test, TestingModule } from "@nestjs/testing";
import { ScheduleOrderRecipeInstanceService } from "../scheduleOrderRecipeInstance.service";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { BomCalculationService } from "../../recipeBom/bom-calculation.service";
import { ProductionEventService } from "../../productionEvent/productionEvent.service";
import { BatchDeviationService } from "../../batchDeviation/batchDeviation.service";
import { ClsService } from "nestjs-cls";

describe("ScheduleOrderRecipeInstance - BOM Calculation Integration", () => {
  let service: ScheduleOrderRecipeInstanceService;
  let prismaService: jest.Mocked<PrismaService>;
  let bomCalculationService: jest.Mocked<BomCalculationService>;
  let auditService: jest.Mocked<AuditService>;

  const mockPrisma: any = {
    $transaction: jest.fn((callback: any) => callback(mockPrisma)),
    scheduleOrder: {
      findUnique: jest.fn(),
    },
    scheduleOrderRecipeInstance: {
      create: jest.fn(),
      findUnique: jest.fn(),
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
    recipeBomActual: {
      createMany: jest.fn(),
    },
  };

  const mockBomCalculationService = {
    calculateInitialBomQuantities: jest.fn(),
  };

  const mockAuditService = {
    logAction: jest.fn(),
  };

  const mockClsService = {
    get: jest.fn(),
    set: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleOrderRecipeInstanceService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: BomCalculationService,
          useValue: mockBomCalculationService,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: ClsService,
          useValue: mockClsService,
        },
        {
          provide: ProductionEventService,
          useValue: { findMany: jest.fn() },
        },
        {
          provide: BatchDeviationService,
          useValue: { findMany: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ScheduleOrderRecipeInstanceService>(
      ScheduleOrderRecipeInstanceService
    );
    prismaService = module.get(PrismaService);
    bomCalculationService = module.get(BomCalculationService);
    auditService = module.get(AuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("createFromScheduleOrder - BOM Calculation", () => {
    const scheduleOrderId = "test-so-id";
    const createdBy = "test-user";

    const mockScheduleOrder = {
      id: scheduleOrderId,
      totalGrainWeight: 3000,
      totalWaterVolume: 241,
      scheduleOrderRecipeInstance: null,
      scheduleOrderRecipe: {
        id: "recipe-id",
        customerCode: "70-21-00-09",
        recipeBoms: [
          {
            id: "master-bom-id",
            revision: "1",
            recipeBomITem: [
              {
                id: "master-corn-item",
                quantity: 700,
                operation: "Add",
                itemId: "corn-item-id",
                displayUnitsId: "lbs-unit",
                item: { id: "corn-item-id", itemName: "Corn" },
                displayUnits: { id: "lbs-unit", name: "LBS" },
              },
            ],
          },
        ],
        mashingProtocol: null,
        parameters: [],
      },
      productionOrders: [],
    };

    const mockCreatedInstance = {
      id: "new-instance-id",
      scheduleOrderId,
      recipeId: "recipe-id",
      status: "Created",
      currentPhase: "Mashing",
    };

    beforeEach(() => {
      mockPrisma.scheduleOrder.findUnique.mockResolvedValue(mockScheduleOrder);
      mockPrisma.scheduleOrderRecipeInstance.create.mockResolvedValue(
        mockCreatedInstance
      );
      mockPrisma.scheduleOrderRecipeInstance.findUnique.mockResolvedValue({
        ...mockCreatedInstance,
        scheduleOrder: mockScheduleOrder,
        recipe: mockScheduleOrder.scheduleOrderRecipe,
      });
      mockPrisma.recipeBom.create.mockResolvedValue({
        id: "new-bom-id",
        revision: "1",
        master: false,
        running: true,
      });
      mockPrisma.recipeBomItem.create.mockResolvedValue({
        id: "new-corn-item",
        quantity: 700,
      });
      mockBomCalculationService.calculateInitialBomQuantities.mockResolvedValue(
        undefined
      );
      mockAuditService.logAction.mockResolvedValue(undefined);
    });

    it("should call calculateInitialBomQuantities with grain/water loads", async () => {
      await service.createFromScheduleOrder(scheduleOrderId, createdBy);

      expect(
        mockBomCalculationService.calculateInitialBomQuantities
      ).toHaveBeenCalledWith("new-instance-id", {
        grainLoad: 3000,
        waterLoad: 241,
        mashBill: "70-21-00-09",
        recipeId: "recipe-id",
      });
    });

    it("should throw when totalGrainWeight is not set", async () => {
      const scheduleOrderWithoutGrain = {
        ...mockScheduleOrder,
        totalGrainWeight: null,
      };

      mockPrisma.scheduleOrder.findUnique.mockResolvedValue(
        scheduleOrderWithoutGrain
      );

      await expect(
        service.createFromScheduleOrder(scheduleOrderId, createdBy)
      ).rejects.toThrow("totalGrainWeight must be set and > 0");
    });

    it("should handle missing water load gracefully", async () => {
      const scheduleOrderWithoutWater = {
        ...mockScheduleOrder,
        totalWaterVolume: null,
      };

      mockPrisma.scheduleOrder.findUnique.mockResolvedValue(
        scheduleOrderWithoutWater
      );

      await service.createFromScheduleOrder(scheduleOrderId, createdBy);

      expect(
        mockBomCalculationService.calculateInitialBomQuantities
      ).toHaveBeenCalledWith(
        "new-instance-id",
        expect.objectContaining({
          waterLoad: undefined,
        })
      );
    });

    it("should continue even if BOM calculation fails", async () => {
      mockBomCalculationService.calculateInitialBomQuantities.mockRejectedValue(
        new Error("Calculation failed")
      );

      const result = await service.createFromScheduleOrder(
        scheduleOrderId,
        createdBy
      );

      // Result should include the base instance fields plus includes
      expect(result).toMatchObject({
        id: mockCreatedInstance.id,
        scheduleOrderId: mockCreatedInstance.scheduleOrderId,
        status: mockCreatedInstance.status,
      });
      // Should log error but not throw
      expect(
        mockBomCalculationService.calculateInitialBomQuantities
      ).toHaveBeenCalled();
    });

    it("should use customerCode as mashBill", async () => {
      await service.createFromScheduleOrder(scheduleOrderId, createdBy);

      expect(
        mockBomCalculationService.calculateInitialBomQuantities
      ).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          mashBill: "70-21-00-09",
        })
      );
    });

    it("should calculate BOM quantities after creating recipe instance", async () => {
      const createSpy = jest.spyOn(
        mockPrisma.scheduleOrderRecipeInstance,
        "create"
      );
      const calculateSpy = jest.spyOn(
        mockBomCalculationService,
        "calculateInitialBomQuantities"
      );

      await service.createFromScheduleOrder(scheduleOrderId, createdBy);

      // Verify order of operations: create instance first, then calculate
      const createOrder = createSpy.mock.invocationCallOrder[0];
      const calculateOrder = calculateSpy.mock.invocationCallOrder[0];

      expect(calculateOrder).toBeGreaterThan(createOrder);
    });
  });
});
