import { Test, TestingModule } from "@nestjs/testing";
import { RecipeGenerator } from "../recipe.generation";
import { RabbitMQProducerService } from "../../rabbitmq/rabbitmq.producer.service";
import { EnzymeDosingService } from "../enzyme.dosing";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { Logger } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

// Mock data
export const mockItem = {
  id: "item1",
  itemNumber: "TEST_CUSTOMER-70-20-0-10-NEW_CHAR-90-v01",
  active: true,
  baseBomItem: false,
  createdAt: new Date(),
  createdBy: "system",
  erpId: "ERP001",
  itemName: "Test Item",
  itemRevision: 1,
  itemType: "RECIPE",
  schemaVersion: "1.0",
};

// Mock Prisma Client
export const mockPrismaClient = {
  $on: jest.fn(),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  $use: jest.fn(),
  $executeRaw: jest.fn(),
  $queryRaw: jest.fn(),
  $transaction: jest.fn().mockImplementation((callback) => {
    if (typeof callback === "function") {
      // Create a deep copy of the mock client for transactions
      const transactionClient = {
        $on: jest.fn(),
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        $use: jest.fn(),
        $executeRaw: jest.fn(),
        $queryRaw: jest.fn(),
        $transaction: jest.fn((nestedCallback) => {
          if (typeof nestedCallback === "function") {
            return Promise.resolve(nestedCallback(transactionClient));
          }
          return Promise.resolve(nestedCallback);
        }),
        item: {
          findFirst: jest.fn().mockImplementation((params: any) => {
            if (params?.where?.itemNumber?.equals) {
              return Promise.resolve({
                ...mockItem,
                itemNumber: params.where.itemNumber.equals,
              });
            }
            return Promise.resolve(mockItem);
          }),
          create: jest.fn().mockResolvedValue(mockItem),
          update: jest.fn().mockResolvedValue(mockItem),
          findMany: jest.fn().mockResolvedValue([mockItem]),
        },
        customer: {
          findFirst: jest.fn().mockResolvedValue({
            id: "customer1",
            name: "Test Customer",
            customerCode: "TEST_CUSTOMER",
          }),
        },
        recipe: {
          findFirst: jest.fn().mockResolvedValue(null),
          findUnique: jest.fn().mockResolvedValue({
            id: "recipe1",
            Recipe: "TEST-70-20-0-10-v01",
            customerCode: "TEST_CUSTOMER",
            mashBill: "70-20-0-10",
          }),
          create: jest.fn().mockResolvedValue({
            id: "recipe1",
            Recipe: "TEST-70-20-0-10-v01",
            customerCode: "TEST_CUSTOMER",
            mashBill: "70-20-0-10",
          }),
          update: jest.fn().mockResolvedValue({
            id: "recipe1",
            Recipe: "TEST-70-20-0-10-v01",
            customerCode: "TEST_CUSTOMER",
            mashBill: "70-20-0-10",
          }),
        },
        bom: {
          findFirst: jest.fn().mockImplementation((params: any) => {
            if (
              params?.where?.bomRevision === "BOM-TEST_CUSTOMER-70-20-0-10-v01"
            ) {
              return Promise.resolve({
                id: "bom1",
                bomRevision: "BOM-TEST_CUSTOMER-70-20-0-10-v01",
                items: [
                  {
                    id: "bomItem1",
                    item: mockItem,
                    quantity: 100,
                  },
                ],
              });
            }
            return Promise.resolve({
              id: "bom1",
              bomRevision: "BOM-TEST_CUSTOMER-70-20-0-10-v01",
            });
          }),
          create: jest.fn(),
          update: jest.fn(),
        },
        recipeBom: {
          findFirst: jest.fn().mockImplementation((params: any) => {
            if (
              params?.where?.revision === "BOM-TEST_CUSTOMER-70-20-0-10-v01"
            ) {
              return Promise.resolve({
                id: "recipeBom1",
                revision: "BOM-TEST_CUSTOMER-70-20-0-10-v01",
                items: [
                  {
                    id: "recipeBomItem1",
                    item: mockItem,
                    quantity: 100,
                    operation: "ADDITIVE",
                  },
                ],
              });
            }
            return Promise.resolve(null);
          }),
          create: jest.fn().mockImplementation((params: any) => {
            return Promise.resolve({
              id: "recipeBom1",
              revision:
                params.data?.revision || "BOM-TEST_CUSTOMER-70-20-0-10-v01",
              items: [],
            });
          }),
          update: jest.fn(),
          findMany: jest.fn(),
        },
        recipeBomItem: {
          create: jest.fn(),
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
          findMany: jest.fn().mockImplementation(() => {
            return Promise.resolve([
              {
                id: "recipeBomItem1",
                item: mockItem,
                itemId: mockItem.id,
                quantity: 100,
                operation: "ADDITIVE",
              },
            ]);
          }),
        },
        bomItem: {
          create: jest.fn().mockResolvedValue({ id: "bomItem1" }),
        },
        mashingProtocol: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: "mashingProtocol1" }),
        },
        mashingProtocolStep: {
          create: jest.fn().mockResolvedValue({ id: "mashingProtocolStep1" }),
          update: jest.fn().mockResolvedValue({ id: "mashingProtocolStep1" }),
        },
        unitProcedure: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: "unitProcedure1", name: "Mashing01" }),
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: "unitProcedure1", name: "Mashing01", operations: [] }),
        },
        recipeParameter: {
          findFirst: jest.fn().mockResolvedValue({ id: "recipeParameter1" }),
          create: jest.fn().mockResolvedValue({ id: "recipeParameter1" }),
        },
        recipeGroup: {
          findFirst: jest.fn().mockResolvedValue({ id: "recipeGroup1" }),
          create: jest.fn().mockResolvedValue({ id: "recipeGroup1" }),
          update: jest.fn().mockResolvedValue({ id: "recipeGroup1" }),
        },
        productionOrder: {
          create: jest.fn().mockResolvedValue({
            id: "productionOrder1",
            orderNumber: "PO-001",
            totalFermenters: 2,
            status: "PENDING",
          }),
          findFirst: jest.fn(),
          update: jest.fn(),
        },
        scheduleOrder: {
          create: jest.fn().mockResolvedValue({
            id: "scheduleOrder1",
            orderNumber: "SO-001",
            productionOrderAllocation: 100,
            status: "PENDING",
          }),
          findFirst: jest.fn(),
          update: jest.fn(),
        },
        scheduleOrderQueue: {
          create: jest.fn().mockResolvedValue({
            id: "scheduleOrderQueue1",
            queueIndex: 0,
            nextUnitProcedureName: "Mashing01",
          }),
          findFirst: jest.fn().mockResolvedValue({ queueIndex: 0 }),
          update: jest.fn(),
          aggregate: jest.fn().mockResolvedValue({ _max: { queueIndex: 0 } }),
        },
        salesOrder: {
          create: jest.fn().mockResolvedValue({ id: "salesOrder1" }),
          findFirst: jest.fn(),
          update: jest.fn(),
        },
        asset: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as unknown as PrismaClient;
      return Promise.resolve(callback(transactionClient));
    }
    return Promise.resolve(callback);
  }),
  item: {
    findFirst: jest.fn().mockImplementation((params: any) => {
      if (params?.where?.itemNumber?.equals) {
        return Promise.resolve({
          ...mockItem,
          itemNumber: params.where.itemNumber.equals,
        });
      }
      return Promise.resolve(mockItem);
    }),
    create: jest.fn().mockResolvedValue(mockItem),
    update: jest.fn().mockResolvedValue(mockItem),
    findMany: jest.fn().mockResolvedValue([mockItem]),
  },
  customer: {
    findFirst: jest.fn().mockResolvedValue({
      id: "customer1",
      name: "Test Customer",
      customerCode: "TEST_CUSTOMER",
    }),
  },
  recipe: {
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue({
      id: "recipe1",
      Recipe: "TEST-70-20-0-10-v01",
      customerCode: "TEST_CUSTOMER",
      mashBill: "70-20-0-10",
    }),
    create: jest.fn().mockResolvedValue({
      id: "recipe1",
      Recipe: "TEST-70-20-0-10-v01",
      customerCode: "TEST_CUSTOMER",
      mashBill: "70-20-0-10",
    }),
    update: jest.fn().mockResolvedValue({
      id: "recipe1",
      Recipe: "TEST-70-20-0-10-v01",
      customerCode: "TEST_CUSTOMER",
      mashBill: "70-20-0-10",
    }),
  },
  bom: {
    findFirst: jest.fn().mockImplementation((params: any) => {
      if (params?.where?.bomRevision === "BOM-TEST_CUSTOMER-70-20-0-10-v01") {
        return Promise.resolve({
          id: "bom1",
          bomRevision: "BOM-TEST_CUSTOMER-70-20-0-10-v01",
          items: [
            {
              id: "bomItem1",
              item: mockItem,
              quantity: 100,
            },
          ],
        });
      }
      return Promise.resolve({
        id: "bom1",
        bomRevision: "BOM-TEST_CUSTOMER-70-20-0-10-v01",
      });
    }),
    create: jest.fn(),
    update: jest.fn(),
  },
  recipeBom: {
    findFirst: jest.fn().mockImplementation((params: any) => {
      if (params?.where?.revision === "BOM-TEST_CUSTOMER-70-20-0-10-v01") {
        return Promise.resolve({
          id: "recipeBom1",
          revision: "BOM-TEST_CUSTOMER-70-20-0-10-v01",
          items: [
            {
              id: "recipeBomItem1",
              item: mockItem,
              quantity: 100,
              operation: "ADDITIVE",
            },
          ],
        });
      }
      return Promise.resolve(null);
    }),
    create: jest.fn().mockImplementation((params: any) => {
      return Promise.resolve({
        id: "recipeBom1",
        revision: params.data?.revision || "BOM-TEST_CUSTOMER-70-20-0-10-v01",
        items: [],
      });
    }),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  recipeBomItem: {
    create: jest.fn(),
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
    findMany: jest.fn().mockImplementation(() => {
      return Promise.resolve([
        {
          id: "recipeBomItem1",
          item: mockItem,
          itemId: mockItem.id,
          quantity: 100,
          operation: "ADDITIVE",
        },
      ]);
    }),
  },
  bomItem: {
    create: jest.fn().mockResolvedValue({ id: "bomItem1" }),
  },
  mashingProtocol: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: "mashingProtocol1" }),
  },
  mashingProtocolStep: {
    create: jest.fn().mockResolvedValue({ id: "mashingProtocolStep1" }),
    update: jest.fn().mockResolvedValue({ id: "mashingProtocolStep1" }),
  },
  unitProcedure: {
    findFirst: jest
      .fn()
      .mockResolvedValue({ id: "unitProcedure1", name: "Mashing01" }),
    findUnique: jest
      .fn()
      .mockResolvedValue({ id: "unitProcedure1", name: "Mashing01", operations: [] }),
  },
  recipeParameter: {
    findFirst: jest.fn().mockResolvedValue({ id: "recipeParameter1" }),
    create: jest.fn().mockResolvedValue({ id: "recipeParameter1" }),
  },
  recipeGroup: {
    findFirst: jest.fn().mockResolvedValue({ id: "recipeGroup1" }),
    create: jest.fn().mockResolvedValue({ id: "recipeGroup1" }),
    update: jest.fn().mockResolvedValue({ id: "recipeGroup1" }),
  },
  productionOrder: {
    create: jest.fn().mockResolvedValue({
      id: "productionOrder1",
      orderNumber: "PO-001",
      totalFermenters: 2,
      status: "PENDING",
    }),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  scheduleOrder: {
    create: jest.fn().mockResolvedValue({
      id: "scheduleOrder1",
      orderNumber: "SO-001",
      productionOrderAllocation: 100,
      status: "PENDING",
    }),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  scheduleOrderQueue: {
    create: jest.fn().mockResolvedValue({
      id: "scheduleOrderQueue1",
      queueIndex: 0,
      nextUnitProcedureName: "Mashing01",
    }),
    findFirst: jest.fn().mockResolvedValue({ queueIndex: 0 }),
    update: jest.fn(),
    aggregate: jest.fn().mockResolvedValue({ _max: { queueIndex: 0 } }),
  },
  salesOrder: {
    create: jest.fn().mockResolvedValue({ id: "salesOrder1" }),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  asset: {
    findMany: jest.fn().mockResolvedValue([]),
  },
} as unknown as PrismaClient;

// Mock RabbitMQ service
export const mockRabbitMQService = {
  emitMessage: jest.fn(),
};

// Mock Enzyme Dosing service
export const mockEnzymeDosingService = {
  calculateEnzymeDosing: jest.fn(),
  calculateNormalizedEnzymeDosing: jest.fn(),
};

// Mock Logger
export const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

// Move jest.mock after mockPrismaClient is defined
jest.mock("@prisma/client", () => {
  const actual = jest.requireActual("@prisma/client");
  return {
    ...actual,
    PrismaClient: jest.fn(() => mockPrismaClient),
  };
});

// Update the createTestingModule function
export async function createTestingModule(): Promise<TestingModule> {
  jest.clearAllMocks();

  const module = await Test.createTestingModule({
    providers: [
      RecipeGenerator,
      {
        provide: RabbitMQProducerService,
        useValue: mockRabbitMQService,
      },
      {
        provide: EnzymeDosingService,
        useValue: mockEnzymeDosingService,
      },
      {
        provide: PrismaService,
        useValue: mockPrismaClient,
      },
      {
        provide: WINSTON_MODULE_NEST_PROVIDER,
        useValue: mockLogger,
      },
    ],
  }).compile();

  return module;
}

// Add a test to satisfy Jest's requirement
describe("Test Setup", () => {
  it("should create a testing module", async () => {
    const module = await createTestingModule();
    expect(module).toBeDefined();
  });
});
