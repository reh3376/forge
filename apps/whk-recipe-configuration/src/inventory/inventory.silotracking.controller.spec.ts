import { Test, TestingModule } from "@nestjs/testing";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { InventorySiloTrackingService } from "./inventory.silotracking.service";
import { RolesBuilder, ACGuard } from "nest-access-control";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";

describe("InventoryController", () => {
  let controller: InventoryController;
  let inventoryService: InventoryService;
  let siloTrackingService: InventorySiloTrackingService;

  beforeEach(async () => {
    const rolesBuilder = new RolesBuilder();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [
        {
          provide: InventoryService,
          useValue: {
            // Add any methods from InventoryService that might be used
          },
        },
        {
          provide: InventorySiloTrackingService,
          useValue: {
            addLotToAsset: jest.fn(),
            deductFromAsset: jest.fn(),
            getAssetInventory: jest.fn(),
            transferBetweenAssets: jest.fn(),
          },
        },
        {
          provide: "ROLES_BUILDER_TOKEN",
          useValue: rolesBuilder,
        },
        {
          provide: "__roles_builder__",
          useExisting: "ROLES_BUILDER_TOKEN",
        },
        {
          provide: Reflector,
          useValue: {
            get: jest.fn(),
          },
        },
        ACGuard,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue("development") },
        },
      ],
    }).compile();

    controller = module.get<InventoryController>(InventoryController);
    inventoryService = module.get<InventoryService>(InventoryService);
    siloTrackingService = module.get<InventorySiloTrackingService>(
      InventorySiloTrackingService
    );
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("getAssetInventory", () => {
    it("should call siloTrackingService.getAssetInventory with correct parameter", async () => {
      const assetId = "asset1";
      await controller.getAssetInventory(assetId);
      expect(siloTrackingService.getAssetInventory).toHaveBeenCalledWith(
        "asset1"
      );
    });
  });

  describe("deductFromAsset", () => {
    it("should call siloTrackingService.deductFromAsset with correct parameters", async () => {
      const body = { assetId: "asset1", quantity: 50 };
      await controller.deductFromAsset(body);
      expect(siloTrackingService.deductFromAsset).toHaveBeenCalledWith(
        "asset1",
        50
      );
    });
  });

  describe("getAssetInventory", () => {
    it("should call siloTrackingService.getAssetInventory with correct parameter", async () => {
      const assetId = "asset1";
      await controller.getAssetInventory(assetId);
      expect(siloTrackingService.getAssetInventory).toHaveBeenCalledWith(
        "asset1"
      );
    });
  });

  describe("transferBetweenAssets", () => {
    it("should call siloTrackingService.transferBetweenAssets with correct parameters", async () => {
      const body = {
        sourceAssetId: "asset1",
        destAssetId: "asset2",
        quantity: 75,
        itemId: "item1",
      };
      await controller.transferBetweenAssets(body);
      expect(siloTrackingService.transferBetweenAssets).toHaveBeenCalledWith(
        "asset1",
        "asset2",
        75,
        "item1"
      );
    });
  });
});
