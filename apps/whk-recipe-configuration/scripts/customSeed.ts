import {Prisma, PrismaClient} from "@prisma/client";

const _CLIENT = new PrismaClient();

function selectRandomId(ids: string[]): string {
  const randomIndex = Math.floor(Math.random() * ids.length);
  return ids[randomIndex];
}

async function getAllProcedureIds() {
  const procedures = await _CLIENT.procedure.findMany({
    select: {
      id: true // Select only the 'id' field
    }
  });

  return procedures.map(p => p.id);
}

async function getAllUnitProcedureIds() {
  const unitProcedures = await _CLIENT.unitProcedure.findMany({
    select: {
      id: true // Select only the 'id' field
    }
  });

  return unitProcedures.map(p => p.id);
}

async function getAllOperationIds() {
  const operations = await _CLIENT.operation.findMany({
    select: {
      id: true // Select only the 'id' field
    }
  });

  return operations.map(p => p.id);
}

async function getAllBomIds() {
  const boms = await _CLIENT.bom.findMany({
    select: {
      id: true // Select only the 'id' field
    }
  });

  return boms.map(p => p.id);
}

async function getAllEpIds() {
  const eps = await _CLIENT.equipmentPhase.findMany({
    select: {
      id: true // Select only the 'id' field
    }
  });

  return eps.map(p => p.id);
}

export async function customSeed() {
  const client = new PrismaClient();
  const username = "admin";

  //replace this sample code to populate your database
  //with data that is required for your service to start
  await client.user.update({
    where: { username: username },
    data: {
      username,
    },
  });

  try {
    await client.procedure.create({
      data: {
        active: true,
        createdBy: "pmannion",
        description: "Whiskey House - Kentucky Whiskey Production Line",
        isClassDefinition: true,
        name: "Distillery01",
        revision: 1,
        schemaVersion: "0001-b",
        updatedBy: "pmannion"
      }
    });
  } catch (error) {
    console.error("Error creating EquipmentPhase:", error);
    // Handle the error appropriately here
    // For example, you might want to check if it's a foreign key constraint error:
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        console.error("There is a unique constraint violation, a new EquipmentPhase cannot be created.");
      } else if (error.code === 'P2003') {
        console.error("There is a foreign key constraint violation.");
      }
      // Add more error codes as needed
    }
  }

  const procedures = await client.procedure.findMany({
    select: {
      id: true // Select only the 'id' field
    }
    });

  const procedureIds = await getAllProcedureIds();
  const randomProcedureId = selectRandomId(procedureIds)
  try {
    await client.unitProcedure.create({
      data: {
        active: true,
        createdBy: "pmannion",
        description: "Mashing Area Producedure",
        isClassDef: true,
        name: "Mashing",
        procedureId: procedures[0].id,
        revision: 1,
        schemaVersion: "0001-b",
        updatedBy: "pmannion"
      }
    });
    await client.unitProcedure.create({
      data: {
        active: true,
        createdBy: "pmannion",
        description: "Fermentation Area Producedure",
        isClassDef: true,
        name: "Fermentation",
        procedureId: procedures[0].id,
        revision: 1,
        schemaVersion: "0001-b",
        updatedBy: "pmannion"
      }
    });

    await client.unitProcedure.create({
      data: {
        active: true,
        createdBy: "pmannion",
        description: "Distillation Area Producedure",
        isClassDef: true,
        name: "Distillation",
        procedureId: procedures[0].id,
        revision: 1,
        schemaVersion: "0001-b",
        updatedBy: "pmannion"
      }
    });
  } catch (error) {
    console.error("Error creating EquipmentPhase:", error);
    // Handle the error appropriately here
    // For example, you might want to check if it's a foreign key constraint error:
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        console.error("There is a unique constraint violation, a new EquipmentPhase cannot be created.");
      } else if (error.code === 'P2003') {
        console.error("There is a foreign key constraint violation.");
      }
      // Add more error codes as needed
    }
  }



  const unitProcedureIds = await getAllUnitProcedureIds();
  const randomUnitProcedureId = selectRandomId(unitProcedureIds)
  try {
    await client.operation.create({
      data: {
        abbreviation: "MAS",
        active: true,
        createdBy: "pmannion",
        description: "Cooking Vessel Cook",
        editedBy: "pmannion",
        isClassDefinition: true,
        revision: 5,
        name: "Cook",
        path: "WH/WHK01/Mashing01",
        procedureSequenceIndex: 99,
        schemaVersion: "0001-alpha",
        unitProcedureId: randomUnitProcedureId,
      }
    });
  } catch (error) {
    console.error("Error creating EquipmentPhase:", error);
    // Handle the error appropriately here
    // For example, you might want to check if it's a foreign key constraint error:
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        console.error("There is a unique constraint violation, a new EquipmentPhase cannot be created.");
      } else if (error.code === 'P2003') {
        console.error("There is a foreign key constraint violation.");
      }
      // Add more error codes as needed
    }
  }

  try {
    await client.testParameter.create({
      data: {
        active: true,
        createdBy: "creator1",
        description: "Test Parameter description 1",
        editedBy: "editor1",
        isClassDef: true,
        name: "Test Parameter Name 1",
        schemaVersion: "0001-b",
        testDetails: "Test Details 1",
        testParamRevision: "Revision1",
        testParamUnits: "Gal",
        testSetpointLowerLimit: 0.1,
        testSetpointType: "Numerical",
        testSetpointUpperLimit: 1,
        testSetpointValue: 0.5,
        tooltip: "Tooltip 1"
      }
    });
    await client.testParameter.create({
      data: {
        active: true,
        createdBy: "creator2",
        description: "Test Parameter description 2",
        editedBy: "editor2",
        isClassDef: true,
        name: "Test Parameter Name 2",
        schemaVersion: "0001-b",
        testDetails: "Test Details 2",
        testParamRevision: "Revision2",
        testParamUnits: "Gal",
        testSetpointLowerLimit: 0.2,
        testSetpointType: "Numerical",
        testSetpointUpperLimit: 1.1,
        testSetpointValue: 0.6,
        tooltip: "Tooltip 2"
      }
    });
    await client.testParameter.create({
      data: {
        active: true,
        createdBy: "creator3",
        description: "Test Parameter description 3",
        editedBy: "editor3",
        isClassDef: true,
        name: "Test Parameter Name 3",
        schemaVersion: "0001-b",
        testDetails: "Test Details 3",
        testParamRevision: "Revision3",
        testParamUnits: "Gal",
        testSetpointLowerLimit: 0.3,
        testSetpointType: "Numerical",
        testSetpointUpperLimit: 1.2,
        testSetpointValue: 0.7,
        tooltip: "Tooltip 3"
      }
    });
  } catch (error) {
    console.error("Error creating EquipmentPhase:", error);
    // Handle the error appropriately here
    // For example, you might want to check if it's a foreign key constraint error:
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        console.error("There is a unique constraint violation, a new EquipmentPhase cannot be created.");
      } else if (error.code === 'P2003') {
        console.error("There is a foreign key constraint violation.");
      }
      // Add more error codes as needed
    }
  }

  // Boms
  try {
    await client.bom.create({
      data: {
        bomName: "Bom Name 1",
        bomRevision: 0,
        className: "Class Name 1",
        createdBy: "creator1",
        editedBy: "editor1",
        schemaVersion: "0001-alpha",
        wipItemId: "wipId1"
      }
    });
    await client.bom.create({
      data: {
        bomName: "Bom Name 2",
        bomRevision: 1,
        className: "Class Name 2",
        createdBy: "creator2",
        editedBy: "editor2",
        schemaVersion: "0001-alpha",
        wipItemId: "wipId2"
      }
    });
    await client.bom.create({
      data: {
        bomName: "Bom Name 3",
        bomRevision: 2,
        className: "Class Name 3",
        createdBy: "creator3",
        editedBy: "editor3",
        schemaVersion: "0001-alpha",
        wipItemId: "wipId3"
      }
    });
  } catch (error) {
    console.error("Error creating EquipmentPhase:", error);
    // Handle the error appropriately here
    // For example, you might want to check if it's a foreign key constraint error:
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        console.error("There is a unique constraint violation, a new EquipmentPhase cannot be created.");
      } else if (error.code === 'P2003') {
        console.error("There is a foreign key constraint violation.");
      }
      // Add more error codes as needed
    }
  }

  //PhaseParameters
  try {
    await client.phaseParameter.create({
      data: {
        active: true,
        createdBy: "Catherine Richmond",
        description: "Idea local middle authority I.",
        editedBy: "Valerie Esparza",
        isClassDef: true,
        itemId: "26421351-4797-46c3-b901-a23487c858c7",
        name: "check",
        recipeId: "4f78b3ff-3c3e-4460-8b15-800a7778d367",
        revision: 3,
        schemaVersion: "0001-alpha",
        setpointLowerLimit: 88,
        setpointNumericalValue: 3,
        setpointType: "Numeric",
        setpointUpperLimit: 4,
        units: "data",
      }
    });
    await client.phaseParameter.create({
      data: {
        active: true,
        createdBy: "Christina Russell",
        description: "Apply foreign simply build operation air last.",
        editedBy: "Denise Chapman",
        isClassDef: true,
        itemId: "ad9f9c72-2821-4ede-a843-e7272937af72",
        name: "be",
        recipeId: "a7532ec9-1489-4d52-8a2f-92f4fbdaa2ab",
        revision: 4,
        schemaVersion: "0001-alpha",
        setpointLowerLimit: 66,
        setpointNumericalValue: 43,
        setpointType: "Numeric",
        setpointUpperLimit: 44,
        units: "trial",
      }
    });
    await client.phaseParameter.create({
      data: {
        active: true,
        createdBy: "Eric Barron",
        description: "Realize sense authority health mean not.",
        editedBy: "Makayla Acosta",
        isClassDef: true,
        itemId: "a0d4e677-3ff4-4a30-a2b1-274f9ceb8662",
        name: "white",
        recipeId: "c4d26b61-4296-4278-9d1d-883aa121da05",
        revision: 10,
        schemaVersion: "0001-alpha",
        setpointLowerLimit: 45,
        setpointNumericalValue: 47,
        setpointType: "Numeric",
        setpointUpperLimit: 0,
        units: "act",
      }
    });
  } catch (error) {
    console.error("Error creating EquipmentPhase:", error);
    // Handle the error appropriately here
    // For example, you might want to check if it's a foreign key constraint error:
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        console.error("There is a unique constraint violation, a new EquipmentPhase cannot be created.");
      } else if (error.code === 'P2003') {
        console.error("There is a foreign key constraint violation.");
      }
      // Add more error codes as needed
    }
  }

  try {
  // Instructions
    await client.instruction.create({
      data: {
        active: true,
        createdBy: "creator1",
        editedBy: "editor1",
        filePath: "/path/to/file1",
        name: "Instruction Name 1",
        revision: 0,
        schemaVersion: "0001-alpha",
      }
    });
    await client.instruction.create({
      data: {
        active: true,
        createdBy: "creator2",
        editedBy: "editor2",
        filePath: "/path/to/file2",
        name: "Instruction Name 2",
        revision: 1,
        schemaVersion: "0001-alpha",
      }
    });
    await client.instruction.create({
      data: {
        active: true,
        createdBy: "creator3",
        editedBy: "editor3",
        filePath: "/path/to/file3",
        name: "Instruction Name 3",
        revision: 2,
        schemaVersion: "0001-alpha",
      }
    });
  } catch (error) {
    console.error("Error creating EquipmentPhase:", error);
    // Handle the error appropriately here
    // For example, you might want to check if it's a foreign key constraint error:
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        console.error("There is a unique constraint violation, a new EquipmentPhase cannot be created.");
      } else if (error.code === 'P2003') {
        console.error("There is a foreign key constraint violation.");
      }
      // Add more error codes as needed
    }
  }



  const operationIds = await getAllOperationIds();
  const randomOperationId = selectRandomId(operationIds)

  const bomIds = await getAllBomIds();
  const randomBomId = selectRandomId(bomIds)

  // Equipment Phase
  try {
    await client.equipmentPhase.create({
      data: {
        bomId: randomBomId,
        className: "ClassName1",
        createdBy: "creator1",
        description: "Equipment Phase description 1",
        editedBy: "editor1",
        isClassDefinition: true,
        name: "Equipment Phase Name 1",
        operationId: randomOperationId,
        operationSequenceIndex: 10,
        revision: 0,
        schemaVersion: "0001-b",
      }
    });
  } catch (error) {
    console.error("Error creating EquipmentPhase:", error);
    // Handle the error appropriately here
    // For example, you might want to check if it's a foreign key constraint error:
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        console.error("There is a unique constraint violation, a new EquipmentPhase cannot be created.");
      } else if (error.code === 'P2003') {
        console.error("There is a foreign key constraint violation.");
      }
      // Add more error codes as needed
    }
  }

  const epIds = await getAllEpIds();
  const randomEpId = selectRandomId(epIds)

  try {
    // Fetch the records you want to update
    const phaseParameters = await client.phaseParameter.findMany({
    });

    // Update each record individually
    const updatePromises = phaseParameters.map(phaseParameter =>
        client.phaseParameter.update({
          where: {
            id: phaseParameter.id, // Use unique identifier for the record
          },
          data: {
            equipmentPhaseId: randomEpId
          },
        })
    );

    // Await all update operations
    await Promise.all(updatePromises);
  } catch (error) {
    console.error("Error updating Phase Parameters:", error);
    // Handle the error appropriately here
    // For example, you might want to check if it's a foreign key constraint error:
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        console.error("There is a unique constraint violation, the Phase Parameter cannot be updated.");
      } else if (error.code === 'P2003') {
        console.error("There is a foreign key constraint violation.");
      }
      // Add more error codes as needed
    }
  }

  client.$disconnect();
}
