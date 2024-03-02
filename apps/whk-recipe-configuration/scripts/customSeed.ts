// import {Prisma, PrismaClient} from "@prisma/client";

import {
  EnumPhaseParameterSetpointType,
  EnumTestParameterTestParamUnits, EnumTestParameterTestSetpointType, Operation,
  PrismaClient
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
  function generateUniqueName(baseName: string): string {
    return `${baseName}-${faker.string.uuid()}`;
  }

  async function seedProcedureClasses(n: number): Promise<string[]> {
    let classIds = [];

    for (let i = 0; i < n; i++) {
      const procedure = await client.procedure.create({
        data: {
          createdBy: faker.internet.userName(),
          name: generateUniqueName("Class"),
          isClassDefinition: true,
          active: true, // Assuming class definitions are active
          description: faker.commerce.productDescription(),
          revision: faker.number.int({ min: 0, max: 10 }),
          // Populate other fields as needed
        },
      });
      classIds.push(procedure.id);
    }

    return classIds; // Return the IDs of created class definitions for linking instances
  }

  async function seedProcedureInstances(classIds: string[], n: number): Promise<void> {
    for (const classId of classIds) {
      for (let i = 0; i < n; i++) {
        await client.procedure.create({
          data: {
            createdBy: faker.internet.userName(),
            classIdId: classId,
            isClassDefinition: false,
            name: generateUniqueName("Instance"),
            active: faker.datatype.boolean(),
            description: faker.commerce.productDescription(),
            revision: faker.number.int({ min: 0, max: 10 }),
            // Populate other fields as needed
          },
        });
      }
    }
  }

  async function seedProcedure(n: number): Promise<void> {
    const classIds = await seedProcedureClasses(Math.ceil(n / 5)); // Adjust ratio as needed
    await seedProcedureInstances(classIds, n - classIds.length); // Seed remaining as instances
    console.log(`${n} Procedures (classes and instances) created.`);
  }

  // Unit Procedure
  async function seedUnitProcedure(total: number): Promise<void> {
    // Fetch Procedure IDs
    const procedures = await client.procedure.findMany({
      select: { id: true },
    });
    const procedureIds = procedures.map(proc => proc.id);

    if (procedureIds.length === 0) {
      console.warn('No Procedures found. Please seed Procedures first.');
      return;
    }

    const classRatio = 0.3; // Ratio of class definitions
    const numClasses = Math.round(total * classRatio);
    let classIds: string[] = [];

    for (let i = 0; i < total; i++) {
      const isClassDefinition = i < numClasses;
      const procedureId = getRandomArrayElement(procedureIds); // Randomly select a Procedure ID
      if (!procedureId) continue; // Skip if no Procedure ID is found

      const unitProcedure = await client.unitProcedure.create({
        data: {
          createdBy: faker.internet.userName(),
          name: isClassDefinition ? `Class-${faker.commerce.productName()}` : `Instance-${faker.commerce.productName()}`,
          description: faker.commerce.productDescription(),
          isClassDef: isClassDefinition,
          active: faker.datatype.boolean(),
          procedure: {
            connect: { id: procedureId },
          },
          ...(isClassDefinition ? {} : { classId: { connect: { id: getRandomArrayElement(classIds) || undefined } } }), // Connect to a random classId if it's an instance
          revision: faker.number.int(10),
        },
      });

      if (isClassDefinition) {
        classIds.push(unitProcedure.id); // Collect new class definition IDs to use for instances
      }
    }

    console.log(`${total} UnitProcedures (classes and instances) created.`);
  }

  // operation
  async function seedOperation(total: number): Promise<void> {
    // Fetch UnitProcedure IDs
    const unitProcedures = await client.unitProcedure.findMany({
      select: { id: true }, // Only fetch the IDs to minimize data transfer
    });
    const unitProcedureIds = unitProcedures.map(up => up.id);

    if (unitProcedureIds.length === 0) {
      console.warn('No UnitProcedures found. Please seed UnitProcedures first.');
      return;
    }

    const classRatio = 0.3; // Example ratio of class definitions
    const numClasses = Math.round(total * classRatio);

    for (let i = 0; i < total; i++) {
      const isClassDefinition = i < numClasses;
      const unitProcedureId = getRandomArrayElement(unitProcedureIds); // Randomly select a UnitProcedure ID
      if (isClassDefinition) {
        await client.operation.create({
          data: {
            createdBy: faker.internet.userName(),
            name: `${isClassDefinition ? 'Class' : 'Instance'}-${faker.word.noun()}-${faker.string.uuid()}`,
            abbreviation: faker.string.alphanumeric(3).toUpperCase(),
            description: faker.commerce.productDescription(),
            path: `/${isClassDefinition ? 'class' : 'instance'}/${faker.word.noun()}`,
            isClassDefinition: isClassDefinition,
            active: faker.datatype.boolean(),
            unitProcedure: {
              connect: { id: unitProcedureId },
            },
            // Set additional fields as needed
            procedureSequenceIndex: faker.number.int({ min: 1, max: 100 }),
            revision: faker.number.int({ min: 0, max: 10 }),
          },
        });
      } else {
        // get classId from Operation
        const classIds = await client.operation.findMany();
        const randomClassId = getRandomArrayElement(classIds) as any;
        await client.operation.create({
          data: {
            createdBy: faker.internet.userName(),
            name: `${isClassDefinition ? 'Class' : 'Instance'}-${faker.word.noun()}-${faker.string.uuid()}`,
            abbreviation: faker.string.alphanumeric(3).toUpperCase(),
            description: faker.commerce.productDescription(),
            path: `/${isClassDefinition ? 'class' : 'instance'}/${faker.word.noun()}`,
            isClassDefinition: isClassDefinition,
            active: faker.datatype.boolean(),
            unitProcedure: {
              connect: { id: unitProcedureId },
            },
            classId: { connect: { id: randomClassId.id } }, // Connect to a random classId if it's an instance
            procedureSequenceIndex: faker.number.int({ min: 1, max: 100 }),
            revision: faker.number.int({ min: 0, max: 10 }),
          },
        });
      }
    }

    console.log(`${total} Operations (classes and instances) created.`);
  }

  // Test Parameter Handling
  async function seedTestParameterClasses(n: number=10): Promise<string[]> {
    let classIds = [];
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
    let classIds: string[] = [];

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
  async function seedEquipmentPhase(total: number): Promise<void> {
    // Fetch necessary relations
    const operations = await client.operation.findMany({ select: { id: true } });
    const boms = await client.bom.findMany({ select: { id: true } });

    if (operations.length === 0) {
      console.warn('No Operations found. Please seed Operations first.');
      return;
    }

    const classRatio = 0.3; // Ratio of class definitions
    const numClasses = Math.round(total * classRatio);
    let classIds: string[] = [];

    for (let i = 0; i < total; i++) {
      const isClassDefinition = i < numClasses;
      const operation = getRandomArrayElement(operations) as Operation;
      const bom = getRandomArrayElement(boms)

      const equipmentPhase = await client.equipmentPhase.create({
        data: {
          createdBy: faker.internet.userName(),
          name: `${isClassDefinition ? 'Class' : 'Instance'}-${faker.commerce.productName()}-${faker.string.uuid()}`,
          isClassDefinition,
          active: faker.datatype.boolean(),
          operation: {
            connect: { id: operation.id },
          },
          ...(bom && {
            bom: {
              connect: { id: bom.id },
            },
          }),
          ...(isClassDefinition ? {} : {
            classId: {
              connect: { id: getRandomArrayElement(classIds) },
            },
          }),
          description: faker.commerce.productDescription(),
          revision: faker.number.int({ min: 0, max: 10 }),
        },
      });

      if (isClassDefinition) {
        classIds.push(equipmentPhase.id); // Collect new class definition IDs to use for instances
      }
    }

    console.log(`${total} EquipmentPhases (classes and instances) created.`);
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
