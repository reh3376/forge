import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../../prisma/prisma.service";
import { RecipeBomActualService } from "../recipeBomActual.service";
import { ScheduleOrderRecipeInstanceService } from "../../scheduleOrderRecipeInstance/scheduleOrderRecipeInstance.service";
import { AuditService } from "../../audit/audit.service";
import { LotLookupType } from "../dto/bom-consumption.dto";

describe("RecipeBomActualService", () => {
  let service: RecipeBomActualService;
  let prisma: any;
  let soRecipeInstanceService: any;

  const mockPrismaService = {
    inventory: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    recipeBomItem: {
      findUnique: jest.fn(),
    },
    scheduleOrderRecipeInstance: {
      findUnique: jest.fn(),
    },
    recipeBomActual: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockSORecipeInstanceService = {
    recordBomActual: jest.fn(),
  };

  const mockAuditService = {
    logChange: jest.fn().mockResolvedValue({ id: "audit-1" }),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecipeBomActualService,
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: ScheduleOrderRecipeInstanceService,
          useValue: mockSORecipeInstanceService,
        },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<RecipeBomActualService>(RecipeBomActualService);
    prisma = module.get<PrismaService>(PrismaService);
    soRecipeInstanceService = module.get<ScheduleOrderRecipeInstanceService>(
      ScheduleOrderRecipeInstanceService
    );
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // ─── lookupLotOrInventory ───────────────────────────────────────────

  describe("lookupLotOrInventory", () => {
    const mockInventory = {
      id: "clxyz1234567890abcdefghij",
      itemId: "item-1",
      assetId: "asset-1",
      lotNumber: "LOT-001",
      currentQuantity: 500,
      units: "lbs",
      fifoIndex: 0,
      item: { itemName: "Corn" },
      asset: { assetName: "Silo A" },
    };

    it("should find inventory by UUID (cuid) and return INVENTORY_ID", async () => {
      mockPrismaService.inventory.findUnique.mockResolvedValue(mockInventory);
      mockPrismaService.inventory.findFirst.mockResolvedValue({
        id: mockInventory.id,
      });

      const result = await service.lookupLotOrInventory(
        mockInventory.id,
        "item-1"
      );

      expect(result.type).toBe(LotLookupType.INVENTORY_ID);
      expect(result.inventoryId).toBe(mockInventory.id);
      expect(result.lotNumber).toBe("LOT-001");
      expect(result.itemName).toBe("Corn");
      expect(result.isRecommended).toBe(true);
    });

    it("should return NOT_FOUND when UUID matches but item mismatch", async () => {
      mockPrismaService.inventory.findUnique.mockResolvedValue({
        ...mockInventory,
        itemId: "different-item",
      });
      mockPrismaService.inventory.findMany.mockResolvedValue([]);

      const result = await service.lookupLotOrInventory(
        mockInventory.id,
        "item-1"
      );

      expect(result.type).toBe(LotLookupType.NOT_FOUND);
    });

    it("should find inventory by lot number and return SUPPLIER_LOT", async () => {
      mockPrismaService.inventory.findMany.mockResolvedValue([mockInventory]);
      mockPrismaService.inventory.findFirst.mockResolvedValue({
        id: mockInventory.id,
      });

      const result = await service.lookupLotOrInventory("LOT-001", "item-1");

      expect(result.type).toBe(LotLookupType.SUPPLIER_LOT);
      expect(result.lotNumber).toBe("LOT-001");
      expect(result.isRecommended).toBe(true);
    });

    it("should return NOT_FOUND when lot number has no matches", async () => {
      mockPrismaService.inventory.findMany.mockResolvedValue([]);

      const result = await service.lookupLotOrInventory(
        "UNKNOWN-LOT",
        "item-1"
      );

      expect(result.type).toBe(LotLookupType.NOT_FOUND);
      expect(result.isRecommended).toBe(false);
    });

    it("should detect non-FIFO inventory", async () => {
      mockPrismaService.inventory.findMany.mockResolvedValue([
        { ...mockInventory, fifoIndex: 2 },
      ]);
      // First inventory for same item+asset is different
      mockPrismaService.inventory.findFirst.mockResolvedValue({
        id: "older-inventory-id",
      });

      const result = await service.lookupLotOrInventory("LOT-001", "item-1");

      expect(result.type).toBe(LotLookupType.SUPPLIER_LOT);
      expect(result.isRecommended).toBe(false);
    });
  });

  // ─── recordBomConsumption ───────────────────────────────────────────

  describe("recordBomConsumption", () => {
    const input = {
      recipeBomItemId: "bom-item-1",
      scheduleOrderRecipeInstanceId: "instance-1",
      quantityActual: 100,
      lotNumber: "LOT-001",
      createdBy: "user-1",
    };

    const createdActual = {
      id: "actual-1",
      ...input,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("should record BOM consumption via delegate service", async () => {
      mockPrismaService.recipeBomItem.findUnique.mockResolvedValue({
        id: "bom-item-1",
      });
      mockPrismaService.scheduleOrderRecipeInstance.findUnique.mockResolvedValue(
        { id: "instance-1" }
      );
      mockSORecipeInstanceService.recordBomActual.mockResolvedValue(
        createdActual
      );

      const result = await service.recordBomConsumption(input);

      expect(result).toEqual(createdActual);
      expect(mockSORecipeInstanceService.recordBomActual).toHaveBeenCalledWith(
        "instance-1",
        {
          recipeBomItemId: "bom-item-1",
          quantityActual: 100,
          quantityPlanned: undefined,
          lotNumber: "LOT-001",
          inventoryId: undefined,
          consumedAt: undefined,
          createdBy: "user-1",
        }
      );
    });

    it("should update notes after creation when provided", async () => {
      mockPrismaService.recipeBomItem.findUnique.mockResolvedValue({
        id: "bom-item-1",
      });
      mockPrismaService.scheduleOrderRecipeInstance.findUnique.mockResolvedValue(
        { id: "instance-1" }
      );
      mockSORecipeInstanceService.recordBomActual.mockResolvedValue(
        createdActual
      );
      const withNotes = { ...createdActual, notes: "Test note" };
      mockPrismaService.recipeBomActual.update.mockResolvedValue(withNotes);

      const result = await service.recordBomConsumption({
        ...input,
        notes: "Test note",
      });

      expect(result.notes).toBe("Test note");
      expect(mockPrismaService.recipeBomActual.update).toHaveBeenCalledWith({
        where: { id: "actual-1" },
        data: { notes: "Test note" },
      });
    });

    it("should throw when recipeBomItem not found", async () => {
      mockPrismaService.recipeBomItem.findUnique.mockResolvedValue(null);

      await expect(service.recordBomConsumption(input)).rejects.toThrow(
        "RecipeBomItem bom-item-1 not found"
      );
    });

    it("should throw when scheduleOrderRecipeInstance not found", async () => {
      mockPrismaService.recipeBomItem.findUnique.mockResolvedValue({
        id: "bom-item-1",
      });
      mockPrismaService.scheduleOrderRecipeInstance.findUnique.mockResolvedValue(
        null
      );

      await expect(service.recordBomConsumption(input)).rejects.toThrow(
        "ScheduleOrderRecipeInstance instance-1 not found"
      );
    });
  });

  // ─── updateBomConsumption ───────────────────────────────────────────

  describe("updateBomConsumption", () => {
    const existingRecord = {
      id: "actual-1",
      recipeBomItemId: "bom-item-1",
      quantityActual: 100,
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("should update BOM consumption record", async () => {
      mockPrismaService.recipeBomActual.findUnique.mockResolvedValue(
        existingRecord
      );
      const updated = {
        ...existingRecord,
        quantityActual: 120,
        notes: "Adjusted",
      };
      mockPrismaService.recipeBomActual.update.mockResolvedValue(updated);

      const result = await service.updateBomConsumption("actual-1", {
        quantityActual: 120,
        notes: "Adjusted",
        updatedBy: "user-2",
      });

      expect(result.quantityActual).toBe(120);
      expect(mockPrismaService.recipeBomActual.update).toHaveBeenCalledWith({
        where: { id: "actual-1" },
        data: {
          quantityActual: 120,
          notes: "Adjusted",
          updatedBy: "user-2",
        },
      });
    });

    it("should throw when record not found", async () => {
      mockPrismaService.recipeBomActual.findUnique.mockResolvedValue(null);

      await expect(
        service.updateBomConsumption("nonexistent", {
          quantityActual: 120,
        })
      ).rejects.toThrow("RecipeBomActual nonexistent not found");
    });
  });
});
