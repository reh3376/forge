// import {Prisma, PrismaClient} from "@prisma/client";

import {
  EnumEquipmentPhaseName,
  EnumOperationName,
  EnumPhaseParameterSetpointType, EnumProcedureName,
  EnumTestParameterTestParamUnits, EnumTestParameterTestSetpointType, EnumUnitProcedureName, Operation, PhaseParameter,
  PrismaClient,
} from "@prisma/client";
import {faker} from "@faker-js/faker";
import { hash } from "bcrypt";

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
  type EntityType = 'User' | "Procedure" | "UnitProcedure" | "Operation" | "TestParameter" | "Bom" | "PhaseParameter" | "EquipmentPhase";
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

  async function seedProcedure(n: number): Promise<void> {
    const classDefinitions = [];

    // Assume EnumProcedureName has limited values, adjust as necessary
    const procedureNames = Object.values(EnumProcedureName);

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

    // Step 2: Seed instances for each class definition
    for (const classDefinition of classDefinitions) {
      await client.procedure.create({
        data: {
          createdBy: faker.internet.userName(),
          description: faker.lorem.sentences(),
          name: classDefinition.name,
          // classId: classDefinition.id,
          isClassDefinition: false,
          revision: faker.datatype.number({ min: 1, max: 10 }), // Assume instances can have varying revisions
          // Optionally set active and other fields as necessary
        },
      });
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
      await client.unitProcedure.create({
        data: {
          createdBy: faker.internet.userName(),
          name: name,
          isClassDef: true,
          procedure: { connect: { id: procedureId } },
          revision: 0, // Initial revision for class definitions
          // Additional fields as necessary
        },
      });

      // Seed instances for the class definition
      const instancesCount = faker.datatype.number({ min: 1, max: 5 });
      for (let i = 0; i < instancesCount; i++) {
        await client.unitProcedure.create({
          data: {
            createdBy: faker.internet.userName(),
            name: name, // Same name as class definition
            isClassDef: false,
            // classId: classDefinition.id,
            procedure: { connect: { id: procedureId } },
            revision: i + 1, // Incremental revisions for instances
            // Additional fields as necessary
          },
        });
      }
    }

    console.log("UnitProcedures seeded.");
  }
  // operation
  async function seedOperation(): Promise<void> {
    const unitProcedures = await client.unitProcedure.findMany();

    if (unitProcedures.length === 0) {
      console.warn("No UnitProcedures found. Please seed UnitProcedures first.");
      return;
    }

    // Seed class definitions for each Operation name
    for (const name of Object.values(EnumOperationName)) {
      const unitProcedure = getRandomArrayElement(unitProcedures) as any;
      const classDefinition = await client.operation.create({
        data: {
          createdBy: faker.internet.userName(),
          description: faker.commerce.productDescription(),
          name,
          abbreviation: faker.lorem.word(),
          path: `/${faker.helpers.slugify(name)}`,
          isClassDefinition: true,
          unitProcedure: { connect: { id: unitProcedure.id } },
          // Additional fields as necessary
        },
      });

      // Seed a few instances for the class definition
      const instancesCount = faker.datatype.number({ min: 1, max: 5 });
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

  // boms
  async function seedBom(n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      await client.bom.create({
        data: {
          bomName: `BOM-${faker.string.uuid()}`,
          className: faker.commerce.productMaterial(),
          createdBy: faker.internet.userName(),
          // Optionally include wipItemId if it's meant to reference another entity
          wipItemId: faker.string.alphanumeric(10), // Assume it's a simple alphanumeric string
          bomRevision: faker.number.int({ min: 0, max: 10 }),
          // Other fields like schemaVersion have default values and need not be explicitly set
        },
      });
    }

    console.log(`${n} BOMs created.`);
  }

  // phase paramters
  async function seedPhaseParameter(total: number): Promise<void> {
    // Fetch EquipmentPhase IDs if needed for linking
    const equipmentPhases = await client.equipmentPhase.findMany({ select: { id: true } });

    const classRatio = 0.2; // Ratio of class definitions
    const numClasses = Math.round(total * classRatio);
    const classIds: string[] = [];

    for (let i = 0; i < total; i++) {
      const isClassDef = i < numClasses;
      const equipmentPhase = equipmentPhases.length > 0 ? getRandomArrayElement(equipmentPhases) : null;

      const phaseParameter = await client.phaseParameter.create({
        data: {
          createdBy: faker.internet.userName(),
          name: `${isClassDef ? 'Class' : 'Instance'}-${faker.commerce.productName()}-${faker.string.uuid()}`,
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

  // equipment phase
  async function seedEquipmentPhase(): Promise<void> {
    const operations = await client.operation.findMany();

    if (operations.length === 0) {
      console.warn("No Operations found. Please seed Operations first.");
      return;
    }

    // Seed class definitions for each EquipmentPhase name
    for (const name of Object.values(EnumEquipmentPhaseName)) {
      const operation = getRandomArrayElement(operations) as any;
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
      const instancesCount = faker.datatype.number({ min: 1, max: 5 });
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
    }

    console.log("EquipmentPhases seeded successfully.");
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
  await dynamicSeed('Procedure', numberOfEntitiesToSeed);
  await dynamicSeed('UnitProcedure', numberOfEntitiesToSeed);
  await dynamicSeed('Operation', numberOfEntitiesToSeed);
  await dynamicSeed('TestParameter', numberOfEntitiesToSeed);
  await dynamicSeed('PhaseParameter', numberOfEntitiesToSeed);
  await dynamicSeed('Bom', numberOfEntitiesToSeed);
  await dynamicSeed('EquipmentPhase', numberOfEntitiesToSeed);

  client.$disconnect();
}
