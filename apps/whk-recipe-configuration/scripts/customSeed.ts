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

  client.$disconnect();
}
