import { PrismaClient } from "@prisma/client";

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

  const procedures = await client.procedure.findMany({
    select: {
      id: true // Select only the 'id' field
    }
    });

  const procedureIds = await getAllProcedureIds();
  const randomProcedureId = selectRandomId(procedureIds)
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


  const unitProcedureIds = await getAllUnitProcedureIds();
  const randomUnitProcedureId = selectRandomId(unitProcedureIds)
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

  // Boms
  await client.bom.create({
    data: {
      batches: {"batch1": "value"},
      bomItems: {"item1": "value"},
      bomName: "Bom Name 1",
      bomRevision: 0,
      className: "Class Name 1",
      createdBy: "creator1",
      editedBy: "editor1",
      operationSteps: {"step1": "value"},
      schemaVersion: "0001-alpha",
      wipItemId: "wipId1"
    }
  });
  await client.bom.create({
    data: {
      batches: {"batch2": "value"},
      bomItems: {"item2": "value"},
      bomName: "Bom Name 2",
      bomRevision: 1,
      className: "Class Name 2",
      createdBy: "creator2",
      editedBy: "editor2",
      operationSteps: {"step2": "value"},
      schemaVersion: "0001-alpha",
      wipItemId: "wipId2"
    }
  });
  await client.bom.create({
    data: {
      batches: {"batch3": "value"},
      bomItems: {"item3": "value"},
      bomName: "Bom Name 3",
      bomRevision: 2,
      className: "Class Name 3",
      createdBy: "creator3",
      editedBy: "editor3",
      operationSteps: {"step3": "value"},
      schemaVersion: "0001-alpha",
      wipItemId: "wipId3"
    }
  });

  client.$disconnect();
}
