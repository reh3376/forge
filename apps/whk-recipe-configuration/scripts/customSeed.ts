// import {Prisma, PrismaClient} from "@prisma/client";

import {
  EnumAssetType,
  EnumEquipmentPhaseName,
  EnumItemItemClass,
  EnumOperationName,
  EnumPhaseParameterSetpointType,
  EnumProcedureName, EnumProductionOrderStatus, EnumSalesOrderOrderType,
  EnumTestParameterTestParamUnits,
  EnumTestParameterTestSetpointType,
  EnumUnitProcedureName, EquipmentPhase,
  Item,
  Operation, Prisma,
  PrismaClient,
  ProductionOrder,
  ProductionSchedule,
  Recipe,
  RecipeGroup, SalesOrder,
  ScheduleOrder,
  ScheduleOrderQueue,
  UnitProcedure,
} from "@prisma/client";
import {faker} from "@faker-js/faker";
import { hash } from "bcrypt";
import {EnumScheduleOrderStatus} from "../src/scheduleOrder/base/EnumScheduleOrderStatus";

// Function to get a random element from an array
// function getRandomElement<T>(arr: Array<T>): T | null {
//   if (arr.length === 0) return null;
//   const randomIndex = Math.floor(Math.random() * arr.length);
//   return arr[randomIndex];
// }

// Function to get a random element from an array
// Define the function using a generic type parameter <T>
function getRandomArrayElement<T>(arr: Array<T>): T | undefined {
  if (arr.length === 0) return undefined; // Handle empty array case
  const randomIndex = Math.floor(Math.random() * arr.length);
  return arr[randomIndex];
}


export async function customSeed() {
  const client = new PrismaClient();
  type EntityType = 'User' | "Procedure" | "UnitProcedure" | "Operation" | "TestParameter" | "Bom" | "PhaseParameter" | "EquipmentPhase" | "Item" | "ItemGroup" | "Recipe" | "RecipeGroup" | "ScheduleOrder" | "ScheduleOrderQueue" | "ProductionSchedule" | "ProductionOrder"
      | "Lot" | "ItemReceipt" | "PurchaseOrder" | "SalesOrder" | "Account" | "Asset";
  type SeedFunction = (n: number) => Promise<void>;
  type SeedFunctions = {
    [key in EntityType]: SeedFunction;
  };

  async function seedUser(n: number=10): Promise<void> {
    for (let i = 0; i < n; i++) {
      const saltRounds = 10;
      const passwordHash = await hash(faker.internet.password({length: 18}), saltRounds);

      await client.user.create({
        data: {
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
          password: passwordHash,
          roles: JSON.stringify(['user', 'admin']), // Example roles
          username: faker.internet.userName(),
        },
      });

      // console.log('User created:', user);
    }
    return;
  }

  // Utility function to generate a unique name, consider implementing uniqueness checks
  // function generateUniqueName(baseName: string): string {
  //   return `${baseName}-${faker.string.uuid()}`;
  // }

  async function seedAsset(n: number=10): Promise<void> {
    for (let i = 0; i < n; i++) {
      const assetPath = faker.internet.url(); // Assuming assetPath is a URL
      const description = faker.commerce.productDescription();
      const name = faker.commerce.productName();
      const createdBy = faker.internet.userName();
      // Generate a revision number, if applicable
      const revision = faker.number.int({min: 0, max: 10});
      // Select a random type from EnumAssetType

      try {
        await client.asset.create({
          data: {
            assetPath: assetPath,
            // children: JSON.stringify({child: faker.word.noun()}), // Example of optional JSON field
            createdBy: createdBy,
            description: description,
            name: name,
            revision: revision,
            type: EnumAssetType.CELL,
          },
        })
      } catch (error) {
        console.log(error);
      }
    }
    return;
  }

  async function seedAccount(n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      const name = faker.company.name();
      const revision = faker.number.int({ min: 0, max: 10 });
      // Ensure uniqueness for combination of revision and name if necessary
      const address = faker.location.streetAddress();
      const createdBy = faker.internet.userName();
      const description = faker.datatype.boolean() ? faker.company.catchPhrase() : undefined;
      const editedBy = faker.datatype.boolean() ? faker.internet.userName() : undefined;
      const email = faker.datatype.boolean() ? faker.internet.email() : undefined;

      try {
        await client.account.create({
          data: {
            address,
            createdBy,
            description,
            editedBy,
            email,
            name,
            revision,
            // Optional fields left undefined will not be included
          },
        });
      } catch (error) {
        console.error(error);
      }

    }
    console.log(`${n} accounts created.`);
  }

  async function seedProcedure(n: number): Promise<void> {
    const classDefinitions = [];

    // Assume EnumProcedureName has limited values, adjust as necessary
    const procedureNames = Object.values(EnumProcedureName);

    try {
      // Step 1: Seed class definitions
      for (const name of procedureNames) {
        const classDefinition = await client.procedure.create({
          data: {
            createdBy: faker.internet.userName(),
            description: faker.lorem.sentences(),
            name,
            isClassDefinition: true,
            revision: 0, // Starting revision for class definitions
          },
        });
        classDefinitions.push(classDefinition);
      }
    } catch (error) {
      console.error(error);
    }
    try {
      // Step 2: Seed instances for each class definition
      for (const classDefinition of classDefinitions) {
        await client.procedure.create({
          data: {
            createdBy: faker.internet.userName(),
            description: faker.lorem.sentences(),
            name: classDefinition.name,
            // classId: classDefinition.id,
            isClassDefinition: false,
            revision: faker.number.int({min: 1, max: 10}), // Assume instances can have varying revisions
            // Optionally set active and other fields as necessary
          },
        });
      }
    } catch (error) {
      console.error(error);
    }

    console.log(`Procedures seeded: ${procedureNames.length} class definitions and ${n * procedureNames.length} instances.`);
  }

  // Unit Procedure
  async function seedUnitProcedure(): Promise<void> {
    const procedureIds = (await client.procedure.findMany()).map(procedure => procedure.id);

    if (procedureIds.length === 0) {
      console.warn("No Procedures found. Please seed Procedures first.");
      return;
    }

    // Seed class definitions for each UnitProcedure name
    for (const name of Object.values(EnumUnitProcedureName)) {
      const procedureId = getRandomArrayElement(procedureIds);
      try {
        await client.unitProcedure.create({
          data: {
            createdBy: faker.internet.userName(),
            name: name,
            isClassDef: true,
            procedure: {connect: {id: procedureId}},
            revision: 0, // Initial revision for class definitions
            // Additional fields as necessary
          },
        });
      } catch (error) {
        console.error(error);
      }

      // Seed instances for the class definition
      const instancesCount = faker.number.int({min: 1, max: 5});
      for (let i = 0; i < instancesCount; i++) {
        try {
          await client.unitProcedure.create({
            data: {
              createdBy: faker.internet.userName(),
              name: name, // Same name as class definition
              isClassDef: false,
              // classId: classDefinition.id,
              procedure: {connect: {id: procedureId}},
              revision: i + 1, // Incremental revisions for instances
              // Additional fields as necessary
            },
          });
        } catch (error) {
          console.error(error);
        }
      }
    }

    console.log("UnitProcedures seeded.");
  }

  const unitProcedureOperationsMap: { [key: string]: string[] } = {
      Mashing01: ['Cook', 'Clean'],
      Fermentation01: ['FermenterSet', 'Fermenter', 'Clean'],
      Distillation01: ['StillRun', 'Clean'],
      Processing01: ['TankProcessing', 'Barreling'],
      Milling01: ['Mill'],
    };

  // operation
  async function seedOperation(): Promise<void> {
    const unitProcedures = await client.unitProcedure.findMany();

    if (unitProcedures.length === 0) {
      console.warn("No UnitProcedures found. Please seed UnitProcedures first.");
      return;
    }

    // Seed class definitions for each Operation name
    for (const name of Object.values(EnumOperationName)) {
      // use the name (which is a value in the mapping) to get the key that matches from unitProcedureOperationsMap
      const unitProcedureName = Object.keys(unitProcedureOperationsMap).find(key => unitProcedureOperationsMap[key].includes(name));
      const unitProcedure = unitProcedures.find(up => up.name === unitProcedureName) as UnitProcedure;
      // const unitProcedure = getRandomArrayElement(unitProcedures) as any;
      try {
        const classDefinition = await client.operation.create({
          data: {
            createdBy: faker.internet.userName(),
            description: faker.commerce.productDescription(),
            name,
            abbreviation: faker.lorem.word(),
            path: `/${faker.helpers.slugify(name)}`,
            isClassDefinition: true,
            unitProcedure: {connect: {id: unitProcedure.id}},
            // Additional fields as necessary
          },
        });

        // Seed a few instances for the class definition
        const instancesCount = faker.number.int({ min: 1, max: 5 });
        for (let i = 0; i < instancesCount; i++) {
          await client.operation.create({
            data: {
              createdBy: faker.internet.userName(),
              description: `${classDefinition.description} - instance ${i + 1}`,
              name, // Same name as class definition
              path: classDefinition.path + `/instance-${i + 1}`,
              isClassDefinition: false,
              abbreviation: faker.lorem.word(),
              // classId: classDefinition.id,
              unitProcedure: { connect: { id: unitProcedure.id } },
              revision: i + 1, // Incremental revisions for instances
              // Additional fields as necessary
            },
          });
        }
      } catch (error) {
        console.error(error);
      }
    }

    console.log("Operations seeded successfully.");
  }

  // Test Parameter Handling
  async function seedTestParameterClasses(n: number=10): Promise<string[]> {
    const classIds = [];
    // First, create class definitions
    for (let i = 0; i < n; i++) {
      const testParameter = await client.testParameter.create({
        data: {
          name: faker.commerce.productName() + " Class",
          createdBy: faker.internet.userName(),
          isClassDef: true,
          active: faker.datatype.boolean(),
          description: faker.commerce.productDescription(),
          // Populate other fields as necessary, focusing on those relevant for class definitions
        },
      });
      classIds.push(testParameter.id);
    }
    return classIds;
  }

  async function seedTestParameterInstances(classIds: string[], n: number=10): Promise<void> {
    // Then, create instances linked to the class definitions
    for (const classId of classIds) {
      for (let i = 0; i < n; i++) {
        await client.testParameter.create({
          data: {
            name: faker.commerce.productName(),
            createdBy: faker.internet.userName(),
            classIdId: classId,
            active: faker.datatype.boolean(),
            description: faker.commerce.productDescription(),
            // testParamUnits: faker.helpers.randomize(Object.values(EnumTestParameterTestParamUnits)),
            // testSetpointType: faker.helpers.randomize(Object.values(EnumTestParameterTestSetpointType)),
            testParamUnits: EnumTestParameterTestParamUnits.Gal,
            testSetpointType: EnumTestParameterTestSetpointType.Boolean,
            testSetpointBooleanValue: faker.datatype.boolean(),
            // Populate other fields as necessary
          },
        });
      }
    }
  }

  async function seedTestParameter(n: number=10): Promise<void> {
    const classIds = await seedTestParameterClasses(Math.ceil(n / 10)); // Adjust the ratio as needed
    await seedTestParameterInstances(classIds, n - classIds.length);
    console.log(`${n} TestParameters created.`);
  }

  async function seedItemGroup(): Promise<void> {
    // Example item group names and optional descriptions
    const itemGroups = [
      { name: "Raw Materials", description: "Primary materials used in the production process." },
      { name: "Finished Products", description: "Completed goods ready for sale or distribution." },
      { name: "Consumables", description: "Items used during production that do not become part of the final product." },
      // Add more groups as needed
    ];

    for (const group of itemGroups) {
      await client.itemGroup.create({
        data: {
          name: group.name,
          description: group.description,
        },
      });
    }

    console.log(`${itemGroups.length} ItemGroup records created.`);
  }

  async function seedItem(n: number): Promise<void> {
    const itemGroups = await client.itemGroup.findMany();

    for (let i = 0; i < n; i++) {
      const itemGroup = getRandomArrayElement(itemGroups);
      const itemName = faker.commerce.productName();
      const itemNumber = `IN-${faker.number.int({ min: 1000, max: 9999 })}`;
      const itemRevision = `Rev-${faker.string.alphanumeric(3).toUpperCase()}`;
      const itemType = getRandomArrayElement(Object.values(EnumItemItemClass)) as any;

      await client.item.create({
        data: {
          active: faker.datatype.boolean(),
          createdBy: faker.internet.userName(),
          itemClass: getRandomArrayElement(Object.values(EnumItemItemClass)) as any,
          itemDescription: faker.commerce.productDescription(),
          itemGroup: itemGroup ? { connect: { id: itemGroup.id } } : undefined,
          itemName: itemName,
          itemNumber: itemNumber,
          itemRevision: itemRevision,
          itemType: itemType,
          schemaVersion: "0001-alpha",
          updatedBy: faker.internet.userName(),
          // Relations to BOMs and ProductionOrders are managed elsewhere or through application logic
        },
      });
    }

    console.log(`${n} Item records created.`);
  }

  async function seedPurchaseOrder(n: number): Promise<void> {
    // Assuming accounts, assets, and items have been seeded and their IDs are retrievable
    const accounts = await client.account.findMany();
    const assets = await client.asset.findMany();
    const items = await client.item.findMany();
    const testParams = await client.testParameter.findMany();

    if(accounts.length === 0 || items.length === 0 || assets.length === 0) {
      console.warn('Required related entities (Accounts or Items) not found. Please seed those first.');
      return;
    }

    for (let i = 0; i < n; i++) {
      const account = getRandomArrayElement(accounts) as any;
      const asset = getRandomArrayElement(assets) as any; // Optional relation
      const item = getRandomArrayElement(items) as any;
      const testParam1 = getRandomArrayElement(testParams) as any;
      const testParam2 = getRandomArrayElement(testParams) as any;

      try {
        await client.purchaseOrder.create({
          data: {
            name: faker.commerce.productName(),
            accountId: account.id,
            assetId: asset ? asset.id : null, // Nullable field
            className: faker.commerce.department(),
            complete: faker.datatype.boolean(),
            createdBy: faker.internet.userName(),
            grainType: faker.commerce.productMaterial(),
            itemId: item.id,
            orderQuantity: faker.number.int({ min: 1, max: 1000 }),
            units: getRandomArrayElement(['kg', 'lbs', 'tons']) as string, // Directly use JavaScript's method for random array element selection
            qualityTests: {
              connect: [
                {id: testParam1.id},
                {id: testParam2.id}
              ]
            }
          },
        });
      } catch (error) {
        console.error(error);
      }
    }

    console.log(`${n} PurchaseOrders created.`);
  }

  async function seedSalesOrder(n: number): Promise<void> {
    const accounts = await client.account.findMany();
    const items = await client.item.findMany();

    if (items.length === 0 || accounts.length === 0) {
      console.warn('Required related entities (Items) not found. Please seed those first.');
      return;
    }

    for (let i = 0; i < n; i++) {
      const account = getRandomArrayElement(accounts) as any; // Use the previously defined getRandomArrayElement function
      const item = getRandomArrayElement(items) as any;
      if (!item) continue; // Skip if no item is found, though this should not happen due to the earlier check
      try {
        await client.salesOrder.create({
          data: {
            accountId: account?.id,
            itemId: item.id,
            orderType: getRandomArrayElement(Object.values(EnumSalesOrderOrderType)) as EnumSalesOrderOrderType,
            quantity: faker.number.int({ min: 1, max: 1000 }),
            createdBy: faker.internet.userName(),
            // Populate other fields as needed
          },
        });
      } catch (error) {
        console.error(error);
      }
    }

    console.log(`${n} SalesOrders created.`);
  }

  async function seedItemReceipt(n: number): Promise<void> {
    const items = await client.item.findMany();
    const purchaseOrders = await client.purchaseOrder.findMany();

    for (let i = 0; i < n; i++) {
      const item = getRandomArrayElement(items) as any;
      const purchaseOrder = getRandomArrayElement(purchaseOrders) as any;
      const quantity = parseFloat(faker.commerce.price({min: 1, max: 100,dec: 2})); // Generate a decimal quantity between 1 and 100 with 2 decimal places
      try {
        await client.itemReceipt.create({
          data: {
            createdBy: faker.internet.userName(),
            driver: faker.person.fullName(),
            itemId: item ? item.id : null, // Associate with an Item, if available
            purchaseOrderId: purchaseOrder ? purchaseOrder.id : null, // Associate with a PurchaseOrder, if available
            quantity: new Prisma.Decimal(quantity), // Ensure quantity is treated as a decimal
            supplierLot: faker.string.uuid(),
            units: getRandomArrayElement(['kg', 'lbs', 'units']) as string, // Use an example unit type
            // Populate other fields as necessary
          },
        });
      } catch (error) {
        console.error(error);
      }
    }

    console.log(`${n} ItemReceipts created.`);
  }

  // lot
  async function seedLot(n: number): Promise<void> {
    const purchaseOrders = await client.purchaseOrder.findMany();

    for (let i = 0; i < n; i++) {
      const purchaseOrder = getRandomArrayElement(purchaseOrders) as any;

      // Ensure externalId and lotNumber are unique; consider a more robust uniqueness strategy for larger datasets
      const externalId = faker.string.uuid();
      const lotNumber = `LOT-${faker.string.uuid()}`;

      try {
        await client.lot.create({
          data: {
            createdBy: faker.internet.userName(),
            externalId,
            lotNumber,
            purchaseOrderAcceptedLotsId: purchaseOrder?.id,
            // Populate other fields as necessary
          },
        });
      } catch (error) {
        console.error(error);
      }
    }

    console.log(`${n} Lots created.`);
  }

  // boms
  async function seedBom(n: number): Promise<void> {

    for (let i = 0; i < n; i++) {
      const wipItems = await client.item.findMany({ select: { id: true } });
      const wipItemId = getRandomArrayElement(wipItems) as Item;
      try {
        await client.bom.create({
          data: {
            bomName: `BOM-${faker.string.uuid()}`,
            className: faker.commerce.productMaterial(),
            createdBy: faker.internet.userName(),
            // Optionally include wipItemId if it's meant to reference another entity
            wipItem: { connect: { id: wipItemId.id } },
            bomRevision: faker.number.int({ min: 0, max: 10 }),
            // Other fields like schemaVersion have default values and need not be explicitly set
          },
        });
      } catch (error) {
        console.error(error);
      }
    }

    console.log(`${n} BOMs created.`);
  }

  // phase paramters
  const equipmentPhaseToPhaseParameterMap: { [key: string]: string[] } = {
    PreSteam: ['TemperatureSetpoint'],
    CornAdd: [
      'Quantity',
      'Units',
    ],
    MaltAdd: [
      'Quantity',
      'Units',
    ],
    RyeAdd: [
      'Quantity',
      'Units',
    ],
    WheatAdd: [
      'Quantity',
      'Units',
    ],
    AdditiveAdd: [
      'Quantity',
      'Units',
      'ItemName',
    ],
    Prompt: [
      'Type',
      'Message',
      'Header',
      'Duration',
      'Units',
      'Confirmation',
    ],
    Hold: [
      'Duration',
      'Units'
    ],
    Steam: [
      'TemperatureSetpoint',
      'Duration',
      'Units',
    ],
    Cooldown: [
      'Duration',
      'Units',
      'TemperatureSetpoint',
    ],
    PhCapture: [
      'TODO'
    ],
    Drop: [
      'FlowSetpoint',
      'SprayballTime',
      'FlushTime',
    ],
    Rinse: [
      'Duration',
      'Units',
      'TemperatureSetpoint',
    ],
    DropTubToMashCooler: [
      'MashPumpSetpoint',
      'MidTemperatureSP',
      'OutTemperatureSP',
      'MashCoolerEnable',
    ],
    Fill: [
      'LevelSetpoint',
      'AgitationSpeed',
      'TemperatureSetpoint',
    ],
    FermDrop: [
      'LevelSetpoint',
    ],
    FermSteam: [
      'TemperatureSetpoint',
      'Duration',
      'Units',
    ],
    DropLineSteam: [
      'TemperatureSetpoint',
      'Duration',
      'Units',
    ],
    DropTubSteam: [
      'TemperatureSetpoint',
      'Duration',
      'Units',
    ],
    CoolerSteam: [
      'TemperatureSetpoint',
      'Duration',
      'Units',
    ],
    StillRun: [
      'TowerWaterTemperatureSetpoint',
      'TowerWaterFlowSetpoint',
      'HighWineCondenserTowerWaterTemperatureSetpoint',
      'LowWineProof',
      'HighWineProof',
    ],
  }
  async function seedPhaseParameter(total: number): Promise<void> {
    // Fetch EquipmentPhase IDs if needed for linking
    const equipmentPhases = await client.equipmentPhase.findMany();

    const classRatio = 0.2; // Ratio of class definitions
    const numClasses = Math.round(total * classRatio);
    const classIds: string[] = [];

    for (let i = 0; i < total; i++) {
      const isClassDef = i < numClasses;
      // Use the equipmentPhaseToPhaseParameter mapping to get a random PhaseParameter name
      const name = getRandomArrayElement(getRandomArrayElement(Object.values(equipmentPhaseToPhaseParameterMap)) as string[]) as string;

      const equipmentPhaseName = Object.keys(equipmentPhaseToPhaseParameterMap).find(key => equipmentPhaseToPhaseParameterMap[key].includes(name));
      const equipmentPhase = equipmentPhases.find(ep => ep.name === equipmentPhaseName) as EquipmentPhase;

      const phaseParameter = await client.phaseParameter.create({
        data: {
          createdBy: faker.internet.userName(),
          name: name,
          description: faker.commerce.productDescription(),
          isClassDef: isClassDef,
          active: faker.datatype.boolean(),
          units: getRandomArrayElement(['kg', 'lbs', 'units']) as string,
          setpointType: getRandomArrayElement(Object.values(EnumPhaseParameterSetpointType)) as EnumPhaseParameterSetpointType,
          setpointNumericalValue: faker.number.float({ min: 0, max: 100 }),
          // Optional linking to an EquipmentPhase
          ...(equipmentPhase && {
            equipmentPhase: {
              connect: { id: equipmentPhase.id },
            },
          }),
          // Connect instances to a class definition if available
          ...(isClassDef ? {} : {
            classId: {
              connect: { id: getRandomArrayElement(classIds) },
            },
          }),
          revision: faker.number.int({ min: 0, max: 10 }),
        },
      });

      // Collect class definition IDs to use for instances
      if (isClassDef) {
        classIds.push(phaseParameter.id);
      }
    }

    console.log(`${total} PhaseParameters (classes and instances) created.`);
  }

  const operationEquipmentPhasesMap: { [key: string]: string[] } = {
    Cook: [
      'PreSteam',
      'Steam',
      'Hold',
      'BacksetAdd',
      'WaterAdd',
      'AdditiveAdd',
      'CornAdd',
      'MaltAdd',
      'RyeAdd',
      'WheatAdd',
      'Drop',
      'PhCapture',
      'Prompt',
      'Rinse',
      'Cooldown',
      'HotFlush',
      'CIP',
    ],
    FermenterSet: [
      'DropToMashCooler',
      'Fill',
    ],
    Fermenter: [
      'Run',
    ],
    Clean: [
      'FermenterSteam',
      'CoolerSteam',
      'DropTubSteam',
      'DropLineSteam'
    ],
    StillRun: ['StillStartup', 'StillRun', 'StillShutdown'],
    TankProcessing: ['Cut', 'Hold', 'Gauge'],
    Barreling: ['BarrelFill'],
    Mill: ['Mill'],
  };

  // equipment phase
  async function seedEquipmentPhase(): Promise<void> {
    const operations = await client.operation.findMany();

    if (operations.length === 0) {
      console.warn("No Operations found. Please seed Operations first.");
      return;
    }

    // Seed class definitions for each EquipmentPhase name
    for (const name of Object.values(EnumEquipmentPhaseName)) {
      // use name to get the key that matches from operationEquipmentPhasesMap
      const operationName = Object.keys(operationEquipmentPhasesMap).find(key => operationEquipmentPhasesMap[key].includes(name));
      const operation = operations.find(op => op.name === operationName) as Operation;
      try {
        // const operation = getRandomArrayElement(operations) as any;
        const classDefinition = await client.equipmentPhase.create({
          data: {
            createdBy: faker.internet.userName(),
            description: faker.lorem.sentence(),
            name,
            operation: { connect: { id: operation.id } },
            isClassDefinition: true,
            // Additional fields as necessary
          },
        });

        // Seed instances for the class definition
        const instancesCount = faker.number.int({ min: 1, max: 5 });
        for (let i = 0; i < instancesCount; i++) {
          await client.equipmentPhase.create({
            data: {
              createdBy: faker.internet.userName(),
              description: `${classDefinition.description} - instance ${i + 1}`,
              name, // Same name as class definition
              operation: { connect: { id: operation.id } },
              // classId: classDefinition.id,
              isClassDefinition: false,
              revision: i + 1, // Incremental revisions for instances
              // Additional fields as necessary
            },
          });
        }

      } catch (error) {
        console.error(error);
      }
    }

    console.log("EquipmentPhases seeded successfully.");
  }

  async function seedRecipe(n: number): Promise<void> {
    const items = await client.item.findMany();
    const customerIds = ["CUST-1001", "CUST-1002", "CUST-1003"];  // Example customer IDs

    for (let i = 0; i < n; i++) {
      const item = getRandomArrayElement(items) as Item;
      const customerId = getRandomArrayElement(customerIds) as string;

      try {
        await client.recipe.create({
          data: {
            createdBy: faker.internet.userName(),
            customerId: customerId,
            itemId: item.id,
            Recipe: `Recipe-${faker.commerce.productName()}`,
            itemDescription: item.itemDescription || faker.commerce.productDescription(),
            // recipeGroupId: recipeGroup ? recipeGroup.id : undefined,
            revision: faker.datatype.number({ min: 0, max: 10 }),
            schemaVersion: "0001-b",
            updatedBy: faker.internet.userName(),
            // Additional attributes as needed
          },
        });
      } catch (error) {
        console.error(error);
      }
    }

    console.log(`${n} Recipe records created.`);
  }

  async function seedRecipeGroup(n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      const recipeBaseName = faker.commerce.productMaterial();  // Base name for recipe group
      const revisionNumber = faker.datatype.number({ min: 1, max: 5 });

      try {
        await client.recipeGroup.create({
          data: {
            createdBy: faker.internet.userName(),
            recipe: `${recipeBaseName} Type`,
            revision: revisionNumber,
            schemaVersion: "0001-alpha",
            updatedBy: faker.internet.userName(),
            // The actual link to recipes can be dynamically managed based on specific business logic
          },
        });
      } catch (error) {
        console.error(error);
      }
    }

    console.log(`${n} RecipeGroup records created.`);
  }

  async function seedProductionOrder(n: number): Promise<void> {
    const items = await client.item.findMany();
    const salesOrders = await client.salesOrder.findMany();

    for (let i = 0; i < n; i++) {
      const item = getRandomArrayElement(items) as Item;
      const salesOrder = getRandomArrayElement(salesOrders) as SalesOrder;

      try {
        await client.productionOrder.create({
          data: {
            className: faker.commerce.productName(),
            createdBy: faker.internet.userName(),
            endDate: faker.date.future(),
            item: {
              connect: {id: item.id},
            },
            salesOrder: {
              connect: {id: salesOrder.id},
            },
            productionOrderQueueId: faker.string.uuid(),
            startDate: faker.date.past(),
            state: getRandomArrayElement(["Planned", "InProgress", "Completed"]) as string,
            status: EnumProductionOrderStatus.Planned, // Adjust based on your enum
            // batches: sampleBatches,
            // Populate other fields as necessary
          },
        });
      } catch (error) {
        console.error(error);
      }
    }
  }

  async function seedScheduleOrder(n: number): Promise<void> {
    const recipes = await client.recipe.findMany();
    const recipeGroups = await client.recipeGroup.findMany();
    const productionOrders = await client.productionOrder.findMany();

    for (let i = 0; i < n; i++) {
      const recipe = getRandomArrayElement(recipes) as Recipe;
      const recipeGroup = getRandomArrayElement(recipeGroups) as RecipeGroup;
      const productionOrder1 = getRandomArrayElement(productionOrders) as ProductionOrder;
      const productionOrder2 = getRandomArrayElement(productionOrders) as ProductionOrder;
      const productionOrder3 = getRandomArrayElement(productionOrders) as ProductionOrder;
      try {
        await client.scheduleOrder.create({
          data: {
            createdBy: faker.internet.userName(),
            estimatedMashingTime: faker.number.int({min: 60, max: 480}), // in minutes
            estimatedFermentationTime: faker.number.int({min: 1000, max: 10080}), // in minutes
            estimatedDistillationTime: faker.number.int({min: 120, max: 1440}), // in minutes
            estimatedProcessing: faker.number.int({min: 30, max: 300}), // in minutes
            estimatedTotalProductionTime: faker.number.int({min: 2000, max: 12000}), // in minutes
            productionOrderAllocation: JSON.stringify({orderId: faker.string.uuid()}),
            scheduleOrderRecipe: {connect: {id: recipe.id}},
            recipeGroup: {connect: {id: recipeGroup.id}},
            recipeName: recipe ? recipe.Recipe : faker.string.uuid(),
            status: getRandomArrayElement(Object.values(EnumScheduleOrderStatus)),
            totalBarrels: faker.number.int({min: 10, max: 100}),
            totalProofGallons: faker.number.int({min: 500, max: 5000}),
            updatedBy: faker.internet.userName(),
            productionOrders: {
              connect: [
                {id: productionOrder1.id},
                {id: productionOrder2.id},
                {id: productionOrder3.id},
              ]
            }
          }
        });
      } catch (error) {
        console.error(error);
      }
    }

    console.log(`${n} ScheduleOrder records created.`);
  }

  async function seedProductionSchedule(n: number): Promise<void> {
    const scheduleOrders = await client.scheduleOrder.findMany();
    const scheduleQueues = await client.scheduleOrderQueue.findMany();

    for (let i = 0; i < n; i++) {
      const scheduleOrder = getRandomArrayElement(scheduleOrders) as ScheduleOrder;
      const scheduleQueue = getRandomArrayElement(scheduleQueues) as ScheduleOrderQueue;
      const daysAhead = faker.number.int({min: 1, max: 30});
      const estimatedStart = faker.date.soon({days: daysAhead});
      const duration = faker.number.int({min: 1, max: 24}); // duration in hours
      const estimatedEnd = new Date(estimatedStart.getTime() + duration * 60 * 60 * 1000);

      try {
        await client.productionSchedule.create({
          data: {
            createdBy: faker.internet.userName() + " " + faker.name.lastName(),
            estimatedStart: estimatedStart,
            estimatedEnd: estimatedEnd,
            actualStart: faker.date.soon({days: daysAhead}),
            actualEnd: new Date(estimatedStart.getTime() + (duration + faker.number.int({min: -2, max: 2})) * 60 * 60 * 1000), // actual end time might slightly vary
            duration: duration,
            scheduleOrderId: scheduleOrder ? scheduleOrder.id : undefined,
            scheduleQueueId: scheduleQueue ? scheduleQueue.id : undefined,
            updatedBy: faker.internet.userName(),
          },
        });
      } catch (error) {
        console.error(error);
      }
    }

    console.log(`${n} ProductionSchedule records created.`);
  }

  async function seedScheduleOrderQueue(n: number): Promise<void> {
    const productionSchedules = await client.productionSchedule.findMany();

    for (let i = 0; i < n; i++) {
      const productionSchedule = getRandomArrayElement(productionSchedules) as ProductionSchedule;

      try {
        await client.scheduleOrderQueue.create({
          data: {
            createdBy: faker.internet.userName(),
            productionSchedule: {connect: { id: productionSchedule.id } },
            queueIndex: i,
            updatedBy: faker.internet.userName(),
          },
        });
      } catch (error) {
        console.error(error);
      }
    }

    console.log(`${n} ScheduleOrderQueue records created.`);
  }

  const seedFunctions: SeedFunctions = {
    User: seedUser, // Store the function reference itself
    Procedure: seedProcedure,
    UnitProcedure: seedUnitProcedure,
    Operation: seedOperation,
    TestParameter: seedTestParameter,
    PhaseParameter: seedPhaseParameter,
    Bom: seedBom,
    EquipmentPhase: seedEquipmentPhase,
    ItemGroup: seedItemGroup,
    Item: seedItem,
    Recipe: seedRecipe,
    RecipeGroup: seedRecipeGroup,
    ScheduleOrder: seedScheduleOrder,
    ProductionSchedule: seedProductionSchedule,
    ScheduleOrderQueue: seedScheduleOrderQueue,
    ProductionOrder: seedProductionOrder,
    Lot: seedLot,
    ItemReceipt: seedItemReceipt,
    PurchaseOrder: seedPurchaseOrder,
    SalesOrder: seedSalesOrder,
    Account: seedAccount,
    Asset: seedAsset,
  }

  async function dynamicSeed(entityType: EntityType, n = 10): Promise<void> {
    const seedFunction = seedFunctions[entityType];
    if (!seedFunction) {
      console.error(`No seeding function found for entity type: ${entityType}`);
      return;
    }

    await seedFunction(n);
  }

  const numberOfEntitiesToSeed = 100;
  await dynamicSeed('User', numberOfEntitiesToSeed);
  await dynamicSeed('Asset', numberOfEntitiesToSeed);
  await dynamicSeed('Account', numberOfEntitiesToSeed);
  await dynamicSeed('Procedure', numberOfEntitiesToSeed);
  await dynamicSeed('UnitProcedure', numberOfEntitiesToSeed);
  await dynamicSeed('Operation', numberOfEntitiesToSeed);
  await dynamicSeed('TestParameter', numberOfEntitiesToSeed);
  await dynamicSeed('PhaseParameter', numberOfEntitiesToSeed);
  await dynamicSeed('ItemGroup', numberOfEntitiesToSeed);
  await dynamicSeed('Item', numberOfEntitiesToSeed);
  await dynamicSeed('PurchaseOrder', numberOfEntitiesToSeed);
  await dynamicSeed('SalesOrder', numberOfEntitiesToSeed);
  await dynamicSeed('ItemReceipt', numberOfEntitiesToSeed);
  await dynamicSeed('Lot', numberOfEntitiesToSeed);
  await dynamicSeed('Bom', numberOfEntitiesToSeed);
  await dynamicSeed('EquipmentPhase', numberOfEntitiesToSeed);
  await dynamicSeed('Recipe', numberOfEntitiesToSeed);
  await dynamicSeed('RecipeGroup', numberOfEntitiesToSeed);
  await dynamicSeed('ProductionOrder', numberOfEntitiesToSeed);
  await dynamicSeed('ScheduleOrder', numberOfEntitiesToSeed);
  await dynamicSeed('ProductionSchedule', numberOfEntitiesToSeed);
  await dynamicSeed('ScheduleOrderQueue', numberOfEntitiesToSeed);

  client.$disconnect();
}
