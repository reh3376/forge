import { Test } from "@nestjs/testing";
import { SeparationEventService } from "../separationEvent.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ScheduleOrderRecipeInstanceService } from "../../scheduleOrderRecipeInstance/scheduleOrderRecipeInstance.service";
import {
  EnumSeparationStatus,
  EnumRecipeInstanceStatus,
  EnumRecipeParameterCategory,
} from "@prisma/client";

describe("SeparationEventService", () => {
  let service: SeparationEventService;
  let prisma: any;

  const mockScheduleOrder = {
    id: "so-1",
    productionOrders: [
      {
        id: "po-1",
        name: "Production Order 1",
        quantity: 10,
        customerId: "cust-1",
        containerType: "LargeBarrel",
        finalProof: 125,
        createdAt: new Date("2023-01-01"),
        customer: { name: "Customer A" },
      },
      {
        id: "po-2",
        name: "Production Order 2",
        quantity: 5,
        customerId: "cust-2",
        containerType: "LargeBarrel",
        finalProof: 120,
        createdAt: new Date("2023-01-02"),
        customer: { name: "Customer B" },
      },
    ],
    scheduleOrderRecipeInstance: {
      id: "instance-1",
      recipeParameterActuals: [
        {
          id: "param-1",
          valueActual: 1000,
          recipeParameter: {
            recipeParamName: "totalWineGallons",
            parameterCategory: EnumRecipeParameterCategory.Output,
          },
        },
        {
          id: "param-2",
          valueActual: 1275,
          recipeParameter: {
            recipeParamName: "totalProofGallons",
            parameterCategory: EnumRecipeParameterCategory.Output,
          },
        },
      ],
      separationEvent: null,
    },
  };

  const mockSeparationEvent = {
    id: "sep-1",
    scheduleOrderRecipeInstanceId: "instance-1",
    status: EnumSeparationStatus.Initiated,
    totalProofGallonsAvailable: 1275,
    totalWineGallonsAvailable: 1000,
    totalBarrelsExpected: 20,
    totalBarrelsActual: null,
    initiatedBy: "test-user",
    completedAt: null,
    completedBy: null,
    createdBy: "test-user",
    createdAt: new Date(),
    fifoAllocations: [],
  };

  beforeEach(async () => {
    const mockPrisma: any = {
      $transaction: jest.fn((callback: any) => callback(mockPrisma)),
      scheduleOrder: {
        findUnique: jest.fn(),
      },
      scheduleOrderRecipeInstance: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      recipeParameterActual: {
        findMany: jest.fn(),
      },
      separationEvent: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      fifoAllocation: {
        create: jest.fn(),
        update: jest.fn(),
      },
      lot: {
        update: jest.fn(),
      },
    };

    const mockSoInstanceService = {};

    const module = await Test.createTestingModule({
      providers: [
        SeparationEventService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: ScheduleOrderRecipeInstanceService,
          useValue: mockSoInstanceService,
        },
      ],
    }).compile();

    service = module.get<SeparationEventService>(SeparationEventService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe("validateSeparationReadiness", () => {
    it("should return ready=true when all conditions are met", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue(mockScheduleOrder);
      prisma.recipeParameterActual.findMany.mockResolvedValue([
        {
          valueActual: 1000,
          recipeParameter: {
            recipeParamName: "totalWineGallons",
            parameterCategory: EnumRecipeParameterCategory.Output,
          },
        },
        {
          valueActual: 1275,
          recipeParameter: {
            recipeParamName: "totalProofGallons",
            parameterCategory: EnumRecipeParameterCategory.Output,
          },
        },
      ]);

      const result = await service.validateSeparationReadiness("so-1");

      expect(result.ready).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.productionOrders).toHaveLength(2);
      expect(result.aggregatedActuals.totalProofGallons).toBe(1275);
    });

    it("should return ready=false if schedule order not found", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue(null);

      const result = await service.validateSeparationReadiness("non-existent");

      expect(result.ready).toBe(false);
      expect(result.issues).toContain("Schedule order non-existent not found");
    });

    it("should return ready=false if no recipe instance exists", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue({
        ...mockScheduleOrder,
        scheduleOrderRecipeInstance: null,
      });

      const result = await service.validateSeparationReadiness("so-1");

      expect(result.ready).toBe(false);
      expect(result.issues).toContain(
        "Schedule order has no recipe instance. Create one first."
      );
    });

    it("should return ready=false if separation already initiated", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue({
        ...mockScheduleOrder,
        scheduleOrderRecipeInstance: {
          ...mockScheduleOrder.scheduleOrderRecipeInstance,
          separationEvent: mockSeparationEvent,
        },
      });
      prisma.recipeParameterActual.findMany.mockResolvedValue([
        {
          valueActual: 1000,
          recipeParameter: {
            recipeParamName: "totalWineGallons",
            parameterCategory: EnumRecipeParameterCategory.Output,
          },
        },
        {
          valueActual: 1275,
          recipeParameter: {
            recipeParamName: "totalProofGallons",
            parameterCategory: EnumRecipeParameterCategory.Output,
          },
        },
      ]);

      const result = await service.validateSeparationReadiness("so-1");

      expect(result.ready).toBe(false);
      expect(result.issues).toContain(
        "Separation already initiated for this schedule order."
      );
    });

    it("should return ready=false if no yield parameters recorded", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue({
        ...mockScheduleOrder,
        scheduleOrderRecipeInstance: {
          ...mockScheduleOrder.scheduleOrderRecipeInstance,
          recipeParameterActuals: [],
        },
      });
      prisma.recipeParameterActual.findMany.mockResolvedValue([]);

      const result = await service.validateSeparationReadiness("so-1");

      expect(result.ready).toBe(false);
      expect(result.issues).toContain(
        "No proof gallons recorded. Record yield parameters first."
      );
    });

    it("should sort production orders by creation date (FIFO)", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue(mockScheduleOrder);
      prisma.recipeParameterActual.findMany.mockResolvedValue([
        {
          valueActual: 1000,
          recipeParameter: {
            recipeParamName: "totalWineGallons",
            parameterCategory: EnumRecipeParameterCategory.Output,
          },
        },
        {
          valueActual: 1275,
          recipeParameter: {
            recipeParamName: "totalProofGallons",
            parameterCategory: EnumRecipeParameterCategory.Output,
          },
        },
      ]);

      const result = await service.validateSeparationReadiness("so-1");

      expect(result.productionOrders[0].id).toBe("po-1");
      expect(result.productionOrders[1].id).toBe("po-2");
    });
  });

  describe("initiateSeparation", () => {
    const mockParameterActuals = [
      {
        valueActual: 1000,
        recipeParameter: {
          recipeParamName: "totalWineGallons",
          parameterCategory: EnumRecipeParameterCategory.Output,
        },
      },
      {
        valueActual: 1275,
        recipeParameter: {
          recipeParamName: "totalProofGallons",
          parameterCategory: EnumRecipeParameterCategory.Output,
        },
      },
    ];

    it("should create separation event and FIFO allocations", async () => {
      prisma.scheduleOrder.findUnique
        .mockResolvedValueOnce(mockScheduleOrder)
        .mockResolvedValueOnce(mockScheduleOrder);
      prisma.recipeParameterActual.findMany.mockResolvedValue(
        mockParameterActuals
      );
      prisma.separationEvent.create.mockResolvedValue(mockSeparationEvent);
      prisma.fifoAllocation.create.mockResolvedValue({
        id: "alloc-1",
      });
      prisma.scheduleOrderRecipeInstance.update.mockResolvedValue({});

      const result = await service.initiateSeparation("so-1", "test-user");

      expect(prisma.separationEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: EnumSeparationStatus.Initiated,
          totalProofGallonsAvailable: 1275,
          totalWineGallonsAvailable: 1000,
          initiatedBy: "test-user",
          createdBy: "test-user",
        }),
      });

      // Should create FIFO allocations for each production order
      expect(prisma.fifoAllocation.create).toHaveBeenCalledTimes(2);
    });

    it("should create FIFO allocations in correct order", async () => {
      prisma.scheduleOrder.findUnique
        .mockResolvedValueOnce(mockScheduleOrder)
        .mockResolvedValueOnce(mockScheduleOrder);
      prisma.recipeParameterActual.findMany.mockResolvedValue(
        mockParameterActuals
      );
      prisma.separationEvent.create.mockResolvedValue(mockSeparationEvent);
      prisma.fifoAllocation.create.mockResolvedValue({ id: "alloc-1" });
      prisma.scheduleOrderRecipeInstance.update.mockResolvedValue({});

      await service.initiateSeparation("so-1", "test-user");

      // First allocation should be for po-1 (created first)
      expect(prisma.fifoAllocation.create).toHaveBeenNthCalledWith(1, {
        data: expect.objectContaining({
          fifoSequence: 1,
          productionOrder: { connect: { id: "po-1" } },
          quantityRequested: 10,
        }),
      });

      // Second allocation should be for po-2
      expect(prisma.fifoAllocation.create).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({
          fifoSequence: 2,
          productionOrder: { connect: { id: "po-2" } },
          quantityRequested: 5,
        }),
      });
    });

    it("should update recipe instance status to InSeparation", async () => {
      prisma.scheduleOrder.findUnique
        .mockResolvedValueOnce(mockScheduleOrder)
        .mockResolvedValueOnce(mockScheduleOrder);
      prisma.recipeParameterActual.findMany.mockResolvedValue(
        mockParameterActuals
      );
      prisma.separationEvent.create.mockResolvedValue(mockSeparationEvent);
      prisma.fifoAllocation.create.mockResolvedValue({ id: "alloc-1" });
      prisma.scheduleOrderRecipeInstance.update.mockResolvedValue({});

      await service.initiateSeparation("so-1", "test-user");

      expect(prisma.scheduleOrderRecipeInstance.update).toHaveBeenCalledWith({
        where: { id: "instance-1" },
        data: {
          status: EnumRecipeInstanceStatus.InSeparation,
          separationStarted: true,
        },
      });
    });

    it("should throw error if not ready for separation", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue({
        ...mockScheduleOrder,
        scheduleOrderRecipeInstance: null,
      });

      await expect(
        service.initiateSeparation("so-1", "test-user")
      ).rejects.toThrow("Cannot initiate separation");
    });
  });

  describe("executeFifoAllocation", () => {
    const mockSeparationWithAllocations = {
      ...mockSeparationEvent,
      fifoAllocations: [
        {
          id: "alloc-1",
          fifoSequence: 1,
          productionOrderId: "po-1",
          productionOrder: { name: "Production Order 1" },
          quantityRequested: 10,
          quantityAllocated: 0,
        },
        {
          id: "alloc-2",
          fifoSequence: 2,
          productionOrderId: "po-2",
          productionOrder: { name: "Production Order 2" },
          quantityRequested: 5,
          quantityAllocated: 0,
        },
      ],
    };

    it("should assign lots to production orders via FIFO", async () => {
      prisma.separationEvent.findUnique.mockResolvedValue(
        mockSeparationWithAllocations
      );
      prisma.lot.update.mockResolvedValue({});
      prisma.fifoAllocation.update.mockResolvedValue({});
      prisma.separationEvent.update.mockResolvedValue({});

      const lotAssignments = [
        { lotId: "lot-1", productionOrderId: "po-1", proofGallons: 66 },
        { lotId: "lot-2", productionOrderId: "po-1", proofGallons: 66 },
        { lotId: "lot-3", productionOrderId: "po-2", proofGallons: 66 },
      ];

      const result = await service.executeFifoAllocation(
        "sep-1",
        lotAssignments
      );

      expect(prisma.lot.update).toHaveBeenCalledTimes(3);
      expect(result.allocations).toHaveLength(2);
      expect(result.summary.totalAllocated).toBe(3);
    });

    it("should update allocation quantities correctly", async () => {
      prisma.separationEvent.findUnique.mockResolvedValue(
        mockSeparationWithAllocations
      );
      prisma.lot.update.mockResolvedValue({});
      prisma.fifoAllocation.update.mockResolvedValue({});
      prisma.separationEvent.update.mockResolvedValue({});

      const lotAssignments = [
        { lotId: "lot-1", productionOrderId: "po-1", proofGallons: 66 },
        { lotId: "lot-2", productionOrderId: "po-1", proofGallons: 66 },
      ];

      const result = await service.executeFifoAllocation(
        "sep-1",
        lotAssignments
      );

      // First allocation (po-1) should have 2 lots assigned
      const po1Allocation = result.allocations.find(
        (a) => a.productionOrderId === "po-1"
      );
      expect(po1Allocation?.quantityAllocated).toBe(2);
      expect(po1Allocation?.proofGallonsAllocated).toBe(132);
    });

    it("should throw error if separation event not found", async () => {
      prisma.separationEvent.findUnique.mockResolvedValue(null);

      await expect(
        service.executeFifoAllocation("non-existent", [])
      ).rejects.toThrow("Separation event non-existent not found");
    });

    it("should mark allocation as complete when quantity met", async () => {
      const allocWithSmallRequest = {
        ...mockSeparationWithAllocations,
        fifoAllocations: [
          {
            id: "alloc-1",
            fifoSequence: 1,
            productionOrderId: "po-1",
            productionOrder: { name: "PO1" },
            quantityRequested: 2,
            quantityAllocated: 0,
          },
        ],
      };
      prisma.separationEvent.findUnique.mockResolvedValue(
        allocWithSmallRequest
      );
      prisma.lot.update.mockResolvedValue({});
      prisma.fifoAllocation.update.mockResolvedValue({});
      prisma.separationEvent.update.mockResolvedValue({});

      const lotAssignments = [
        { lotId: "lot-1", productionOrderId: "po-1", proofGallons: 66 },
        { lotId: "lot-2", productionOrderId: "po-1", proofGallons: 66 },
      ];

      const result = await service.executeFifoAllocation(
        "sep-1",
        lotAssignments
      );

      expect(result.allocations[0].allocationComplete).toBe(true);
    });
  });

  describe("completeSeparation", () => {
    it("should mark separation and instance as complete", async () => {
      prisma.separationEvent.findUnique.mockResolvedValue({
        ...mockSeparationEvent,
        scheduleOrderRecipeInstance: { id: "instance-1" },
        scheduleOrderRecipeInstanceId: "instance-1",
      });
      prisma.separationEvent.update.mockResolvedValue({
        ...mockSeparationEvent,
        status: EnumSeparationStatus.Completed,
        completedAt: new Date(),
        completedBy: "test-user",
      });
      prisma.scheduleOrderRecipeInstance.update.mockResolvedValue({});

      const result = await service.completeSeparation("sep-1", "test-user");

      expect(prisma.separationEvent.update).toHaveBeenCalledWith({
        where: { id: "sep-1" },
        data: {
          status: EnumSeparationStatus.Completed,
          completedAt: expect.any(Date),
          completedBy: "test-user",
        },
      });

      expect(prisma.scheduleOrderRecipeInstance.update).toHaveBeenCalledWith({
        where: { id: "instance-1" },
        data: {
          status: EnumRecipeInstanceStatus.Completed,
          separationCompletedAt: expect.any(Date),
        },
      });

      expect(result.status).toBe(EnumSeparationStatus.Completed);
    });

    it("should throw error if separation event not found", async () => {
      prisma.separationEvent.findUnique.mockResolvedValue(null);

      await expect(
        service.completeSeparation("non-existent", "test-user")
      ).rejects.toThrow("Separation event non-existent not found");
    });
  });

  describe("findById", () => {
    it("should find separation event with all relations", async () => {
      prisma.separationEvent.findUnique.mockResolvedValue(mockSeparationEvent);

      const result = await service.findById("sep-1");

      expect(prisma.separationEvent.findUnique).toHaveBeenCalledWith({
        where: { id: "sep-1" },
        include: expect.objectContaining({
          fifoAllocations: expect.any(Object),
          scheduleOrderRecipeInstance: expect.any(Object),
        }),
      });
      expect(result).toEqual(mockSeparationEvent);
    });
  });

  describe("findByScheduleOrderId", () => {
    it("should find separation event via schedule order", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue({
        ...mockScheduleOrder,
        scheduleOrderRecipeInstance: {
          ...mockScheduleOrder.scheduleOrderRecipeInstance,
          separationEvent: mockSeparationEvent,
        },
      });

      const result = await service.findByScheduleOrderId("so-1");

      expect(result).toEqual(mockSeparationEvent);
    });

    it("should return null if no separation event", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue(mockScheduleOrder);

      const result = await service.findByScheduleOrderId("so-1");

      expect(result).toBeNull();
    });
  });
});
