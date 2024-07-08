import * as dotenv from "dotenv";
import { EnumEquipmentPhaseName, EnumEquipmentPhaseStepType, EnumOperationName, EnumPhaseParameterSetpointType, EnumPhaseParameterStaticName, EnumUnitProcedureName, Item, Operation, PrismaClient, Procedure } from "@prisma/client";
import { Salt, parseSalt } from "../src/auth/password.service";
import { hash } from "bcrypt";

async function seed() {


  console.info("Seeding database with custom seed for Mashing Recipe...");

  // const phaseParameters = [
  //   { name: "Quantity", staticName: "Quantity", units: "lbs", description: "Quantity", isClassDef: false,  },
  //   { name: "Time", staticName: "Time", units: "hours", description: "Time", isClassDef: false },
  //   { name: "Temperature", staticName: "Temperature", units: "°F", description: "Temperature", isClassDef: false },
  //   { name: "Level", staticName: "Level", units: "%", description: "Level", isClassDef: false },
  //   { name: "HighWineProof", units: "Proof", description: "HighWineProof", isClassDef: false, isStaticParameter: false },
  //   { name: "LowWineProof", units: "Proof", description: "LowWineProof", isClassDef: false, isStaticParameter: false },
  //   { name: "FinalProof", units: "Proof", description: "FinalProof", isClassDef: false, isStaticParameter: false },
  //   { name: "BaseLoss", units: "% ABV", description: "BaseLoss", isClassDef: false, isStaticParameter: false },
  //   { name: "BeerFeedTray", units: "Tray No.", description: "BeerFeedTray", isClassDef: false, isStaticParameter: false },
  //   { name: "FermentationAge", units: "Hours", description: "FermentationAge", isClassDef: false, isStaticParameter: false },
  //   { name: "ControlTemperature", units: "°F", description: "ControlTemperature", isClassDef: false, isStaticParameter: false },
  //   { name: "CooksPerFerm", units: "", description: "CooksPerFerm", isClassDef: false, isStaticParameter: false },
  //   { name: "TopOffFrequency", units: "Cooks btw Ferms", description: "TopOffFrequency", isClassDef: false, isStaticParameter: false },
  //   { name: "TopOffQuantity", units: "Gal", description: "TopOffQuantity", isClassDef: false, isStaticParameter: false },
  //   { name: "TopOffTemperature", units: "°F", description: "TopOffTemperature", isClassDef: false, isStaticParameter: false },
  //   { name: "MashpH", units: "pH", description: "MashpH", isClassDef: false, isStaticParameter: false },
  //   { name: "MashRatio", units: "Gal/lbs", description: "MashRatio", isClassDef: false, isStaticParameter: false },
  //   { name: "RatioByFerm", units: "BGs", description: "RatioByFerm", isClassDef: false, isStaticParameter: false },
  //   { name: "FermSetTemp", units: "°F", description: "FermSetTemp", isClassDef: false, isStaticParameter: false },
  //   { name: "StarterSweetpH", units: "pH", description: "StarterSweetpH", isClassDef: false, isStaticParameter: false },
  //   { name: "TotalGrainWeight", units: "lbs", description: "TotalGrainWeight", isClassDef: false, isStaticParameter: false },
  //   { name: "TotalLiquid", units: "Gal", description: "TotalLiquid", isClassDef: false, isStaticParameter: false },
  //   { name: "NumberOfCooks", units: "", description: "NumberOfCooks", isClassDef: false, isStaticParameter: false },
  //   { name: "AssumbedFermABV", units: "%ABV", description: "AssumbedFermABV", isClassDef: false, isStaticParameter: false },
  // ];

  /*
  1. Seed instance of unit procedures, using the main procedure instance
  2. Seed instances of operations for each UP. Using the parameters to seed the number of operations per UP
  3. Find the appropriate BOM for the mashing recipe
  4. Using the structure of the mashing protocol to map the equipment phases to cook. 
    a. Connect the correct phase parameters
    b. Connect the step type if applicable.  
    c. Map the bom components to the proper equipment phase

  */

  const client = new PrismaClient();

  // Find Unit Procedure class definitions
  const unitProcedureClassDefs = await client.unitProcedure.findMany({
    where: {
      isClassDef: true
    }
  });

  console.log("Unit Procedure Class Definitions:", unitProcedureClassDefs);

  // Find the procedure instance for the mashing recipe
  const mashingRecipeProcedure = await client.procedure.findFirst({
    where: {
      name: "Line1",
      isClassDefinition: false
    }
  });

  if (!mashingRecipeProcedure) {
    console.error("Mashing Recipe procedure instance not found");
    return;
  }

  console.log("Found Mashing Recipe procedure instance:", mashingRecipeProcedure.id);

  // Create instances of Unit Procedures
  for (const classDef of unitProcedureClassDefs) {
    const existingInstance = await client.unitProcedure.findFirst({
      where: {
        name: classDef.name,
        isClassDef: false
      }
    });

    if (!existingInstance) {
      const newInstance = await client.unitProcedure.create({
        data: {
          name: classDef.name,
          path: classDef.path,
          isClassDef: false,
          classId: { connect: { id: classDef.id } },
          revision: 0,
          description: `Instance of ${classDef.name}`,
          createdBy: "seed",
          procedure: { connect: { id: mashingRecipeProcedure.id } }
        }
      });
      console.log(`Created new Unit Procedure instance: ${newInstance.name}`);
    } else {
      console.log(`Instance of ${classDef.name} already exists, skipping.`);
    }
  }

  // find the appropriate BOM / BOM Version
  const bom = await client.bom.findFirst({
    where: {
      bomName: "15",
      bomRevision: 'WSC-74-18-00-08-53-06-3-0-0-100 Rev',
    }
  });

  // Seed operations based on number of cooks per ferm and number of cooks
  const numberOfCooksPerFerm = 3; // This should be configurable or fetched from a setting
  const totalNumberOfCooks = 9; // This should be configurable or fetched from a setting

  const operationClassDefs = await client.operation.findMany({
    where: {
      isClassDefinition: true
    }
  });

  console.log("Operation Class Definitions:", operationClassDefs);

  const mashingUnitProcedure = await client.unitProcedure.findFirst({
    where: {
      name: EnumUnitProcedureName.Mashing01,
      isClassDef: false,
      procedure: { id: mashingRecipeProcedure.id }
    }
  });

  if (!mashingUnitProcedure) {
    console.error("Mashing Unit Procedure instance not found");
    return;
  }

  for (let cookIndex = 0; cookIndex < totalNumberOfCooks; cookIndex++) {
    const existingInstance = await client.operation.findFirst({
      where: {
        name: EnumOperationName.Cook,
        isClassDefinition: false,
        unitProcedure: { id: mashingUnitProcedure.id },
        procedureSequenceIndex: cookIndex
      }
    });

    if (!existingInstance) {
      const cookClassDef = operationClassDefs.find(def => def.name === EnumOperationName.Cook);

      if (cookClassDef) {
        const newInstance = await client.operation.create({
          data: {
            name: EnumOperationName.Cook,
            path: `${cookClassDef.path}/Cook${cookIndex + 1}`,
            isClassDefinition: false,
            classId: { connect: { id: cookClassDef.id } },
            revision: 0,
            description: `Instance of Cook for Cook ${cookIndex + 1}`,
            createdBy: "seed",
            unitProcedure: { connect: { id: mashingUnitProcedure.id } },
            procedureSequenceIndex: cookIndex,
            abbreviation: 'MAS'
          }
        });
        console.log(`Created new Operation instance: ${newInstance.name} for Cook ${cookIndex + 1}`);
      } else {
        console.log(`Cook class definition not found, skipping Cook ${cookIndex + 1}`);
      }
    } else {
      console.log(`Instance of Cook for Cook ${cookIndex + 1} already exists, skipping.`);
    }
  }

  // Create the cook equipment phases for each cook using the mashing protocol
  // Create the cook equipment phases for each cook using the mashing protocol
  const mashingProtocol = [
    { action: "Add Liquid", liquidType01: "Water", liquidType02: "Backset" },
    { action: "Hold", holdType: "Heat", temperature: 130 },
    { action: "Add Grain", grainType: "Premalt" },
    { action: "Add Grain", grainType: "Corn" },
    { action: "Hold", holdType: "Cool", temperature: 145 },
    { action: "Hold", holdType: "Hold", temperature: 200, time: 15 },
    { action: "Hold", holdType: "Cool", temperature: 170 },
    { action: "Add Grain", grainType: "Rye" },
    { action: "Hold", holdType: "Hold", time: 15 },
    { action: "Hold", holdType: "Heat", temperature: 200 }
  ];

  for (let cookIndex = 0; cookIndex < totalNumberOfCooks; cookIndex++) {
    // const fermIndex = Math.floor(cookIndex / numberOfCooksPerFerm);

    const cookOperation = await client.operation.findFirst({
      where: {
        name: EnumOperationName.Cook,
        isClassDefinition: false,
        unitProcedure: { id: mashingUnitProcedure.id },
        procedureSequenceIndex: cookIndex
      }
    });

    if (!cookOperation) {
      console.log(`Cook operation not found for Cook ${cookIndex + 1}, skipping phase creation.`);
      continue;
    }

    // Map the provided phase names to the actual enum values
    const phaseNameMap: { [key: string]: EnumEquipmentPhaseName } = {
      "Add Liquid": EnumEquipmentPhaseName.LiquidAdd,
      "Hold": EnumEquipmentPhaseName.Hold,
      "Add Grain": EnumEquipmentPhaseName.GrainAdd
    };

    // Update the mashingProtocol with the mapped enum values
    const mappedMashingProtocol = mashingProtocol.map(phase => ({
      ...phase,
      action: phaseNameMap[phase.action] || phase.action
    }));

    for (const [phaseIndex, phase] of mashingProtocol.entries()) {
      const existingPhase = await client.equipmentPhase.findFirst({
        where: {
          name: phaseNameMap[phase.action] || phase.action as EnumEquipmentPhaseName,
          operation: {
            name: EnumOperationName.Cook,
            isClassDefinition: false,
            unitProcedure: { id: mashingUnitProcedure.id },
            procedureSequenceIndex: cookIndex
          },
          operationSequenceIndex: phaseIndex
        },
        include: {
          operation: true
        }
      });

      if (!existingPhase) {
        const cookOperation: Operation | null = await client.operation.findFirst({
          where: {
            name: EnumOperationName.Cook,
            isClassDefinition: false,
            unitProcedure: { id: mashingUnitProcedure.id },
            procedureSequenceIndex: cookIndex
          }
        });

        if (cookOperation) {
          const stepType = phase.action === "Hold" ? phase.holdType : undefined;
          const newPhase = await client.equipmentPhase.create({
            data: {
              name: phaseNameMap[phase.action] || phase.action as EnumEquipmentPhaseName,
              path: `${mashingUnitProcedure.path}/Cook${cookIndex + 1}/${phase.action}`,
              isClassDefinition: false,
              revision: 0,
              description: `Cook ${cookIndex + 1}`,
              createdBy: "seed",
              operation: {
                connect: {
                  id: (cookOperation as Operation).id as string
                }
              },
              stepType: stepType as EnumEquipmentPhaseStepType,
              operationSequenceIndex: phaseIndex
            }
          });
          console.log(`Created new Equipment Phase: ${newPhase.name} for Cook ${cookIndex + 1}`);

          // Add phase parameters based on the action
          const parameterData: { name: string; value: number | string; units: string }[] = [];
          if (phase.temperature) {
            parameterData.push({ name: "Temperature", value: phase.temperature, units: "°F" });
          }
          if (phase.time) {
            parameterData.push({ name: "Time", value: phase.time, units: "minutes" });
          }
          // if (phase.grainType) {
          //   parameterData.push({ name: "GrainType", value: phase.grainType, units: "" });
          // }
          // if (phase.additiveType) {
          //   parameterData.push({ name: "AdditiveType", value: phase.additiveType, units: "" });
          // }
          // if (phase.liquidType01) {
          //   parameterData.push({ name: "LiquidType01", value: phase.liquidType01, units: "" });
          // }
          // if (phase.liquidType02) {
          //   parameterData.push({ name: "LiquidType02", value: phase.liquidType02, units: "" });
          // }
          // if (phase.holdType) {
          //   parameterData.push({ name: "HoldType", value: phase.holdType, units: "" });
          // }
          // if (phase.step) {
          //   parameterData.push({ name: "Step", value: phase.step, units: "" });
          // }

          for (const param of parameterData) {
            await client.phaseParameter.create({
              data: {
                name: param.name,
                staticName: param.name as EnumPhaseParameterStaticName,
                setpointNumericalValue: param.value as number,
                units: param.units,
                description: param.name,
                isClassDef: false,
                equipmentPhases: { connect: { id: newPhase.id } },
                createdBy: "seed",
                setpointType: EnumPhaseParameterSetpointType.Numeric,
              }
            });
          }

        // Link BOM components to their equipment phases
        if (bom) {
          const bomComponents = await client.bomItem.findMany({
            where: {
              bom: { id: bom.id },
            },
            include: {
              item: true
            }
          });

          for (const component of bomComponents) {
            if (
              (phase.action === "Add Grain" && phase.grainType && component.item.itemNumber.toLowerCase().includes(phase.grainType.toLowerCase())) ||
              (phase.action === "Add Liquid" && (
                (phase.liquidType01 && component.item.itemNumber.toLowerCase().includes(phase.liquidType01.toLowerCase())) ||
                (phase.liquidType02 && component.item.itemNumber.toLowerCase().includes(phase.liquidType02.toLowerCase()))
              ))
            ) {
              await client.equipmentPhase.update({
                where: { id: newPhase.id },
                data: {
                  bomItem: {
                    connect: { id: component.id },
                  },
                },
              });
              console.log(`Linked BOM component ${component.item.itemNumber  } to Equipment Phase ${newPhase.name}`);
            }
          }
        } else {
          console.log("BOM not found, skipping linking BOM components to Equipment Phases");
        }
        }
      } else {
        console.log(`Equipment Phase ${phase.action} already exists, skipping.`);
      }
    }
  }

  // Get the item with the correct item number
  const getItemByItemNumber = async (itemNumber: string) => {
    const item = await client.item.findFirst({
      where: {
        itemNumber: {
          equals: itemNumber,
          mode: 'insensitive'
        }
      }
    });
    
    if (!item) {
      console.log(`Item with item number ${itemNumber} not found`);
      return null;
    }
    
    return item;
  };

  const item = await getItemByItemNumber('SOME_ITEM_NUMBER');
  if (item) {
    console.log(`Found item: ${item.id}, ${item.itemNumber}`);
  }

  // Create or update the Recipe record and link it to the Mashing Unit Procedure
  const existingRecipe = await client.recipe.findFirst({
    where: {
      Recipe: "Mashing Recipe",
    }
  });

  if (existingRecipe) {
    console.log("Mashing Recipe already exists, updating...");
    await client.recipe.update({
      where: { id: existingRecipe.id },
      data: {
        unitProcedures: {
          connect: { id: mashingUnitProcedure.id }
        },
      }
    });
    console.log("Mashing Recipe updated successfully");
  } else {
    console.log("Creating new Mashing Recipe...");
    const newRecipe = await client.recipe.create({
      data: {
        Recipe: "Mashing Recipe",
        revision: 1,
        createdBy: "seed",
        unitProcedures: {
          connect: { id: mashingUnitProcedure.id }
        },
        customer: {
          connect: { id: "clq00000000000000000000000" }
        },
        item: {
          connect: { id: (item as Item).id }
        },
      }
    });
    console.log("New Mashing Recipe created successfully:", newRecipe.id);
  }

  // Close the Prisma client connection
  await client.$disconnect();
}

seed()