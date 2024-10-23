import { EnumEquipmentPhaseName, EnumEquipmentPhaseStepType, EnumOperationName, EnumPhaseParameterSetpointType, EnumPhaseParameterStaticName, EnumProductionOrderStatus, EnumScheduleOrderStatus, EnumUnitProcedureName, Item, Operation, PhaseParameter, PrismaClient, Procedure, Recipe, RecipeGroup, RecipeParameter, SalesOrder, UnitProcedure } from "@prisma/client";

const CUSTOMER_CODE = "PAW";
const MASH_BILL = '75-21-00-04'; //  Match Item Record
const FINAL_PROOF = 115;
const BARREL_INFO = '53-18-3-4-0'; // Match Item Record
const CUSTOMER_NAME = "Proof and Wood Ventures, Inc."; // This needs to match ERP / MESDB customer reocrd
const ORDER_QTY = 67; // barrels
const TOTAL_GRAIN_WEIGHT = 24080;
const BBLS_PER_FERM = 108.52;
const USER = 'pmannion@whiskeyhouse.com';

const WATER_QTY = 3900;
const BACKSET_QTY = 3600;

const BBL_ITEM_NUMBERS = [
  'BBL-ISC06-53-18-3-4-0',
  'BBL-ISC04-53-18-4-3-0',
  'BRL-ISC02-53-18-4-3-0',
  'BBL-ISC07-53-12-4-3-0',
  'BBL-ISC04-53-12-4-0-0',
  'BBL-ISC05-53-12-3-4-0',
  'BBL-ISC06-53-18-3-4-0',
]

const YEAST_ITEM_NUMBERS_QTYS: { [key: string]: number } = {
  'YEA-FER01-Yeast (USW6)': 10,
}

/* 
MAXIMUM GRAIN WEIGHTS IN BINS 
(Normal bin assignment...)

Current total grain weight: 24080

Corn: 18000
Rye: 7000
Wheat: 7000
Malt: 1800


Each grain weight for the recipe is the % from the mash bill (Corn-Rye-Wheat-Malt) multiplied by total grain weight
But malt, 10% of the malt weight is the premalt, 90% is the big malt
*/

const MASHING_PROTOCOL = [
  { action: "Add Liquid", liquidType01: "Water", liquidType02: "Backset", notQty: 0 },
  { action: "Hold", holdType: "Heat", temperature: 130 },
  { action: "Add Additive", additiveType: "Citric", qty: 0 },
  { action: "Add Grain", grainType: "Malt", qty:  96 },
  { action: "Add Additive", additiveType: "Liquozyme", qty: 2.0 },
  { action: "Add Grain", grainType: "Corn", qty:  18060 },
  // { action: "Hold", holdType: "Hold", time: 3 }, // UNCOMMENT IF NEED SECONDARY DROP
  // { action: "Add Grain", grainType: "Corn", qty: 20001 }, // UNCOMMENT IF NEED SECONDARY DROP
  { action: "Hold", holdType: "Heat", temperature: 200, time: 15 },
  { action: "Hold", holdType: "Cool", temperature: 170 },
  { action: "Add Grain", grainType: "Rye", qty:  3793 },
  //{ action: "Hold", holdType: "Hold", time: 3 }, // UNCOMMENT IF NEED SECONDARY DROP
  //{ action: "Add Grain", grainType: "Rye", qty: 1669 }, // UNCOMMENT IF NEED SECONDARY DROP
  { action: "Hold", holdType: "Hold", time: 15 },
  { action: "Hold", holdType: "Cool", temperature: 152 },
  { action: "Add Additive", additiveType: "DIAZYME", qty: 8.7 },
  { action: "Add Additive", additiveType: "Viscoferm", qty: 2.5 },
  { action: "Hold", holdType: "Cool", temperature: 145 },
  { action: "Add Grain", grainType: "Malt", qty:   867 },
  { action: "Hold", holdType: "Hold", time: 10 },
];
const RECIPE_PARAMETERS = [
  { name: 'HighWineProof', setpointValue: 138 },
  { name: 'LowWineProof', setpointValue: 120 },
  { name: 'FinalProof', setpointValue: 120 },
  { name: 'BaseLoss', setpointValue: 0.5 },
  { name: 'BeerFeedTray', setpointValue: 15 },
  { name: 'FermentationAge', setpointValue: 72 },
  { name: 'ControlTemperature', setpointValue: 85 },
  { name: 'CooksPerFerm', setpointValue: 3 },
    { name: 'TopOffFrequency', setpointValue: 24 },
    { name: 'TopOffQuantity', setpointValue: 100 },
    { name: 'TopOffTemperature', setpointValue: 80 },
    { name: 'MashpH', setpointValue: 5.1 },
    { name: 'MashRatio', setpointValue: 3.2 },
    { name: 'RatioByFerm', setpointValue: 3.2 },
    { name: 'FermSetTemp', setpointValue: 80 },
    { name: 'StarterSweetpH', setpointValue: 5.1 },
    { name: 'TotalGrainWeight', setpointValue: 24080 },
    { name: 'TotalLiquid', setpointValue: 7500 },
    { name: 'NumberOfCooks', setpointValue: ORDER_QTY * 3/ BBLS_PER_FERM },
    { name: 'AssumedFermABV', setpointValue: 12.5 }
  ];
  const RECIPE = `${CUSTOMER_CODE}-${MASH_BILL}-R01`;
  const ITEM_NUMBER = `${CUSTOMER_CODE}-${MASH_BILL}-${BARREL_INFO}-${FINAL_PROOF}-R01`;
  const BOM_REVISION = `BOM-${CUSTOMER_CODE}-${MASH_BILL}-R01`;
  
  async function seed() {
    
    
    console.info("Seeding database with custom seed for Mashing Recipe...");
 // ------------------------------------ BOM CREATION ------------------------------------
  // Base BOM Items
  const waterItemId = 'clyd1ofw2009yfd4504c6wt1w'
  const backsetItemId = 'clyd1oftx006jfd4514hrak80'
  const viscofermItemId = 'clyd1ofou0024fd45e71gyxcu'
  const liquozymeItemId = 'clzhhlwfj0f8ysuwb7whvgy9s'
  const diazymeItemId = 'clzhhlsx30f09mbc9r5mj02z7'
  const termamylItemId = 'clzelxl5v005osuwb3rfax6ix'
  const saczymeItemId = 'clyd1ofot0022fd45d8j321v4'
  const maltItemId = 'clyd1ofw0009ufd45hlzpnqa9'
  const ryeItemId = 'clyd1ofy600d9fd45p99px0c0'
  const cornItemId = 'clyd1ofw1009wfd45oghso7y5'
  const wheatItemId = 'cm0e1ocx0012xl6xv4i696cfh'
  const citricItemId = 'clyd1ofpw0032fd45omeixgvv'


  const client = new PrismaClient();

  // Create the base BOM and bom items
  const fgItem = await client.item.findFirst({
    where: {
      itemNumber: `${CUSTOMER_CODE}-${MASH_BILL}-${BARREL_INFO}-${FINAL_PROOF}-R01`
    }
  })

  // Check for existing BOM with the same revision
  const existingBom = await client.bom.findFirst({
    where: {
      bomRevision: BOM_REVISION
    }
  });

  if (existingBom) {
    console.log(`BOM with revision ${BOM_REVISION} already exists. Skipping creation.`);
  } else {
    const baseBom = await client.bom.create({
      data: {
        bomRevision: BOM_REVISION,
        bomName: `BOM-${CUSTOMER_CODE}-${MASH_BILL}`,
        createdBy: USER,
        item: {
          connect: {
            id: fgItem?.id
          }
        }
      }
    });
    // add the base bom items
    await client.bomItem.createMany({
      data: [
        {
          bomId: baseBom.id,
          itemId: waterItemId,
          quantity: WATER_QTY,
          createdBy: USER,
          isClassDefinition: true
        },
        {
          bomId: baseBom.id,
          itemId: backsetItemId,
          quantity: BACKSET_QTY,
          createdBy: USER,
          isClassDefinition: true
        },
        {
          bomId: baseBom.id,
          itemId: citricItemId,
          quantity: 0,
          createdBy: USER,
          isClassDefinition: true
        }
      ]
    })
    
    // add the barrel bom items
    for (const itemNumber of BBL_ITEM_NUMBERS) {
      const itemId = await client.item.findFirst({
        where: {
          itemNumber: itemNumber
        },
      });
      if (itemId) {
        await client.bomItem.create({
          data: {
            bomId: baseBom.id,
            itemId: itemId?.id,
            quantity: 1 / BBL_ITEM_NUMBERS.length,
            createdBy: USER,
            isClassDefinition: true
          }
        })
      }
    }
    
    // add the yeast items
    for (const [yeastItemNumber, quantity] of Object.entries(YEAST_ITEM_NUMBERS_QTYS)) {
      const item = await client.item.findFirst({
        where: {
          itemNumber: yeastItemNumber
        },
      });
      if (item) {
        await client.bomItem.create({
          data: {
            bomId: baseBom.id,
            itemId: item.id,
            quantity: YEAST_ITEM_NUMBERS_QTYS[yeastItemNumber],
            createdBy: USER,
            isClassDefinition: true
          }
        });
      } else {
        console.log(`Item not found for yeast item number: ${yeastItemNumber}`);
      }
    }
    
    // Add the bom items for the grains according to the mashingProtocol
    // Add the bom items for the grains according to the mashingProtocol
    for (const step of MASHING_PROTOCOL) {
      if (step.action === "Add Grain") {
        let itemId;
        let quantity: number;
    
        switch (step.grainType) {
          case "Corn":
            itemId = cornItemId;
            quantity = step.qty || 0;
            break;
          case "Rye":
            itemId = ryeItemId;
            quantity = step.qty || 0;
            break;
          case "Malt":
            itemId = maltItemId;
            quantity = step.qty || 0;
            break;
          case "Wheat":
            itemId = wheatItemId;
            quantity = step.qty || 0;
            break;
          default:
            console.log(`Unknown grain type: ${step.grainType}`);
            continue;
        }
    
        if (itemId && quantity) {
          await client.bomItem.create({
            data: {
              bomId: baseBom.id,
              itemId: itemId,
              quantity: quantity,
              createdBy: USER,
              isClassDefinition: true
            }
          });
          console.log(`Added ${step.grainType} to BOM with quantity ${quantity}`);
        }
    
      } else if (step.action === "Add Additive") {
        let itemId;
        let quantity;
    
        switch (step.additiveType?.toLowerCase()) {
          case "viscoferm":
            itemId = viscofermItemId;
            quantity = step.qty || 0;
            break;
          case "liquozyme":
            itemId = liquozymeItemId;
            quantity = step.qty || 0;
            break;
          case "diazyme":
            itemId = diazymeItemId;
            quantity = step.qty || 0;
            break;
          case "termamyl":
            itemId = termamylItemId;
            quantity = step.qty || 0;
            break;
          case "saczyme":
            itemId = saczymeItemId;
            quantity = step.qty || 0;
            break;  
          case "termamyl":
            itemId = termamylItemId;
            quantity = step.qty || 0;
            break;
        }
    
        if (itemId && quantity) {
          await client.bomItem.create({
            data: {
              bomId: baseBom.id,
              itemId: itemId || '',
              quantity: quantity || 0,
              createdBy: USER,
              isClassDefinition: true
            }
          });
          console.log(`Added ${step.additiveType} to BOM with quantity ${quantity}`);
        }
      }
    }
}


  // ------------------------------------ END OF BOM CREATION ------------------------------------


  /*
  1. Seed instance of unit procedures, using the main procedure instance
  2. Seed instances of operations for each UP. Using the parameters to seed the number of operations per UP
  3. Find the appropriate BOM for the mashing recipe
  4. Using the structure of the mashing protocol to map the equipment phases to cook. 
    a. Connect the correct phase parameters
    b. Connect the step type if applicable.  
    c. Map the bom components to the proper equipment phase

  */


  // Find Unit Procedure class definitions
  const unitProcedureClassDefs = await client.unitProcedure.findMany({
    where: {
      isClassDef: true,
      name: 'Mashing01'
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

  let mashInstance: UnitProcedure | null = null;
  // Create instances of Unit Procedures
  for (const classDef of unitProcedureClassDefs) {
    const existingInstance = await client.unitProcedure.findFirst({
      where: {
        name: classDef.name,
        isClassDef: false,
        recipe: {
          some: {
            Recipe: RECIPE
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    mashInstance = existingInstance;
    if (!existingInstance) {
    // if (true) {
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
      if (newInstance.name.includes("Mashing01")) {
        mashInstance = newInstance;
      }
    } else {
      console.log(`Instance of ${classDef.name} already exists, skipping.`);
      // mashIstance = existingInstance;
    }
    if (!mashInstance) {
      console.log(`Mashing unit procedure instance not found`);
      mashInstance = existingInstance;
    }
  }

  // find the appropriate BOM / BOM Version
  const bom = await client.bom.findFirst({
    where: {
      bomRevision: BOM_REVISION,
    }
  });

  // Seed operations based on number of cooks per ferm and number of cooks
  const numberOfCooksPerFerm = 3; // This should be configurable or fetched from a setting
  const totalNumberOfCooks = 1; // This should be configurable or fetched from a setting
  const startCook = 0;

  const operationClassDefs = await client.operation.findMany({
    where: {
      isClassDefinition: true
    }
  });

  console.log("Operation Class Definitions:", operationClassDefs);

  if (!mashInstance) {
    console.log(`Mashing unit procedure instance not found`);
    return;
  }
  const mashingUnitProcedure = await client.unitProcedure.findFirst({
    where: {
      id: mashInstance.id,
      // name: EnumUnitProcedureName.Mashing01,
      // isClassDef: false,
      // procedure: { id: mashingRecipeProcedure.id }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  if (!mashingUnitProcedure) {
    console.error("Mashing Unit Procedure instance not found");
    return;
  }
  let newCookInstances: Operation[] = [];
  for (let cookIndex = startCook; cookIndex < totalNumberOfCooks; cookIndex++) {
    const existingInstance = await client.operation.findFirst({
      where: {
        name: EnumOperationName.Cook,
        isClassDefinition: false,
        // unitProcedure: { id: mashingUnitProcedure.id },
        unitProcedureId: mashInstance.id,
        procedureSequenceIndex: cookIndex
      }
    });
    // if (!existingInstance) {
    if (true) {
      const cookClassDef = operationClassDefs.find(def => def.name === EnumOperationName.Cook);

      if (cookClassDef) {
        newCookInstances[cookIndex] = await client.operation.create({
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
        console.log(`Created new Operation instance: ${newCookInstances[cookIndex].name} for Cook ${cookIndex + 1}`);
      } else {
        console.log(`Cook class definition not found, skipping Cook ${cookIndex + 1}`);
      }
    } else {
      console.log(`Instance of Cook for Cook ${cookIndex + 1} already exists, skipping.`);
    }
  }

  for (let cookIndex = startCook; cookIndex < totalNumberOfCooks; cookIndex++) {
    // const fermIndex = Math.floor(cookIndex / numberOfCooksPerFerm);

    const cookOperation = await client.operation.findFirst({
      where: {
        // name: EnumOperationName.Cook,
        // isClassDefinition: false,
        // unitProcedure: { id: mashingUnitProcedure.id },
        // procedureSequenceIndex: cookIndex
        id: newCookInstances[cookIndex].id
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
      "Add Grain": EnumEquipmentPhaseName.GrainAdd,
      "Add Additive": EnumEquipmentPhaseName.AdditiveAdd
    };

    // Update the MASHING_PROTOCOL with the mapped enum values
    const mappedMASHING_PROTOCOL = MASHING_PROTOCOL.map(phase => ({
      ...phase,
      action: phaseNameMap[phase.action] || phase.action
    }));

    for (const [phaseIndex, phase] of MASHING_PROTOCOL.entries()) {
      const existingPhase = await client.equipmentPhase.findFirst({
        where: {
          name: phaseNameMap[phase.action] || phase.action as EnumEquipmentPhaseName,
          operation: {
            id: newCookInstances[cookIndex].id
          },
          operationSequenceIndex: phaseIndex,
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
          },
          orderBy: { createdAt: 'desc' }
        });

        if (cookOperation) {

          const stepType = (phase.action === "Hold") ? phase.holdType : (phase.action === "Add Grain") ? phase.grainType : (phase.action === "Add Liquid") ? phase.liquidType01 : undefined;
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

          // Link BOM components to their equipment phases - these will be the "class definitions"
          if (bom) {
            const bomComponents = await client.bomItem.findMany({
              where: {
                bom: { id: bom.id },
                isClassDefinition: true,
              },
              include: {
                item: true
              }
            });

            for (const component of bomComponents) {
              if (
                (phase.action === "Add Grain" && phase.grainType && component.item.itemNumber.toLowerCase().includes(phase.grainType.toLowerCase()) && phase.grainType != "Corn") ||
                (phase.action === "Add Liquid" && (
                  (phase.liquidType01 && component.item.itemNumber.toLowerCase().includes(phase.liquidType01.toLowerCase())) //||
                  // (phase.liquidType02 && component.item.itemNumber.toLowerCase().includes(phase.liquidType02.toLowerCase()))
                ))
              ) {
                // Check if the quantity field is present in the phase object
                if (phase.qty !== undefined) {
                  // Only match if the bomItem quantity equals the phase quantity
                  if (component.quantity == phase.qty) {
                    await client.equipmentPhase.update({
                      where: { id: newPhase.id },
                      data: {
                        bomItem: {
                          connect: { id: component.id },
                        },
                      },
                    });
                    console.log(`Linked BOM component ${component.item.itemNumber} with quantity ${component.quantity} to Equipment Phase ${newPhase.name}`);
                  } else {
                    console.log(`Skipped linking BOM component ${component.item.itemNumber} due to quantity mismatch. Required: ${phase.qty}, Actual: ${component.quantity}`);
                  }
                } else if (phase.notQty !== undefined) {
                  // Only match if the bomItem quantity does not equal the phase notQty
                  if (component.quantity != phase.notQty) {
                    await client.equipmentPhase.update({
                      where: { id: newPhase.id },
                      data: {
                        bomItem: {
                          connect: { id: component.id },
                        },
                      },
                    });
                    console.log(`Linked BOM component ${component.item.itemNumber} with quantity ${component.quantity} to Equipment Phase ${newPhase.name}`);
                  } else {
                    console.log(`Skipped linking BOM component ${component.item.itemNumber} due to quantity match with notQty. NotQty: ${phase.notQty}, Actual: ${component.quantity}`);
                  }
                } else {
                  await client.equipmentPhase.update({
                    where: { id: newPhase.id },
                    data: {
                      bomItem: {
                        connect: { id: component.id },
                      },
                    },
                  });
                  console.log(`Linked BOM component ${component.item.itemNumber} to Equipment Phase ${newPhase.name}`);

                }
              } else if (phase.grainType == "Corn") {
                console.log(`Corn: ${component.item.itemNumber}`);
                if (component.item.itemNumber === "COR-DLF02-US #2 Yellow Dent GMO") {
                  // Check if the quantity field is present in the phase object
                  if (phase.qty !== undefined) {
                    // Only match if the bomItem quantity equals the phase quantity
                    if (component.quantity == phase.qty) {
                      await client.equipmentPhase.update({
                        where: { id: newPhase.id },
                        data: {
                          bomItem: {
                            connect: { id: component.id },
                          },
                        },
                      });
                      console.log(`Linked BOM component ${component.item.itemNumber} with quantity ${component.quantity} to Equipment Phase ${newPhase.name}`);
                    } else {
                      console.log(`Skipped linking BOM component ${component.item.itemNumber} due to quantity mismatch. Required: ${phase.qty}, Actual: ${component.quantity}`);
                    }
                  } else {
                    await client.equipmentPhase.update({
                      where: { id: newPhase.id },
                      data: {
                        bomItem: {
                          connect: { id: component.id },
                        },
                      },
                    });
                    console.log(`Linked specific corn BOM component ${component.item.itemNumber} to Equipment Phase ${newPhase.name}`);
                  }
                }
              } else if (phase.action === "Add Additive" && phase.additiveType && component.item.itemNumber.toLowerCase().includes(phase.additiveType.toLowerCase())) {
                console.log(`Add Additive: ${component.item.itemNumber}`);
                // if (phase.additiveType == "Teramyl") {
                //   console.log(`Teramyl: ${component.item.itemNumber}`);
                // } else if (phase.additiveType)
                await client.equipmentPhase.update({
                  where: { id: newPhase.id },
                  data: {
                    bomItem: {
                      connect: { id: component.id },
                    },
                  },
                });
                console.log(`Linked BOM component ${component.item.itemNumber} to Equipment Phase ${newPhase.name}`);
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

  const item = await getItemByItemNumber(ITEM_NUMBER);
  if (item) {
    console.log(`Found item: ${item.id}, ${item.itemNumber}`);
  }

  const customer = await client.customer.findFirst({
    where: {
      name: CUSTOMER_NAME
    }
  });

  if (customer) {
    console.log(`Found customer: ${customer.id}, ${customer.name}`);
  } else {
    console.log(`Customer '${CUSTOMER_NAME}' not found`);
  }

  // Create or update the Recipe record and link it to the Mashing Unit Procedure
  const existingRecipe = await client.recipe.findFirst({
    where: {
      Recipe: RECIPE,
    }
  });

  let newParams: RecipeParameter[] = [];
  for (const param of RECIPE_PARAMETERS) {
    const classParam = await client.recipeParameter.findFirst({
      where: {
        recipeParamName: param.name,
        isClassDefinition: true
      }
    });
    if (classParam) {
      console.log(`Updating existing recipe parameter: ${param.name}`);
      newParams.push(await client.recipeParameter.create({
        data: {
          className: classParam.className,
          recipeParamName: param.name,
          recipeNumericalSetpoint: param.setpointValue,
          description: classParam.description,
          isClassDefinition: false,
          recipeSetpointType: classParam.recipeSetpointType,
          createdBy: USER,
        }
      }));
    } else {
      console.log(`Phase parameter ${param.name} already exists, skipping.`);
    }
  }

  let recipe: Recipe;
  if (existingRecipe) {
    console.log("Mashing Recipe already exists, updating...");
    recipe = await client.recipe.update({
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
    recipe = await client.recipe.create({
      data: {
        Recipe: RECIPE,
        revision: 1,
        createdBy: USER,
        // parameters: {
        //   connect: newParams.map(param => ({ id: param.id }))
        // },
        unitProcedures: {
          connect: { id: mashingUnitProcedure.id }
        },
        customer: {
          connect: { id: customer?.id }
        },
        item: {
          connect: { id: (item as Item).id }
        },
        // parameters: {
        //   connect: newParams.map(param => ({ id: param.id }))
        // },
        customerCode: CUSTOMER_CODE
      }
    });
    console.log("New Mashing Recipe created successfully:", recipe.id);
  }

  // Create a recipe group and add the recipe to it
  console.log("Creating recipe group and adding recipe...");
  let recipeGroup: RecipeGroup;
  const recipeGroupName = RECIPE.split('-').slice(1, -1).join('-');
  console.log(`Extracted recipe group name: ${recipeGroupName}`);
  const existingRecipeGroup = await client.recipeGroup.findFirst({
    where: {
      recipe: { equals: recipeGroupName }
    }
  });

  if (existingRecipeGroup) {
    console.log("Recipe group 'Mashing Recipes' already exists, updating...");
    recipeGroup = await client.recipeGroup.update({
      where: { id: existingRecipeGroup.id },
      data: {
        recipes: {
          connect: { id: recipe.id }
        }
      }
    });
    console.log("Recipe added to existing group successfully");
  } else {
    console.log("Creating new recipe group 'Mashing Recipes'...");
    recipeGroup = await client.recipeGroup.create({
      data: {
        recipe: recipeGroupName,
        createdBy: USER,
        recipes: {
          connect: { id: recipe.id }
        }
      }
    });
    console.log("New recipe group created and recipe added successfully:", recipeGroup.id);
  }

  // Create a sample sales order
  console.log("Creating sample sales order...");
  let salesOrder: SalesOrder;
  const existingSalesOrder = await client.salesOrder.findFirst({
    where: {
      customer: { id: customer?.id },
      name: 'SO42'
    }
  });

  // Get the current date
  const currentDate = new Date();
  
  // Calculate the day of the year
  const startOfYear = new Date(currentDate.getFullYear(), 0, 0);
  const diff = currentDate.getTime() - startOfYear.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  
  console.log(`Current day of the year: ${dayOfYear}`);

  if (existingSalesOrder) {
    console.log("Sample sales order already exists, skipping creation.");
    salesOrder = existingSalesOrder;
  } else {
    // Get the most recent production order created today, if it exists
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const mostRecentSalesOrder = await client.salesOrder.findFirst({
      where: {
        createdAt: {
          gte: today
        },
        name: {
          startsWith: 'SO'
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    const salesOrderNumber = mostRecentSalesOrder?.name?.split('SO')[1] ?? '01';
    const newSalesOrderNumber = parseInt(salesOrderNumber, 10) + 1;

    if (mostRecentSalesOrder) {
      console.log(`Most recent sales order created today: ${mostRecentSalesOrder.name ?? 'Unknown'}`);
    } else {
      console.log("No sales orders created today.");
    }

    const newSalesOrder = await client.salesOrder.create({
      data: {
        item: {
          connect: { id: (item as Item).id }
        },
        customer: {
          connect: { id: customer?.id }
        },
        createdBy: USER,
        // orderDate: new Date(),
        // requestedShipDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
        quantity: ORDER_QTY, // Adjust as needed
        name: `SO${dayOfYear}${newSalesOrderNumber}`,
        // units: "Barrels",
      }
    });

    console.log("Sample sales order created successfully:", newSalesOrder.id);

    // Update the salesOrder variable for use in production order creation
    salesOrder = newSalesOrder;
  }

  // Create a sample production order
  console.log("Creating sample production order...");

  const productionOrderName = `PRO${dayOfYear}`;
  const existingProductionOrder = await client.productionOrder.findFirst({
    where: {
      name: {
        contains: productionOrderName,
        mode: 'insensitive'
      },
      bom: {
        id: bom?.id
      }
    }
  });

  if (existingProductionOrder) {
    console.log(`Production order ${productionOrderName} already exists, skipping creation.`);
  } else {
    // Get the most recent production order created today, if it exists
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const mostRecentProductionOrder = await client.productionOrder.findFirst({
      where: {
        createdAt: {
          gte: today
        },
        name: {
          startsWith: 'PRO'
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    const productionOrderNumber = mostRecentProductionOrder?.name?.split('PRO')[1] ?? '01';
    const newProductionOrderNumber = parseInt(productionOrderNumber, 10) + 1;

    if (mostRecentProductionOrder) {
      console.log(`Most recent production order created today: ${mostRecentProductionOrder.name ?? 'Unknown'}`);
    } else {
      console.log("No production orders created today.");
    }
    
    console.log("Creating new production order...");
    const newProductionOrder = await client.productionOrder.create({
      data: {
        recipe: {
          connect: { id: recipe.id }
        },
        item: {
          connect: { id: (item as Item).id }
        },
        bom: {
          connect: { id: bom?.id }
        },
        customer: {
          connect: { id: customer?.id }
        },
        // salesOrder: {
        //   connect: { id: salesOrder?.id }
        // },
        createdBy: USER,
        status: EnumProductionOrderStatus.Initiated,
        customerCode: CUSTOMER_CODE,
        units: 'Barrels',
        quantity: ORDER_QTY,
        name: `${productionOrderName}${newProductionOrderNumber}`,
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        totalCooks: Math.ceil(ORDER_QTY / BBLS_PER_FERM) * 3,
        totalFermenters: Math.ceil(ORDER_QTY / BBLS_PER_FERM),
        executedCooks: 0,
        executedFermenters: 0,
      }
    });

    // Create a sample schedule order
    console.log("Creating sample schedule order...");
    const scheduleOrderName = `SHO${dayOfYear}`;
    const newScheduleOrder = await client.scheduleOrder.create({
      data: {
        productionOrders: {
          connect: { id: newProductionOrder.id }
        },
        status: EnumScheduleOrderStatus.Scheduled,
        createdBy: USER,
        estimatedStart: new Date(),
        estimatedEnd: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000), // 7 days from now
        recipeName: RECIPE,
        productionOrderAllocation: ORDER_QTY,
        recipeGroup: {
          connect: { id: recipeGroup.id }
        },
        name: `${scheduleOrderName}03`,
      }
    });

    console.log("Sample schedule order created successfully:", newScheduleOrder.id);

    // Create a sample schedule order queue record
    console.log("Creating sample schedule order queue record...");

    const maxQueueIndex = await client.scheduleOrderQueue.findFirst({
      orderBy: {
        queueIndex: 'desc'
      },
      select: {
        queueIndex: true
      }
    });

    const newQueueIndex = (maxQueueIndex?.queueIndex ?? 0) + 1;

    const newScheduleOrderQueue = await client.scheduleOrderQueue.create({
      data: {
        scheduleOrder: {
          connect: { id: newScheduleOrder.id }
        },
        queueIndex: newQueueIndex,
        createdBy: USER,
        nextUnitProcedureName: EnumUnitProcedureName.Mashing01,
        nextUnitProcedure: {
          connect: { id: mashingUnitProcedure.id }
        }
      }
    });

    console.log("Sample schedule order queue record created successfully:", newScheduleOrderQueue.id);

    console.log("Sample production order created successfully:", newProductionOrder.id);
  }

  // Close the Prisma client connection
  await client.$disconnect();
}

seed()