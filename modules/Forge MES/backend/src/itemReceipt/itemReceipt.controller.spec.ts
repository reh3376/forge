import { Test, TestingModule } from "@nestjs/testing";
import { ItemReceiptController } from "./itemReceipt.controller";
import { ItemReceiptService } from "./itemReceipt.service";
import { RolesBuilder, ACGuard } from "nest-access-control";
import { EnumItemReceiptStatus, Prisma } from "@prisma/client";
import { ItemReceiptCreateInput } from "./base/ItemReceiptCreateInput";
import { ItemReceiptUpdateInput } from "./base/ItemReceiptUpdateInput";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { NotFoundException } from "@nestjs/common";

// Mock the ACGuard
const mockACGuard = { canActivate: jest.fn(() => true) };

// Mock the Reflector
const mockReflector = { get: jest.fn(), getAllAndOverride: jest.fn() };

// Mock the __roles_builder__
const mockRolesBuilder = {
  getRoles: jest.fn(),
  getGrants: jest.fn(),
};

describe("ItemReceiptController", () => {
  let controller: ItemReceiptController;
  let service: ItemReceiptService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ItemReceiptController],
      providers: [
        {
          provide: ItemReceiptService,
          useValue: {
            create: jest.fn(),
            findMany: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            createItemReceipt: jest.fn(),
            itemReceipts: jest.fn(),
            itemReceipt: jest.fn(),
            updateItemReceipt: jest.fn(),
          },
        },
        {
          provide: RolesBuilder,
          useValue: {
            can: jest.fn().mockReturnValue({
              granted: true,
              attributes: ["*"],
            }),
          },
        },
        {
          provide: ACGuard,
          useValue: mockACGuard,
        },
        {
          provide: Reflector,
          useValue: mockReflector,
        },
        {
          provide: "__roles_builder__",
          useValue: mockRolesBuilder,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue("development") },
        },
      ],
    }).compile();

    controller = module.get<ItemReceiptController>(ItemReceiptController);
    service = module.get<ItemReceiptService>(ItemReceiptService);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("create", () => {
    it("should create an item receipt", async () => {
      const createArgs: Prisma.ItemReceiptCreateArgs = {
        data: {
          quantity: 10,
          itemId: "item-123",
          loadId: 1,
          createdBy: "user-123",
          driver: "driver-123",
          units: "kg",
        },
      };
      const mockItemReceipt = {
        id: "test-id",
        ...createArgs.data,
        createdAt: new Date(),
        globalId: null,
        loadId: null,
        lots: {},
        purchaseOrderId: null,
        siloNumber: null,
        schemaVersion: null,
        status: "InProgress" as EnumItemReceiptStatus,
        supplierLot: null,
        testsPassed: false,
        toAssetId: null,
        updatedBy: null,
        updatedAt: new Date(),
        weighIn: null,
        weighOut: null,
        itemId: "item-123",
        createdBy: "user-123",
        driver: "driver-123",
        units: "kg",
        comments: null,
        vendorLoadId: null,
      };
      jest
        .spyOn(service, "createItemReceipt")
        .mockResolvedValue(mockItemReceipt);

      const result = await controller.createItemReceipt(
        createArgs.data as ItemReceiptCreateInput
      );
      expect(result).toEqual(mockItemReceipt);
      expect(service.createItemReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining(createArgs.data),
          select: expect.any(Object),
        })
      );
    });

    it("should throw an error if creation fails", async () => {
      const createArgs: Prisma.ItemReceiptCreateArgs = {
        data: {
          quantity: 10,
          itemId: "item-123",
          loadId: 1,
          createdBy: "user-123",
          driver: "driver-123",
          units: "kg",
        },
      };
      jest
        .spyOn(service, "createItemReceipt")
        .mockRejectedValue(new Error("Creation failed"));

      await expect(
        controller.createItemReceipt(createArgs.data as ItemReceiptCreateInput)
      ).rejects.toThrow("Creation failed");
    });

    it("should find many item receipts with filters", async () => {
      const findManyArgs: Prisma.ItemReceiptFindManyArgs = {
        where: { itemId: "item-123" },
        orderBy: { createdAt: "desc" },
        take: 10,
        skip: 0,
      };
      const mockItemReceipts = [
        {
          id: "test-id-1",
          itemId: "item-123",
          createdAt: new Date(),
          createdBy: "user-123",
          driver: "driver-123",
          globalId: null,
          loadId: null,
          lots: {},
          purchaseOrderId: null,
          quantity: 10,
          schemaVersion: null,
          siloNumber: null,
          status: "InProgress" as EnumItemReceiptStatus,
          supplierLot: null,
          testsPassed: false,
          toAssetId: null,
          updatedBy: null,
          updatedAt: new Date(),
          weighIn: null,
          weighOut: null,
          units: "kg",
          comments: null,
          vendorLoadId: null,
        },
        {
          id: "test-id-2",
          itemId: "item-123",
          createdAt: new Date(),
          createdBy: "user-456",
          driver: "driver-456",
          globalId: null,
          loadId: null,
          lots: {},
          purchaseOrderId: null,
          quantity: 15,
          schemaVersion: null,
          siloNumber: null,
          status: "InProgress" as EnumItemReceiptStatus,
          supplierLot: null,
          testsPassed: false,
          toAssetId: null,
          updatedBy: null,
          updatedAt: new Date(),
          weighIn: null,
          weighOut: null,
          units: "kg",
          comments: null,
          vendorLoadId: null,
        },
      ];
      jest.spyOn(service, "itemReceipts").mockResolvedValue(mockItemReceipts);

      const result = await controller.itemReceipts(findManyArgs as any);
      expect(result).toEqual(mockItemReceipts);
      // expect(service.itemReceipts).toHaveBeenCalledWith(
      //   expect.objectContaining({
      //     where: findManyArgs.where,
      //     orderBy: findManyArgs.orderBy,
      //     take: findManyArgs.take,
      //     skip: findManyArgs.skip,
      //     select: expect.any(Object)
      //   })
      // );
    });

    it("should return an empty array if no item receipts are found", async () => {
      const findManyArgs: Prisma.ItemReceiptFindManyArgs = {};
      jest.spyOn(service, "itemReceipts").mockResolvedValue([]);

      const result = await controller.itemReceipts(findManyArgs as any);
      expect(result).toEqual([]);
    });

    it("should throw an error if item receipt is not found", async () => {
      const id = "non-existent-id";
      jest.spyOn(service, "itemReceipt").mockResolvedValue(null);

      await expect(controller.itemReceipt({ id })).rejects.toThrow(
        NotFoundException
      );
    });

    it("should update an item receipt", async () => {
      const updateArgs: Prisma.ItemReceiptUpdateArgs = {
        where: { id: "test-id" },
        data: {
          quantity: 15,
        },
      };
      const mockUpdatedItemReceipt = { id: "test-id", ...updateArgs.data };
      jest
        .spyOn(service, "updateItemReceipt")
        .mockResolvedValue(mockUpdatedItemReceipt as any);

      const result = await controller.updateItemReceipt(
        { id: updateArgs.where.id as string },
        updateArgs.data as ItemReceiptUpdateInput
      );
      expect(service.updateItemReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: updateArgs.where.id },
          data: expect.objectContaining(updateArgs.data),
          select: expect.any(Object),
        })
      );
    });

    it("should throw an error if update fails", async () => {
      const updateArgs: Prisma.ItemReceiptUpdateArgs = {
        where: { id: "test-id" },
        data: { quantity: 15 },
      };
      jest
        .spyOn(service, "updateItemReceipt")
        .mockRejectedValue(new Error("Update failed"));

      await expect(
        controller.updateItemReceipt(
          { id: updateArgs.where.id as string },
          updateArgs.data as ItemReceiptUpdateInput
        )
      ).rejects.toThrow("Update failed");
    });
  });
});
