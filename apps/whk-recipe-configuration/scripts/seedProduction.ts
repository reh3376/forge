import * as dotenv from "dotenv";
import {
  EnumEquipmentPhaseName,
  EnumEquipmentPhaseStepType,
  EnumOperationName,
  EnumPhaseParameterStaticName,
  EnumProcedureName,
  EnumUnitProcedureName,
  PrismaClient,
  Procedure,
} from "@prisma/client";
import { Salt, parseSalt } from "../src/auth/password.service";
import { hash } from "bcrypt";

const equipmentPhaseToPhaseParameterMap: { [key: string]: string[] } = {
  CornAdd: ["Quantity"],
  MaltAdd: ["Quantity"],
  RyeAdd: ["Quantity"],
  WheatAdd: ["Quantity"],
  AdditiveAdd: ["Quantity"],
  Prompt: [],
  Hold: ["Time", "Temperature"],
  Steam: ["Temperature", "Time"],
  Cooldown: ["Time", "Temperature"],
  Drop: ["FlowRate", "SprayballTime", "Time"],
  Rinse: ["Time", "Temperature"],
  GrainAdd: ["Quantity"],
  LiquidAdd: ["Quantity", "Speed"],
};

if (require.main === module) {
  dotenv.config();

  const { BCRYPT_SALT } = process.env;

  if (!BCRYPT_SALT) {
    throw new Error("BCRYPT_SALT environment variable must be defined");
  }
  const salt = parseSalt(BCRYPT_SALT);

  seed(salt).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

const staticNameMapping: { [key: string]: EnumPhaseParameterStaticName } = {
  Quantity: EnumPhaseParameterStaticName.Quantity,
  Time: EnumPhaseParameterStaticName.Time,
  Temperature: EnumPhaseParameterStaticName.Temperature,
  Level: EnumPhaseParameterStaticName.Level,
};

// Common interfaces
interface BaseEntity {
  active?: boolean;
  createdBy: string;
  description: string;
  isClassDefinition?: boolean;
  name: string;
  revision: number;
}

interface PhaseParameterConfig extends BaseEntity {
  staticName?: string;
  units: string;
  isStaticParameter?: boolean;
  isClassDef?: boolean;
}

interface OperationConfig extends BaseEntity {
  abbreviation: string;
  unitProcedureName: string;
  path: string;
  procedureSequenceIndex: number;
}

interface EquipmentPhaseConfig extends BaseEntity {
  path: string;
  operationSequenceIndex: number;
  stepType: string;
}

// Common create functions
async function createEntityIfNotExists<T extends BaseEntity>(
  client: PrismaClient,
  entity: T,
  findWhere: any,
  createData: any,
  entityType: string
) {
  const existing = await client[entityType].findFirst({ where: findWhere });
  
  if (!existing) {
    await client[entityType].create({ data: createData });
    console.log(`Created ${entityType}: ${entity.name}`);
    return true;
  }
  
  console.log(`${entityType} ${entity.name} already exists, skipping.`);
  return false;
}

// Common validation function
function validateEnvironmentVariables(...vars: string[]) {
  for (const v of vars) {
    if (!process.env[v]) {
      throw new Error(`${v} environment variable must be defined`);
    }
  }
}

async function seed(bcryptSalt: Salt) {
  console.info("Seeding database...");
  const client = new PrismaClient();

  validateEnvironmentVariables('MES_USER', 'MES_PASSWORD');
  
  try {
    await seedUser(client, bcryptSalt);
    await seedPhaseParameters(client);
    const procedure = await seedProcedure(client);
    await seedUnitProcedures(client, procedure);
    await seedOperations(client);
    await seedEquipmentPhases(client);

    console.info("Seeded database successfully");
  } finally {
    await client.$disconnect();
  }
}

async function seedUser(client: PrismaClient, bcryptSalt: Salt) {
  const { MES_USER, MES_PASSWORD } = process.env;
  if (!MES_USER || !MES_PASSWORD) {
    throw new Error(
      "MES_USER and MES_PASSWORD environment variables must be defined"
    );
  }

  await client.user.upsert({
    where: { username: MES_USER },
    update: {},
    create: {
      username: MES_USER,
      password: await hash(MES_PASSWORD, bcryptSalt),
      roles: ["user"],
    },
  });
}

async function seedPhaseParameters(client: PrismaClient) {
  // Custom seed for PhaseParameters
  const phaseParameters = [
    {
      name: "Quantity",
      staticName: "Quantity",
      units: "lbs",
      description: "Quantity",
      isClassDef: true,
    },
    {
      name: "Time",
      staticName: "Time",
      units: "hours",
      description: "Time",
      isClassDef: true,
    },
    {
      name: "Temperature",
      staticName: "Temperature",
      units: "°F",
      description: "Temperature",
      isClassDef: true,
    },
    {
      name: "Level",
      staticName: "Level",
      units: "%",
      description: "Level",
      isClassDef: true,
    },
    {
      name: "HighWineProof",
      units: "Proof",
      description: "HighWineProof",
      isClassDef: true,
      isStaticParameter: false,
    },
    {
      name: "LowWineProof",
      units: "Proof",
      description: "LowWineProof",
      isClassDef: true,
      isStaticParameter: false,
    },
    {
      name: "FinalProof",
      units: "Proof",
      description: "FinalProof",
      isClassDef: true,
      isStaticParameter: false,
    },
    {
      name: "BaseLoss",
      units: "% ABV",
      description: "BaseLoss",
      isClassDef: true,
      isStaticParameter: false,
    },
    {
      name: "BeerFeedTray",
      units: "Tray No.",
      description: "BeerFeedTray",
      isClassDef: true,
      isStaticParameter: false,
    },
    {
      name: "FermentationAge",
      units: "Hours",
      description: "FermentationAge",
      isClassDef: true,
      isStaticParameter: false,
    },
    {
      name: "ControlTemperature",
      units: "°F",
      description: "ControlTemperature",
      isClassDef: true,
      isStaticParameter: false,
    },
    {
      name: "CooksPerFerm",
      units: "",
      description: "CooksPerFerm",
      isClassDef: true,
      isStaticParameter: false,
    },
    {
      name: "TopOffFrequency",
      units: "Cooks btw Ferms",
      description: "TopOffFrequency",
      isClassDef: true,
      isStaticParameter: false,
    },
    {
      name: "TopOffQuantity",
      units: "Gal",
      description: "TopOffQuantity",
      isClassDef: true,
      isStaticParameter: false,
    },
    {
      name: "TopOffTemperature",
      units: "°F",
      description: "TopOffTemperature",
      isClassDef: true,
      isStaticParameter: false,
    },
    {
      name: "MashpH",
      units: "pH",
      description: "MashpH",
      isClassDef: true,
      isStaticParameter: false,
    },
    {
      name: "MashRatio",
      units: "Gal/lbs",
      description: "MashRatio",
      isClassDef: true,
      isStaticParameter: false,
    },
    {
      name: "RatioByFerm",
      units: "BGs",
      description: "RatioByFerm",
      isClassDef: true,
      isStaticParameter: false,
    },
    {
      name: "FermSetTemp",
      units: "°F",
      description: "FermSetTemp",
      isClassDef: true,
      isStaticParameter: false,
    },
    {
      name: "StarterSweetpH",
      units: "pH",
      description: "StarterSweetpH",
      isClassDef: true,
      isStaticParameter: false,
    },
    {
      name: "TotalGrainWeight",
      units: "lbs",
      description: "TotalGrainWeight",
      isClassDef: true,
      isStaticParameter: false,
    },
    {
      name: "TotalLiquid",
      units: "Gal",
      description: "TotalLiquid",
      isClassDef: true,
      isStaticParameter: false,
    },
    {
      name: "NumberOfCooks",
      units: "",
      description: "NumberOfCooks",
      isClassDef: true,
      isStaticParameter: false,
    },
    {
      name: "AssumbedFermABV",
      units: "%ABV",
      description: "AssumbedFermABV",
      isClassDef: true,
      isStaticParameter: false,
    },
  ];

  for (const param of phaseParameters) {
    const existingParam = await client.phaseParameter.findFirst({
      where: { name: param.name },
    });

    if (!existingParam) {
      await createPhaseParameter(client, param);
    }
  }
}

async function seedProcedure(client: PrismaClient): Promise<Procedure> {
  const procedureName = EnumProcedureName.Line1;
  const procedure = await createOrGetProcedure(client, procedureName);
  await createProcedureInstance(client, procedure);
  return procedure;
}

async function seedUnitProcedures(client: PrismaClient, procedure: Procedure) {
  // Seed Unit Procedures for Whiskey House of Kentucky Distillation Line 1
  const unitProcedures = [
    { name: "Granary01", path: "WH/WHK01/Distillery01/Granary01" },
    { name: "Mashing01", path: "WH/WHK01/Distillery01/Mashing01" },
    { name: "Fermentation01", path: "WH/WHK01/Distillery01/Fermentation01" },
    { name: "Distillation01", path: "WH/WHK01/Distillery01/Distillation01" },
    { name: "Processing01", path: "WH/WHK01/Distillery01/Processing01" },
  ];

  for (const unitProc of unitProcedures) {
    const existingUnitProcedure = await client.unitProcedure.findFirst({
      where: {
        name: unitProc.name as EnumUnitProcedureName,
        isClassDef: true,
      },
    });

    if (!existingUnitProcedure) {
      await client.unitProcedure.create({
        data: {
          active: true,
          createdBy: "pmannion@whiskeyhouse.com",
          description: unitProc.name,
          isClassDef: true,
          name: unitProc.name as EnumUnitProcedureName,
          path: unitProc.path,
          procedure: { connect: { id: procedure.id } },
          revision: 0,
        },
      });

      console.log(`Created Unit Procedure: ${unitProc.name}`);
    } else {
      console.log(`Unit Procedure ${unitProc.name} already exists, skipping.`);
    }
  }
}

async function seedOperations(client: PrismaClient) {
  // Seed Operations for Whiskey House of Kentucky Distillation Line 1
  const operations = [
    {
      abbreviation: "MAS",
      description: "Cook",
      unitProcedureName: "Mashing01",
      path: "WH/WHK01/Distillery01/Mashing01/Cook",
      name: "Cook",
      procedureSequenceIndex: 0,
    },
    {
      abbreviation: "FER",
      description: "Fermenter",
      unitProcedureName: "Fermentation01",
      path: "WH/WHK01/Distillery01/Fermentation01/Fermenter",
      name: "Fermenter",
      procedureSequenceIndex: 0,
    },
    {
      abbreviation: "DSP",
      description: "BlendingTank",
      unitProcedureName: "Processing01",
      path: "WH/WHK01/Distillery01/Processing01/BlendingTank",
      name: "BlendingTank",
      procedureSequenceIndex: 0,
    },
    {
      abbreviation: "DSP",
      description: "CisternTank",
      unitProcedureName: "Processing01",
      path: "WH/WHK01/Distillery01/Processing01/CisternTank",
      name: "CisternTank",
      procedureSequenceIndex: 1,
    },
    {
      abbreviation: "DSP",
      description: "Barreling",
      unitProcedureName: "Processing01",
      path: "WH/WHK01/Distillery01/Processing01/Barreling",
      name: "Barreling",
      procedureSequenceIndex: 2,
    },
  ];

  for (const op of operations) {
    const existingOperation = await client.operation.findFirst({
      where: {
        name: op.name as EnumOperationName,
        isClassDefinition: true,
      },
    });

    if (!existingOperation) {
      const unitProcedure = await client.unitProcedure.findFirst({
        where: {
          name: op.unitProcedureName as EnumUnitProcedureName,
          isClassDef: true,
        },
      });

      if (!unitProcedure) {
        console.log(
          `Unit Procedure ${op.unitProcedureName} not found, skipping operation ${op.name}`
        );
        continue;
      }

      await client.operation.create({
        data: {
          abbreviation: op.abbreviation,
          active: true,
          createdBy: "pmannion@whiskeyhouse.com",
          description: op.description,
          unitProcedure: { connect: { id: unitProcedure.id } },
          revision: 0,
          path: op.path,
          name: op.name as EnumOperationName,
          procedureSequenceIndex: op.procedureSequenceIndex,
          isClassDefinition: true,
        },
      });

      console.log(`Created Operation: ${op.name}`);
    } else {
      console.log(`Operation ${op.name} already exists, skipping.`);
    }
  }
}

async function seedEquipmentPhases(client: PrismaClient) {
  const equipmentPhases = getEquipmentPhasesConfig();

  for (const phase of equipmentPhases) {
    await processEquipmentPhase(client, phase);
  }
}

function getEquipmentPhasesConfig() {
  return [
    {
      name: "LiquidAdd",
      description: "LiquidAdd",
      path: "WH/WHK01/Distillery01/Mashing01/Cook/LiquidAdd",
      operationSequenceIndex: 0,
      stepType: "Backset",
    },
    {
      name: "LiquidAdd",
      description: "LiquidAdd",
      path: "WH/WHK01/Distillery01/Mashing01/Cook/LiquidAdd",
      operationSequenceIndex: 0,
      stepType: "Water",
    },
    {
      name: "GrainAdd",
      description: "GrainAdd",
      path: "WH/WHK01/Distillery01/Mashing01/Cook/GrainAdd",
      operationSequenceIndex: 0,
      stepType: "Corn",
    },
    {
      name: "GrainAdd",
      description: "GrainAdd",
      path: "WH/WHK01/Distillery01/Mashing01/Cook/GrainAdd",
      operationSequenceIndex: 0,
      stepType: "Wheat",
    },
    {
      name: "GrainAdd",
      description: "GrainAdd",
      path: "WH/WHK01/Distillery01/Mashing01/Cook/GrainAdd",
      operationSequenceIndex: 0,
      stepType: "Rye",
    },
    {
      name: "GrainAdd",
      description: "GrainAdd",
      path: "WH/WHK01/Distillery01/Mashing01/Cook/GrainAdd",
      operationSequenceIndex: 0,
      stepType: "Malt",
    },
    {
      name: "Hold",
      description: "Hold",
      path: "WH/WHK01/Distillery01/Mashing01/Cook/Hold",
      operationSequenceIndex: 0,
      stepType: "Hold",
    },
    {
      name: "Hold",
      description: "Hold",
      path: "WH/WHK01/Distillery01/Mashing01/Cook/Hold",
      operationSequenceIndex: 0,
      stepType: "Heat",
    },
    {
      name: "Hold",
      description: "Hold",
      path: "WH/WHK01/Distillery01/Mashing01/Cook/Hold",
      operationSequenceIndex: 0,
      stepType: "Cool",
    },
    {
      name: "Prompt",
      description: "Prompt",
      path: "WH/WHK01/Distillery01/Mashing01/Cook/Prompt",
      operationSequenceIndex: 0,
      stepType: "NotRequired",
    },
  ];
}

async function processEquipmentPhase(client: PrismaClient, phase: any) {
  const operationName = phase.path.split("/").slice(-2)[0];
  const existingPhase = await findExistingPhase(client, phase, operationName);

  if (!existingPhase) {
    await createNewPhase(client, phase);
  } else {
    console.log(
      `Equipment Phase ${phase.name} (${phase.stepType}) already exists, skipping.`
    );
  }
}

async function findExistingPhase(
  client: PrismaClient,
  phase: any,
  operationName: string
) {
  return await client.equipmentPhase.findFirst({
    where: {
      name: phase.name as EnumEquipmentPhaseName,
      stepType: phase.stepType as EnumEquipmentPhaseStepType,
      isClassDefinition: true,
      operation: {
        name: operationName as EnumOperationName,
        isClassDefinition: true,
      },
    },
    include: { operation: true },
  });
}

async function createNewPhase(client: PrismaClient, phase: any) {
  const operation = await client.operation.findFirst({
    where: { name: "Cook", isClassDefinition: true },
  });

  if (!operation) {
    console.log(
      `Operation Cook not found, skipping equipment phase ${phase.name}`
    );
    return;
  }

  // Define the phase parameters for Cook equipment phases
  const cookPhaseParameters = ["Quantity", "Time", "Temperature", "Level"];

  // Create the phase parameter connections
  const phaseParameterConnections = await Promise.all(
    cookPhaseParameters.map(async (paramName) => {
      const parameter = await client.phaseParameter.findFirst({
        where: {
          name: paramName,
          isClassDef: true,
        },
      });

      if (!parameter) {
        console.log(
          `Phase parameter ${paramName} not found, skipping for equipment phase ${phase.name}`
        );
        return null;
      }

      return { id: parameter.id, name: parameter.name };
    })
  );

  // Filter out any null values from the connections array
  const validPhaseParameterConnections = phaseParameterConnections.filter(
    (connection): connection is { id: string; name: string } =>
      connection !== null
  );

  await client.equipmentPhase.create({
    data: {
      active: true,
      createdBy: "pmannion@whiskeyhouse.com",
      description: phase.description,
      name: phase.name as EnumEquipmentPhaseName,
      isClassDefinition: true,
      operationSequenceIndex: phase.operationSequenceIndex,
      path: phase.path,
      operation: { connect: { id: operation.id } },
      revision: 0,
      stepType: phase.stepType as EnumEquipmentPhaseStepType,
    },
  });

  console.log(`Created Equipment Phase: ${phase.name} (${phase.stepType})`);

  // Connect the valid phase parameters to the equipment phase
  if (
    ["Cook"].includes(phase.name) &&
    phase.name in equipmentPhaseToPhaseParameterMap &&
    validPhaseParameterConnections.length > 0
  ) {
    const existingEquipmentPhase = await client.equipmentPhase.findFirst({
      where: {
        name: phase.name as EnumEquipmentPhaseName,
        operation: { name: "Cook" },
      },
    });

    if (!existingEquipmentPhase) {
      console.log(
        `Equipment Phase ${phase.name} not found for Cook operation, skipping phase parameter connections.`
      );
      return;
    }

    const allowedParameters = equipmentPhaseToPhaseParameterMap[phase.name];
    const filteredConnections = validPhaseParameterConnections.filter(
      (connection): connection is { id: string; name: string } =>
        connection !== null && allowedParameters.includes(connection.name)
    );

    await client.equipmentPhase.update({
      where: { id: existingEquipmentPhase.id },
      data: {
        phaseParameters: {
          connect: filteredConnections as { id: string }[],
        },
      },
    });
    console.log(
      `Connected ${filteredConnections.length} phase parameters to Equipment Phase: ${phase.name} for Cook operation`
    );
  } else {
    console.log(
      `Skipping phase parameter connections for ${phase.name}: not applicable to Cook operation or no valid connections`
    );
  }
}

async function createPhaseParameter(client: PrismaClient, param: any) {
  await client.phaseParameter.create({
    data: {
      active: true,
      createdBy: "MES",
      description: param.description,
      name: param.name,
      staticName: param.staticName ? staticNameMapping[param.staticName] : null,
      units: param.units,
      revision: 0,
      isStaticParameter: param.isStaticParameter ?? true,
      isClassDef: param.isClassDef ?? false,
      setpointType: "Numeric",
    },
  });
  console.log(`Created PhaseParameter: ${param.name}`);
}

async function createOrGetProcedure(
  client: PrismaClient,
  procedureName: EnumProcedureName
): Promise<Procedure> {
  const existingProcedure = await client.procedure.findFirst({
    where: { name: procedureName, isClassDefinition: true },
  });

  if (!existingProcedure) {
    return await client.procedure.create({
      data: {
        active: true,
        createdBy: "pmannion@whiskeyhouse.com",
        description: "Whiskey House of Kentucky Distillation Line 1",
        isClassDefinition: true,
        name: procedureName,
        revision: 0,
      },
    });
  }

  return existingProcedure;
}

async function createProcedureInstance(
  client: PrismaClient,
  procedure: Procedure
) {
  const existingInstance = await client.procedure.findFirst({
    where: { name: procedure.name, isClassDefinition: false },
  });

  if (!existingInstance) {
    await client.procedure.create({
      data: {
        active: true,
        createdBy: "pmannion@whiskeyhouse.com",
        description: "Whiskey House of Kentucky Distillation Line 1",
        isClassDefinition: false,
        name: procedure.name,
        revision: 0,
        classId: { connect: { id: procedure.id } },
      },
    });
    console.log(`Created Procedure Instance: ${procedure.name}`);
  }
}
