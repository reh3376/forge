import { Bom, Customer, EnumEquipmentPhaseName, EnumEquipmentPhaseStepType, EnumOperationName, EnumPhaseParameterSetpointType, EnumPhaseParameterStaticName, EnumProductionOrderStatus, EnumScheduleOrderStatus, EnumUnitProcedureName, Item, Operation, PhaseParameter, PrismaClient, Procedure, ProductionOrder, Recipe, RecipeGroup, RecipeParameter, SalesOrder, ScheduleOrder, UnitProcedure } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { Injectable } from "@nestjs/common";


// @Injectable()
// export class RecipeCreationService {
//   constructor(
//     protected readonly prisma: PrismaService,
//     protected readonly fgItemNumber: string,
//     protected readonly bomName: string,
//     protected readonly bomRevision: string,
//     protected readonly recipeName: string,
//     protected readonly startCook: number,
//     protected readonly numberOfCooks: number,
//     protected readonly customerName: string,
//     protected readonly mashingSequenceData: any,
//     protected readonly runQuantity: number,
//     protected readonly salesOrderNumber: string = '',
//     protected readonly productionOrderNumber: string = '',
//     protected readonly scheduleOrderNumber: string = '',

//     protected readonly numberOfCooksPerFerm: number = 3,
//     protected readonly username: string
//   ) {
    
//   }

//   async createRecipe() {

//     /*
//     1. Seed instance of unit procedures, using the main procedure instance
//     2. Seed instances of operations for each UP. Using the parameters to seed the number of operations per UP
//     3. Find the appropriate BOM for the mashing recipe
//     4. Using the structure of the mashing protocol to map the equipment phases to cook. 
//       a. Connect the correct phase parameters
//       b. Connect the step type if applicable.  
//       c. Map the bom components to the proper equipment phase
  
//     */
  
//     // Find Unit Procedure class definitions
//     const unitProcedureClassDefs = await this.prisma.unitProcedure.findMany({
//       where: {
//         isClassDef: true
//       }
//     });
  
//     console.log("Unit Procedure Class Definitions:", unitProcedureClassDefs);
  
//     // Find the procedure instance for the mashing recipe
//     const mashingRecipeProcedure = await this.prisma.procedure.findFirst({
//       where: {
//         name: "Line1",
//         isClassDefinition: false
//       }
//     });
  
//     if (!mashingRecipeProcedure) {
//       console.error("Mashing Recipe procedure instance not found");
//       return;
//     }
  
//     console.log("Found Mashing Recipe procedure instance:", mashingRecipeProcedure.id);
  
//     let mashInstance: UnitProcedure | null = null;
//     // Create instances of Unit Procedures
//     for (const classDef of unitProcedureClassDefs) {
//       const existingInstance = await this.prisma.unitProcedure.findFirst({
//         where: {
//           name: classDef.name,
//           isClassDef: false
//         },
//         orderBy: {
//           createdAt: 'desc'
//         }
//       });
//       mashInstance = existingInstance;
//       // if (!existingInstance) {
//       if (true) {
//         const newInstance = await this.prisma.unitProcedure.create({
//           data: {
//             name: classDef.name,
//             path: classDef.path,
//             isClassDef: false,
//             classId: { connect: { id: classDef.id } },
//             revision: 0,
//             description: `Instance of ${classDef.name}`,
//             createdBy: this.username,
//             procedure: { connect: { id: mashingRecipeProcedure.id } }
//           }
//         });
//         console.log(`Created new Unit Procedure instance: ${newInstance.name}`);
//         if (newInstance.name.includes("Mashing01")) {
//           mashInstance = newInstance;
//         }
//       } else {
//         console.log(`Instance of ${classDef.name} already exists, skipping.`);
//         // mashIstance = existingInstance;
//       }
//       if (!mashInstance) {
//         console.log(`Mashing unit procedure instance not found`);
//         mashInstance = existingInstance;
//       }
//     }
  
//     // find the appropriate BOM / BOM Version
//     const bom = await this.prisma.bom.findFirst({
//       where: {
//         bomName: this.bomName,
//         bomRevision: this.bomRevision,
  
//       }
//     });
  
//     // Seed operations based on number of cooks per ferm and number of cooks
//     const numberOfCooksPerFerm = this.numberOfCooksPerFerm; // This should be configurable or fetched from a setting
//     const totalNumberOfCooks = this.numberOfCooks+this.startCook; // This should be configurable or fetched from a setting
//     const startCook = this.startCook;
  
//     const operationClassDefs = await this.prisma.operation.findMany({
//       where: {
//         isClassDefinition: true
//       }
//     });
  
//     console.log("Operation Class Definitions:", operationClassDefs);
  
//     if (!mashInstance) {
//       console.log(`Mashing unit procedure instance not found`);
//       return;
//     }
//     const mashingUnitProcedure = await this.prisma.unitProcedure.findFirst({
//       where: {
//         id: mashInstance.id,
//         // name: EnumUnitProcedureName.Mashing01,
//         // isClassDef: false,
//         // procedure: { id: mashingRecipeProcedure.id }
//       },
//       orderBy: {
//         createdAt: 'desc'
//       }
//     });
  
//     if (!mashingUnitProcedure) {
//       console.error("Mashing Unit Procedure instance not found");
//       return;
//     }
//     let newCookInstances: Operation[] = [];
//     for (let cookIndex = startCook; cookIndex < totalNumberOfCooks; cookIndex++) {
//       const existingInstance = await this.prisma.operation.findFirst({
//         where: {
//           name: EnumOperationName.Cook,
//           isClassDefinition: false,
//           // unitProcedure: { id: mashingUnitProcedure.id },
//           unitProcedureId: mashInstance.id,
//           procedureSequenceIndex: cookIndex
//         }
//       });
//       // if (!existingInstance) {
//       if (true) {
//         const cookClassDef = operationClassDefs.find(def => def.name === EnumOperationName.Cook);
  
//         if (cookClassDef) {
//           newCookInstances[cookIndex] = await this.prisma.operation.create({
//             data: {
//               name: EnumOperationName.Cook,
//               path: `${cookClassDef.path}/Cook${cookIndex + 1}`,
//               isClassDefinition: false,
//               classId: { connect: { id: cookClassDef.id } },
//               revision: 0,
//               description: `Instance of Cook for Cook ${cookIndex + 1}`,
//               createdBy: this.username,
//               unitProcedure: { connect: { id: mashingUnitProcedure.id } },
//               procedureSequenceIndex: cookIndex,
//               abbreviation: 'MAS'
//             }
//           });
//           console.log(`Created new Operation instance: ${newCookInstances[cookIndex].name} for Cook ${cookIndex + 1}`);
//         } else {
//           console.log(`Cook class definition not found, skipping Cook ${cookIndex + 1}`);
//         }
//       } else {
//         console.log(`Instance of Cook for Cook ${cookIndex + 1} already exists, skipping.`);
//       }
//     }
  
//     // Create the cook equipment phases for each cook using the mashing protocol
//     // Create the cook equipment phases for each cook using the mashing protocol
//     // const mashingProtocol = [
//     //   { action: "Add Liquid", liquidType01: "Water", liquidType02: "Backset", notQty: 0 },
//     //   { action: "Hold", holdType: "Heat", temperature: 130 },
//     //   { action: "Add Additive", additiveType: "Citric", qty: 0 },
//     //   { action: "Add Grain", grainType: "Malt", qty: 96 },
//     //   { action: "Add Additive", additiveType: "Termamyl" },
//     //   { action: "Add Grain", grainType: "Corn", itemName: "COR-DLF02-US #2 Yellow Dent GMO" },
//     //   { action: "Add Liquid", liquidType01: "Water", qty: 0 },
//     //   { action: "Hold", holdType: "Heat", temperature: 190, time: 15 },
//     //   { action: "Hold", holdType: "Cool", temperature: 170 },
//     //   { action: "Add Grain", grainType: "Rye" },
//     //   { action: "Hold", holdType: "Hold", time: 15 },
//     //   { action: "Hold", holdType: "Cool", temperature: 152 },
//     //   { action: "Add Additive", additiveType: "Saczyme" },
//     //   { action: "Add Additive", additiveType: "Viscoferm", qty: 0.23 },
//     //   { action: "Hold", holdType: "Cool", temperature: 145 },
//     //   { action: "Add Grain", grainType: "Malt", qty: 867 },
//     //   { action: "Hold", holdType: "Hold", time: 10 },
//     // ];
//     const mashingProtocol = this.mashingSequenceData;
  
//     for (let cookIndex = startCook; cookIndex < totalNumberOfCooks; cookIndex++) {
//       // const fermIndex = Math.floor(cookIndex / numberOfCooksPerFerm);
  
//       const cookOperation = await this.prisma.operation.findFirst({
//         where: {
//           // name: EnumOperationName.Cook,
//           // isClassDefinition: false,
//           // unitProcedure: { id: mashingUnitProcedure.id },
//           // procedureSequenceIndex: cookIndex
//           id: newCookInstances[cookIndex].id
//         }
//       });
  
//       if (!cookOperation) {
//         console.log(`Cook operation not found for Cook ${cookIndex + 1}, skipping phase creation.`);
//         continue;
//       }
  
//       // Map the provided phase names to the actual enum values
//       const phaseNameMap: { [key: string]: EnumEquipmentPhaseName } = {
//         "Add Liquid": EnumEquipmentPhaseName.LiquidAdd,
//         "Hold": EnumEquipmentPhaseName.Hold,
//         "Add Grain": EnumEquipmentPhaseName.GrainAdd,
//         "Add Additive": EnumEquipmentPhaseName.AdditiveAdd
//       };
  
//       // Update the mashingProtocol with the mapped enum values
//       const mappedMashingProtocol = mashingProtocol.map((phase: { action: string | number; }) => ({
//         ...phase,
//         action: phaseNameMap[phase.action] || phase.action
//       }));
  
//       for (const [phaseIndex, phase] of mashingProtocol.entries()) {
//         const existingPhase = await this.prisma.equipmentPhase.findFirst({
//           where: {
//             name: phaseNameMap[phase.action] || phase.action as EnumEquipmentPhaseName,
//             operation: {
//               id: newCookInstances[cookIndex].id
//             },
//             operationSequenceIndex: phaseIndex,
//           },
//           include: {
//             operation: true
//           }
//         });
  
//         if (!existingPhase) {
//           const cookOperation: Operation | null = await this.prisma.operation.findFirst({
//             where: {
//               name: EnumOperationName.Cook,
//               isClassDefinition: false,
//               unitProcedure: { id: mashingUnitProcedure.id },
//               procedureSequenceIndex: cookIndex
//             },
//             orderBy: { createdAt: 'desc' }
//           });
  
//           if (cookOperation) {
  
//             const stepType = (phase.action === "Hold") ? phase.holdType : (phase.action === "Add Grain") ? phase.grainType : (phase.action === "Add Liquid") ? phase.liquidType01 : undefined;
//             const newPhase = await this.prisma.equipmentPhase.create({
//               data: {
//                 name: phaseNameMap[phase.action] || phase.action as EnumEquipmentPhaseName,
//                 path: `${mashingUnitProcedure.path}/Cook${cookIndex + 1}/${phase.action}`,
//                 isClassDefinition: false,
//                 revision: 0,
//                 description: `Cook ${cookIndex + 1}`,
//                 createdBy: this.username,
//                 operation: {
//                   connect: {
//                     id: (cookOperation as Operation).id as string
//                   }
//                 },
//                 stepType: stepType as EnumEquipmentPhaseStepType,
//                 operationSequenceIndex: phaseIndex
//               }
//             });
//             console.log(`Created new Equipment Phase: ${newPhase.name} for Cook ${cookIndex + 1}`);
  
//             // Add phase parameters based on the action
//             const parameterData: { name: string; value: number | string; units: string }[] = [];
//             if (phase.temperature) {
//               parameterData.push({ name: "Temperature", value: phase.temperature, units: "°F" });
//             }
//             if (phase.time) {
//               parameterData.push({ name: "Time", value: phase.time, units: "minutes" });
//             }
//             // if (phase.grainType) {
//             //   parameterData.push({ name: "GrainType", value: phase.grainType, units: "" });
//             // }
//             // if (phase.additiveType) {
//             //   parameterData.push({ name: "AdditiveType", value: phase.additiveType, units: "" });
//             // }
//             // if (phase.liquidType01) {
//             //   parameterData.push({ name: "LiquidType01", value: phase.liquidType01, units: "" });
//             // }
//             // if (phase.liquidType02) {
//             //   parameterData.push({ name: "LiquidType02", value: phase.liquidType02, units: "" });
//             // }
//             // if (phase.holdType) {
//             //   parameterData.push({ name: "HoldType", value: phase.holdType, units: "" });
//             // }
//             // if (phase.step) {
//             //   parameterData.push({ name: "Step", value: phase.step, units: "" });
//             // }
  
//             for (const param of parameterData) {
//               await this.prisma.phaseParameter.create({
//                 data: {
//                   name: param.name,
//                   staticName: param.name as EnumPhaseParameterStaticName,
//                   setpointNumericalValue: param.value as number,
//                   units: param.units,
//                   description: param.name,
//                   isClassDef: false,
//                   equipmentPhases: { connect: { id: newPhase.id } },
//                   createdBy: this.username,
//                   setpointType: EnumPhaseParameterSetpointType.Numeric,
//                 }
//               });
//             }
  
//             // Link BOM components to their equipment phases - these will be the "class definitions"
//             if (bom) {
//               const bomComponents = await this.prisma.bomItem.findMany({
//                 where: {
//                   bom: { id: bom.id },
//                   isClassDefinition: true,
//                 },
//                 include: {
//                   item: true
//                 }
//               });
  
//               for (const component of bomComponents) {
//                 if (
//                   (phase.action === "Add Grain" && phase.grainType && component.item.itemNumber.toLowerCase().includes(phase.grainType.toLowerCase()) && phase.grainType != "Corn") ||
//                   (phase.action === "Add Liquid" && (
//                     (phase.liquidType01 && component.item.itemNumber.toLowerCase().includes(phase.liquidType01.toLowerCase())) //||
//                     // (phase.liquidType02 && component.item.itemNumber.toLowerCase().includes(phase.liquidType02.toLowerCase()))
//                   ))
//                 ) {
//                   // Check if the quantity field is present in the phase object
//                   if (phase.qty !== undefined) {
//                     // Only match if the bomItem quantity equals the phase quantity
//                     if (component.quantity.equals(phase.qty)) {
//                       await this.prisma.equipmentPhase.update({
//                         where: { id: newPhase.id },
//                         data: {
//                           bomItem: {
//                             connect: { id: component.id },
//                           },
//                         },
//                       });
//                       console.log(`Linked BOM component ${component.item.itemNumber} with quantity ${component.quantity} to Equipment Phase ${newPhase.name}`);
//                     } else {
//                       console.log(`Skipped linking BOM component ${component.item.itemNumber} due to quantity mismatch. Required: ${phase.qty}, Actual: ${component.quantity}`);
//                     }
//                   } else if (phase.notQty !== undefined) {
//                     // Only match if the bomItem quantity does not equal the phase notQty
//                     if (!component.quantity.equals(phase.notQty)) {
//                       await this.prisma.equipmentPhase.update({
//                         where: { id: newPhase.id },
//                         data: {
//                           bomItem: {
//                             connect: { id: component.id },
//                           },
//                         },
//                       });
//                       console.log(`Linked BOM component ${component.item.itemNumber} with quantity ${component.quantity} to Equipment Phase ${newPhase.name}`);
//                     } else {
//                       console.log(`Skipped linking BOM component ${component.item.itemNumber} due to quantity match with notQty. NotQty: ${phase.notQty}, Actual: ${component.quantity}`);
//                     }
//                   } else {
//                     await this.prisma.equipmentPhase.update({
//                       where: { id: newPhase.id },
//                       data: {
//                         bomItem: {
//                           connect: { id: component.id },
//                         },
//                       },
//                     });
//                     console.log(`Linked BOM component ${component.item.itemNumber} to Equipment Phase ${newPhase.name}`);
  
//                   }
//                 } else if (phase.grainType == "Corn") {
//                   console.log(`Corn: ${component.item.itemNumber}`);
//                   if (component.item.itemNumber === "COR-DLF02-US #2 Yellow Dent GMO") {
//                     await this.prisma.equipmentPhase.update({
//                       where: { id: newPhase.id },
//                       data: {
//                         bomItem: {
//                           connect: { id: component.id },
//                         },
//                       },
//                     });
//                     console.log(`Linked specific corn BOM component ${component.item.itemNumber} to Equipment Phase ${newPhase.name}`);
//                   }
//                 } else if (phase.action === "Add Additive" && phase.additiveType && component.item.itemNumber.toLowerCase().includes(phase.additiveType.toLowerCase())) {
//                   console.log(`Add Additive: ${component.item.itemNumber}`);
//                   // if (phase.additiveType == "Teramyl") {
//                   //   console.log(`Teramyl: ${component.item.itemNumber}`);
//                   // } else if (phase.additiveType)
//                   await this.prisma.equipmentPhase.update({
//                     where: { id: newPhase.id },
//                     data: {
//                       bomItem: {
//                         connect: { id: component.id },
//                       },
//                     },
//                   });
//                   console.log(`Linked BOM component ${component.item.itemNumber} to Equipment Phase ${newPhase.name}`);
//                 }
  
//               }
//             } else {
//               console.log("BOM not found, skipping linking BOM components to Equipment Phases");
//             }
//           }
//         } else {
//           console.log(`Equipment Phase ${phase.action} already exists, skipping.`);
//         }
//       }
//     }
  
//     // Get the item with the correct item number
//     const getItemByItemNumber = async (itemNumber: string) => {
//       const item = await this.prisma.item.findFirst({
//         where: {
//           itemNumber: {
//             equals: itemNumber,
//             mode: 'insensitive'
//           }
//         }
//       });
  
//       if (!item) {
//         console.log(`Item with item number ${itemNumber} not found`);
//         return null;
//       }
  
//       return item;
//     };
  
//     // const item = await getItemByItemNumber('WCL-75-15-00-10-53-06-4-0-0-120-R01');
//     const item = await getItemByItemNumber(this.fgItemNumber);
//     if (item) {
//       console.log(`Found item: ${item.id}, ${item.itemNumber}`);
//     }
  
//     // Find customer with "KWH Venture, LLC" name
//     const CUSTOMER_NAME = this.customerName;

//     const customer = await this.prisma.customer.findFirst({
//       where: {
//         name: CUSTOMER_NAME
//       }
//     });
  
//     if (customer) {
//       console.log(`Found customer: ${customer.id}, ${customer.name}`);
//     } else {
//       console.log(`Customer '${CUSTOMER_NAME}' not found`);
//     }
  
//     // Create or update the Recipe record and link it to the Mashing Unit Procedure
//     const existingRecipe = await this.prisma.recipe.findFirst({
//       where: {
//         // Recipe: "WCL-75-15-00-10-R01",
//         Recipe: this.recipeName,
//       }
//     });
  
//     // Create instances of phase parameters
//     const recipeParameters = [
//       { name: 'HighWineProof', setpointValue: 140 },
//       { name: 'LowWineProof', setpointValue: 100 },
//       { name: 'FinalProof', setpointValue: 125 },
//       { name: 'BaseLoss', setpointValue: 0.5 },
//       { name: 'BeerFeedTray', setpointValue: 15 },
//       { name: 'FermentationAge', setpointValue: 72 },
//       { name: 'ControlTemperature', setpointValue: 80 },
//       { name: 'CooksPerFerm', setpointValue: 3 },
//       { name: 'TopOffFrequency', setpointValue: 24 },
//       { name: 'TopOffQuantity', setpointValue: 100 },
//       { name: 'TopOffTemperature', setpointValue: 80 },
//       { name: 'MashpH', setpointValue: 5.1 },
//       { name: 'MashRatio', setpointValue: 3.5 },
//       { name: 'RatioByFerm', setpointValue: 2.8 },
//       { name: 'FermSetTemp', setpointValue: 80 },
//       { name: 'StarterSweetpH', setpointValue: 5.1 },
//       { name: 'TotalGrainWeight', setpointValue: 20500 },
//       { name: 'TotalLiquid', setpointValue: 70000 },
//       { name: 'NumberOfCooks', setpointValue: 9 },
//       { name: 'AssumedFermABV', setpointValue: 12.5 }
//     ];
  
//     let newParams: RecipeParameter[] = [];
//     for (const param of recipeParameters) {
//       const classParam = await this.prisma.recipeParameter.findFirst({
//         where: {
//           recipeParamName: param.name,
//           isClassDefinition: true
//         }
//       });
//       if (classParam) {
//         console.log(`Updating existing recipe parameter: ${param.name}`);
//         newParams.push(await this.prisma.recipeParameter.create({
//           data: {
//             className: classParam.className,
//             recipeParamName: param.name,
//             recipeNumericalSetpoint: param.setpointValue,
//             description: classParam.description,
//             isClassDefinition: false,
//             recipeSetpointType: classParam.recipeSetpointType,
//             createdBy: this.username,
//             // createdBy: "pmannion",
//             // recipeSetpointUpperLimit: classParam.recipeSetpointUpperLimit,
//             // recipeSetpointLowerLimit: classParam.recipeSetpointLowerLimit,
//             // recipeSetpointNumericalValue: param.setpointValue,
//           }
//         }));
//       } else {
//         console.log(`Phase parameter ${param.name} already exists, skipping.`);
//       }
//     }
  
//     let recipe: Recipe;
//     if (existingRecipe) {
//       console.log("Mashing Recipe already exists, updating...");
//       recipe = await this.prisma.recipe.update({
//         where: { id: existingRecipe.id },
//         data: {
//           unitProcedures: {
//             connect: { id: mashingUnitProcedure.id }
//           },
//         }
//       });
//       console.log("Mashing Recipe updated successfully");
//     } else {
//       console.log("Creating new Mashing Recipe...");
//       recipe = await this.prisma.recipe.create({
//         data: {
//           Recipe: this.recipeName,
//           revision: 1,
//           createdBy: this.username,
//           // parameters: {
//           //   connect: newParams.map(param => ({ id: param.id }))
//           // },
//           unitProcedures: {
//             connect: { id: mashingUnitProcedure.id }
//           },
//           customer: {
//             connect: { id: customer?.id }
//           },
//           item: {
//             connect: { id: (item as Item).id }
//           },
//           parameters: {
//             connect: newParams.map(param => ({ id: param.id }))
//           }
//         }
//       });
//       console.log("New Mashing Recipe created successfully:", recipe.id);
//     }
  
//     // Create a recipe group and add the recipe to it
//     console.log("Creating recipe group and adding recipe...");
//     let recipeGroup: RecipeGroup;
//     const recipeGroupName = this.recipeName.split('-').slice(1, -1).join('-');
//     const existingRecipeGroup = await this.prisma.recipeGroup.findFirst({
//       where: {
//         recipe: { equals: recipeGroupName }
//       }
//     });
  
//     if (existingRecipeGroup) {
//       console.log("Recipe group 'Mashing Recipes' already exists, updating...");
//       recipeGroup = await this.prisma.recipeGroup.update({
//         where: { id: existingRecipeGroup.id },
//         data: {
//           recipes: {
//             connect: { id: recipe.id }
//           }
//         }
//       });
//       console.log("Recipe added to existing group successfully");
//     } else {
//       console.log("Creating new recipe group 'Mashing Recipes'...");
//       recipeGroup = await this.prisma.recipeGroup.create({
//         data: {
//           recipe: recipeGroupName,
//           createdBy: this.username,
//           recipes: {
//             connect: { id: recipe.id }
//           }
//         }
//       });
//       console.log("New recipe group created and recipe added successfully:", recipeGroup.id);
//     }
  
//     // Create a sample sales order
//     console.log("Creating sample sales order...");
//     let salesOrder: SalesOrder;
//     const existingSalesOrder = await this.prisma.salesOrder.findFirst({
//       where: {
//         customer: { id: customer?.id }
//       }
//     });
  
//     if (existingSalesOrder) {
//       console.log("Sample sales order already exists, skipping creation.");
//       salesOrder = existingSalesOrder;
//     } else {
//       const salesOrderNumber = (await this.prisma.salesOrder.count()) + 1;
//       const newSalesOrder = await this.prisma.salesOrder.create({
//         data: {
//           item: {
//             connect: { id: (item as Item).id }
//           },
//           customer: {
//             connect: { id: customer?.id }
//           },
//           createdBy: this.username,
//           // orderDate: new Date(),
//           // requestedShipDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
//           quantity: this.runQuantity,
//           name: `SO${salesOrderNumber.toString().padStart(3, '0')}`,
//           // units: "Barrels",
//         }
//       });
  
//       console.log("Sample sales order created successfully:", newSalesOrder.id);
  
//       // Update the salesOrder variable for use in production order creation
//       salesOrder = newSalesOrder;
//     }
  
//     // Create a sample production order
//     console.log("Creating sample production order...");
  
//     const existingProductionOrder = await this.prisma.productionOrder.findFirst({
//       where: {
//         recipe: { Recipe: this.recipeName },
//         item: { id: (item as Item).id },
//         bom: { id: bom?.id }
//       }
//     });
  
//     if (existingProductionOrder) {
//       console.log("Sample production order already exists, skipping creation.");
//     } else {
//       const currentDate = new Date();
//       const dayOfYear = (Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()) - Date.UTC(currentDate.getFullYear(), 0, 0)) / 24 / 60 / 60 / 1000;
//       const prOCount = await this.prisma.productionOrder.count(
//         {
//           where: {
//             name: {
//               startsWith: 'PRO'+dayOfYear.toString().padStart(3, '0')
//             }
//           }
//         }
//       )
//       const prOName = `PRO${dayOfYear.toString().padStart(3, '0')}${(prOCount + 1).toString().padStart(3, '0')}`;

//       const newProductionOrder = await this.prisma.productionOrder.create({
//         data: {
//           recipe: {
//             connect: { id: recipe.id }
//           },
//           item: {
//             connect: { id: (item as Item).id }
//           },
//           bom: {
//             connect: { id: bom?.id }
//           },
//           customer: {
//             connect: { id: customer?.id }
//           },
//           salesOrder: {
//             connect: { id: salesOrder?.id }
//           },
//           createdBy: this.username,
//           status: EnumProductionOrderStatus.Initiated,
//           customerCode: customer?.customerCode,
//           units: 'Barrels',
//           quantity: this.runQuantity,
//           name: prOName,
//           startDate: new Date(),
//           endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
//         }
//       });
  
//       // Create a sample schedule order
//       console.log("Creating sample schedule order...");
//       const schOCount = await this.prisma.scheduleOrder.count(
//         {
//           where: {
//             name: {
//               startsWith: 'SHO'+dayOfYear.toString().padStart(3, '0')
//             }
//           }
//         }
//       )
//       const schOName = `SHO${dayOfYear.toString().padStart(3, '0')}${(schOCount + 1).toString().padStart(3, '0')}`;
//       const newScheduleOrder = await this.prisma.scheduleOrder.create({
//         data: {
//           productionOrders: {
//             connect: { id: newProductionOrder.id }
//           },
//           status: EnumScheduleOrderStatus.Scheduled,
//           createdBy: this.username,
//           estimatedStart: new Date(),
//           estimatedEnd: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000), // 7 days from now
//           recipeName: this.recipeName,
//           productionOrderAllocation: this.runQuantity,
//           recipeGroup: {
//             connect: { id: recipeGroup.id }
//           },
//           name: schOName,
//         }
//       });
  
//       console.log("Sample schedule order created successfully:", newScheduleOrder.id);
  
//       // Create a sample schedule order queue record
//       console.log("Creating sample schedule order queue record...");
//       const queueIndex = await this.prisma.scheduleOrderQueue.findFirst({
//         orderBy: {
//           queueIndex: 'desc'
//         }
//       });
//       const newScheduleOrderQueue = await this.prisma.scheduleOrderQueue.create({
//         data: {
//           scheduleOrder: {
//             connect: { id: newScheduleOrder.id }
//           },
//           queueIndex: queueIndex?.queueIndex ? queueIndex.queueIndex + 1 : 1,
//           createdBy: this.username,
//           nextUnitProcedureName: EnumUnitProcedureName.Mashing01,
//           nextUnitProcedure: {
//             connect: { id: mashingUnitProcedure.id }
//           }
//         }
//       });
  
//       console.log("Sample schedule order queue record created successfully:", newScheduleOrderQueue.id);
  
//       console.log("Sample production order created successfully:", newProductionOrder.id);
//     }
//   }
// }

@Injectable()
export class RecipeCreationService {
  private unitProcedureClassDefs: UnitProcedure[] = [];
  private mashingRecipeProcedure: Procedure | null = null;
  private mashInstance: UnitProcedure | null = null;
  private bom: Bom | null = null;
  private cookOperations: Operation[] = [];
  private mashingUnitProcedure: UnitProcedure | null = null;
  private item: Item | null = null;
  private customer: Customer | null = null;
  private recipeParameters: RecipeParameter[] = [];
  private quantity: number = 0;
  private salesOrder: SalesOrder | null = null;
  private productionOrder: ProductionOrder | null = null;
  private scheduleOrder: ScheduleOrder | null = null;
  private recipeGroup: RecipeGroup | null = null;
  private recipe: Recipe | null = null;
  private createRecipeDto: { fgItemNumber: string; bomName: string; bomRevision: string; recipeName: string; startCook: number; numberOfCooks: number; customerName: string; mashingSequenceData: any; runQuantity: number; salesOrderNumber?: string; productionOrderNumber?: string; scheduleOrderNumber?: string; numberOfCooksPerFerm?: number; username: string; } = {
    fgItemNumber: '',
    bomName: '',
    bomRevision: '',
    recipeName: '',
    startCook: 0,
    numberOfCooks: 0,
    customerName: '',
    mashingSequenceData: {},
    runQuantity: 0,
    salesOrderNumber: '',
    productionOrderNumber: '',
    scheduleOrderNumber: '',
    numberOfCooksPerFerm: 0,
    username: ''
  }

  constructor(
    private readonly prisma: PrismaService,
    // protected readonly fgItemNumber: string,
    // protected readonly bomName: string,
    // protected readonly bomRevision: string,
    // protected readonly recipeName: string,
    // protected readonly startCook: number,
    // protected readonly numberOfCooks: number,
    // protected readonly customerName: string,
    // protected readonly mashingSequenceData: any,
    // protected readonly runQuantity: number,
    // protected readonly salesOrderNumber: string = '',
    // protected readonly productionOrderNumber: string = '',
    // protected readonly scheduleOrderNumber: string = '',
    // protected readonly username: string

  ) {}

  async createRecipe(createRecipeDto: { fgItemNumber: string; bomName: string; bomRevision: string; recipeName: string; startCook: number; numberOfCooks: number; customerName: string; mashingSequenceData: any; runQuantity: number; salesOrderNumber?: string; productionOrderNumber?: string; scheduleOrderNumber?: string; numberOfCooksPerFerm?: number; username: string; }) {
    this.createRecipeDto = createRecipeDto;
    return this.prisma.$transaction(async (prisma) => {
      const mashingRecipeProcedure = await this.findMashingRecipeProcedure();
      if (!mashingRecipeProcedure) return;

      const unitProcedureInstances = await this.createUnitProcedureInstances();
      if (!unitProcedureInstances || !Array.isArray(unitProcedureInstances)) return;

      const mashingUnitProcedure = unitProcedureInstances.find((up: UnitProcedure) => up.name.includes("Mashing01"));
      if (!mashingUnitProcedure) return;

      const bom = await this.findBom();
      if (!bom) return;

      const cookOperations = await this.createCookOperations(mashingUnitProcedure);
      if (!cookOperations) return;
      await this.createEquipmentPhases(cookOperations, bom);

      const item = await this.getItemByItemNumber(createRecipeDto.fgItemNumber);
      const customer = await this.findCustomer();

      const recipe = await this.createOrUpdateRecipe(mashingUnitProcedure, customer, item);
      const recipeGroup = await this.createOrUpdateRecipeGroup(recipe);

      const salesOrder = await this.createSalesOrder(customer, item);
      await this.createProductionAndScheduleOrders(createRecipeDto.runQuantity);

      return { recipe, recipeGroup, salesOrder };
    });
  }

  private async findMashingRecipeProcedure() {
    // Find Unit Procedure class definitions
    this.unitProcedureClassDefs = await this.prisma.unitProcedure.findMany({
      where: {
        isClassDef: true
      }
    });
  
    console.log("Unit Procedure Class Definitions:", this.unitProcedureClassDefs);

    const mashingRecipeProcedure = await this.prisma.procedure.findFirst({
      where: {
        name: "Line1",
        isClassDefinition: false
      },
    });

    if (!mashingRecipeProcedure) {
      console.error('Mashing recipe procedure not found');
      return null;
    }

    console.log('Mashing recipe procedure found:', mashingRecipeProcedure.id);
    this.mashingRecipeProcedure = mashingRecipeProcedure;
    return mashingRecipeProcedure;
  }

  private async createUnitProcedureInstances() {
    // Create instances of Unit Procedures
    for (const classDef of this.unitProcedureClassDefs) {
      const existingInstance = await this.prisma.unitProcedure.findFirst({
        where: {
          name: classDef.name,
          isClassDef: false
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      this.mashInstance = existingInstance;
      // if (!existingInstance) {
      if (true) {
        const newInstance = await this.prisma.unitProcedure.create({
          data: {
            name: classDef.name,
            path: classDef.path,
            isClassDef: false,
            classId: { connect: { id: classDef.id } },
            revision: 0,
            description: `Instance of ${classDef.name}`,
            createdBy: this.createRecipeDto.username,
            procedure: { connect: { id: this.mashingRecipeProcedure?.id } }
          }
        });
        console.log(`Created new Unit Procedure instance: ${newInstance.name}`);
        if (newInstance.name.includes("Mashing01")) {
          this.mashInstance = newInstance;
        }
      } else {
        console.log(`Instance of ${classDef.name} already exists, skipping.`);
        // mashIstance = existingInstance;
      }
      if (!this.mashInstance) {
        console.log(`Mashing unit procedure instance not found`);
        this.mashInstance = existingInstance;
      }
    }
    return this.mashInstance;
  }

  private async findBom() {
    const bom = await this.prisma.bom.findFirst({
      where: {
        bomName: this.createRecipeDto.bomName,
        bomRevision: this.createRecipeDto.bomRevision,
      },
      include: {
        bomItem: true
      }
    });

    if (!bom) {
      console.log(`No active BOM found for item number: ${this.createRecipeDto.fgItemNumber}`);
      return null;
    }

    console.log(`Found BOM for item number: ${this.createRecipeDto.fgItemNumber}`);
    this.bom = bom;
    return bom;
  }

  private async getMashingUnitProcedure() {
    if (!this.mashInstance) {
      console.log(`Mashing unit procedure instance not found`);
      return;
    }
    const mashingUnitProcedure = await this.prisma.unitProcedure.findFirst({
      where: {
        id: this.mashInstance.id,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  
    if (!mashingUnitProcedure) {
      console.error("Mashing Unit Procedure instance not found");
      return;
    }
    this.mashingUnitProcedure = mashingUnitProcedure;
    return mashingUnitProcedure;
  }

  private async createCookOperations(mashingUnitProcedure: UnitProcedure) {
    const operationClassDefs = await this.prisma.operation.findMany({
      where: {
        isClassDefinition: true
      }
    });

    console.log("Operation Class Definitions:", operationClassDefs);

    const totalNumberOfCooks = this.createRecipeDto.numberOfCooks + this.createRecipeDto.startCook;
    const cookOperations: Operation[] = [];

    for (let cookNumber = this.createRecipeDto.startCook; cookNumber < totalNumberOfCooks; cookNumber++) {
      // const fermNumber = Math.floor(cookNumber / this.numberOfCooksPerFerm) + 1;
      const fermNumber = Math.floor(cookNumber / 3) + 1;
      
      for (const classDef of operationClassDefs) {
        const newOperation = await this.prisma.operation.create({
          data: {
            name: EnumOperationName.Cook,
            path: classDef.path,
            isClassDefinition: false,
            classId: { connect: { id: classDef.id } },
            revision: 0,
            description: `Instance of ${classDef.name} for Cook ${cookNumber}, Fermentation ${fermNumber}`,
            createdBy: this.createRecipeDto.username,
            unitProcedure: { connect: { id: mashingUnitProcedure.id } },
            abbreviation: 'MAS'
          }
        });
        
        console.log(`Created new Operation instance: ${newOperation.name}`);
        cookOperations.push(newOperation);
      }
    }

    this.cookOperations = cookOperations;
    return cookOperations;
  }

  private async createEquipmentPhases(cookOperations: Operation[], bom: Bom | null) {
    const totalNumberOfCooks = this.createRecipeDto.numberOfCooks + this.createRecipeDto.startCook;

    const mashingProtocol = this.createRecipeDto.mashingSequenceData;
    for (let cookIndex = this.createRecipeDto.startCook; cookIndex < totalNumberOfCooks; cookIndex++) {
      const cookOperation = await this.prisma.operation.findFirst({
        where: {
          id: this.cookOperations[cookIndex].id
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
  
      // Update the mashingProtocol with the mapped enum values
      const mappedMashingProtocol = mashingProtocol.map((phase: { action: string | number; }) => ({
        ...phase,
        action: phaseNameMap[phase.action] || phase.action
      }));
      
      for (const [phaseIndex, phase] of mashingProtocol.entries()) {
        const existingPhase = await this.prisma.equipmentPhase.findFirst({
          where: {
            name: phaseNameMap[phase.action] || phase.action as EnumEquipmentPhaseName,
            operation: {
              id: this.cookOperations[cookIndex].id
            },
            operationSequenceIndex: phaseIndex,
          },
          include: {
            operation: true
          }
        });
  
        if (!existingPhase) {
          const cookOperation: Operation | null = await this.prisma.operation.findFirst({
            where: {
              name: EnumOperationName.Cook,
              isClassDefinition: false,
              unitProcedure: { id: this.mashingUnitProcedure?.id },
              procedureSequenceIndex: cookIndex
            },
            orderBy: { createdAt: 'desc' }
          });
  
          if (cookOperation) {
  
            const stepType = (phase.action === "Hold") ? phase.holdType : (phase.action === "Add Grain") ? phase.grainType : (phase.action === "Add Liquid") ? phase.liquidType01 : undefined;
            const newPhase = await this.prisma.equipmentPhase.create({
              data: {
                name: phaseNameMap[phase.action] || phase.action as EnumEquipmentPhaseName,
                path: `${this.mashingUnitProcedure?.path}/Cook${cookIndex + 1}/${phase.action}`,
                isClassDefinition: false,
                revision: 0,
                description: `Cook ${cookIndex + 1}`,
                createdBy: this.createRecipeDto.username,
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
  
            for (const param of parameterData) {
              await this.prisma.phaseParameter.create({
                data: {
                  name: param.name,
                  staticName: param.name as EnumPhaseParameterStaticName,
                  setpointNumericalValue: param.value as number,
                  units: param.units,
                  description: param.name,
                  isClassDef: false,
                  equipmentPhases: { connect: { id: newPhase.id } },
                  createdBy: this.createRecipeDto.username,
                  setpointType: EnumPhaseParameterSetpointType.Numeric,
                }
              });
            }
  
            // Link BOM components to their equipment phases - these will be the "class definitions"
            if (bom) {
              const bomComponents = await this.prisma.bomItem.findMany({
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
                    if (component.quantity === phase.qty) {
                      await this.prisma.equipmentPhase.update({
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
                    if (component.quantity !== phase.notQty) {
                      await this.prisma.equipmentPhase.update({
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
                    await this.prisma.equipmentPhase.update({
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
                    await this.prisma.equipmentPhase.update({
                      where: { id: newPhase.id },
                      data: {
                        bomItem: {
                          connect: { id: component.id },
                        },
                      },
                    });
                    console.log(`Linked specific corn BOM component ${component.item.itemNumber} to Equipment Phase ${newPhase.name}`);
                  }
                } else if (phase.action === "Add Additive" && phase.additiveType && component.item.itemNumber.toLowerCase().includes(phase.additiveType.toLowerCase())) {
                  console.log(`Add Additive: ${component.item.itemNumber}`);
                  // if (phase.additiveType == "Teramyl") {
                  //   console.log(`Teramyl: ${component.item.itemNumber}`);
                  // } else if (phase.additiveType)
                  await this.prisma.equipmentPhase.update({
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
  }

  private async getItemByItemNumber(itemNumber: string) {
    const item = await this.prisma.item.findFirst({
      where: {
        itemNumber: {
          equals: itemNumber,
          mode: 'insensitive'
        }
      },
    });

    if (!item) {
      throw new Error(`Item with itemNumber ${itemNumber} not found`);
    }

    this.item = item;
    return item;
  }

  private async findCustomer() {
    const customer = await this.prisma.customer.findFirst({
      where: {
        name: {
          equals: this.createRecipeDto.customerName,
          mode: 'insensitive'
        }
      },
    });

    if (!customer) {
      console.log(`Customer with name ${this.createRecipeDto.customerName} not found`);
      return null;
    }

    console.log(`Found customer: ${customer.name}`);
    this.customer = customer;
    return customer;
  }

  private async createRecipeParameters() {
    const recipeParameters = [
      { name: 'HighWineProof', setpointValue: 140 },
      { name: 'LowWineProof', setpointValue: 100 },
      { name: 'FinalProof', setpointValue: 125 },
      { name: 'BaseLoss', setpointValue: 0.5 },
      { name: 'BeerFeedTray', setpointValue: 15 },
      { name: 'FermentationAge', setpointValue: 72 },
      { name: 'ControlTemperature', setpointValue: 80 },
      { name: 'CooksPerFerm', setpointValue: 3 },
      { name: 'TopOffFrequency', setpointValue: 24 },
      { name: 'TopOffQuantity', setpointValue: 100 },
      { name: 'TopOffTemperature', setpointValue: 80 },
      { name: 'MashpH', setpointValue: 5.1 },
      { name: 'MashRatio', setpointValue: 3.5 },
      { name: 'RatioByFerm', setpointValue: 2.8 },
      { name: 'FermSetTemp', setpointValue: 80 },
      { name: 'StarterSweetpH', setpointValue: 5.1 },
      { name: 'TotalGrainWeight', setpointValue: 20500 },
      { name: 'TotalLiquid', setpointValue: 70000 },
      { name: 'NumberOfCooks', setpointValue: 9 },
      { name: 'AssumedFermABV', setpointValue: 12.5 }
    ];
    let newParams: RecipeParameter[] = [];
    for (const param of recipeParameters) {
      const classParam = await this.prisma.recipeParameter.findFirst({
        where: {
          recipeParamName: param.name,
          isClassDefinition: true
        }
      });
      if (classParam) {
        console.log(`Updating existing recipe parameter: ${param.name}`);
        newParams.push(await this.prisma.recipeParameter.create({
          data: {
            className: classParam.className,
            recipeParamName: param.name,
            recipeNumericalSetpoint: param.setpointValue,
            description: classParam.description,
            isClassDefinition: false,
            recipeSetpointType: classParam.recipeSetpointType,
            createdBy: this.createRecipeDto.username,
            // recipeSetpointUpperLimit: classParam.recipeSetpointUpperLimit,
            // recipeSetpointLowerLimit: classParam.recipeSetpointLowerLimit,
            // recipeSetpointNumericalValue: param.setpointValue,
          }
        }));
      } else {
        console.log(`Phase parameter ${param.name} already exists, skipping.`);
      }
    }
    this.recipeParameters = newParams;
    return newParams;
  }

  private async createOrUpdateRecipe(mashingUnitProcedure: UnitProcedure, customer: Customer | null, item: Item) {
    const existingRecipe = await this.prisma.recipe.findFirst({
      where: {
        Recipe: mashingUnitProcedure.name,
      }
    });

    if (existingRecipe) {
      console.log(`Updating existing recipe: ${mashingUnitProcedure.name}`);
      return await this.prisma.recipe.update({
        where: { id: existingRecipe.id },
        data: {
          Recipe: mashingUnitProcedure.name,
          customer: {
            connect: { id: customer?.id }
          },
          item: {
            connect: { id: item.id }
          },
          updatedBy: this.createRecipeDto.username
        }
      });
    } else {
      console.log(`Creating new recipe: ${mashingUnitProcedure.name}`);
      return await this.prisma.recipe.create({
        data: {
          Recipe: mashingUnitProcedure.name,
          customer: {
            connect: { id: customer?.id }
          },
          item: {
            connect: { id: item.id }
          },
          createdBy: this.createRecipeDto.username,
          updatedBy: this.createRecipeDto.username,
        }
      });
    }
  }

  private async createOrUpdateRecipeGroup(recipe: Recipe) {
    const existingRecipeGroup = await this.prisma.recipeGroup.findFirst({
      where: {
        recipe: recipe.Recipe,
      }
    });

    if (existingRecipeGroup) {
      console.log(`Updating existing recipe group: ${recipe.Recipe}`);
      return await this.prisma.recipeGroup.update({
        where: { id: existingRecipeGroup.id },
        data: {
          recipe: recipe.Recipe,
          recipes: {
            connect: { id: recipe.id }
          },
          updatedBy: this.createRecipeDto.username
        }
      });
    } else {
      console.log(`Creating new recipe group: ${recipe.Recipe}`);
      return await this.prisma.recipeGroup.create({
        data: {
          recipe: recipe.Recipe,
          recipes: {
            connect: { id: recipe.id }
          },
          createdBy: this.createRecipeDto.username,
          updatedBy: this.createRecipeDto.username,
        }
      });
    }
  }

  private async createSalesOrder(customer: Customer | null, item: Item) {
    console.log(`Creating sales order for ${customer?.name || 'Unknown Customer'} and item ${item.itemName}`);
    
    const salesOrderData = {
      customer: customer ? { connect: { id: customer.id } } : undefined,
      item: { connect: { id: item.id } },
      status: 'Created',
      quantity: 1,
      createdBy: this.createRecipeDto.username,
      updatedBy: this.createRecipeDto.username,
    };

    const salesOrder = await this.prisma.salesOrder.create({
      data: salesOrderData,
    });

    console.log(`Sales order created successfully with id: ${salesOrder.id}`);
    return salesOrder;
  }

  private async createProductionAndScheduleOrders(quantity: number) {
    console.log(`Creating production and schedule orders for recipe: ${this.recipe?.Recipe}, item: ${this.item?.itemName}`);

    // Create production order
    const productionOrder = await this.prisma.productionOrder.create({
      data: {
        recipe: { connect: { id: this.recipe?.id } },
        item: { connect: { id: this.item?.id } },
        bom: { connect: { id: (this.bom as Bom).id } },
        recipeGroup: { connect: { id: this.recipeGroup?.id } },
        status: EnumProductionOrderStatus.Planned,
        quantity: quantity,
        createdBy: this.createRecipeDto.username,
        updatedBy: this.createRecipeDto.username,
        customer: { connect: { id: this.customer?.id } },
      },
    });

    console.log(`Production order created successfully with id: ${productionOrder.id}`);

    // Create schedule order
    const scheduleOrder = await this.prisma.scheduleOrder.create({
      data: {
        productionOrders: { connect: { id: productionOrder.id } },
        status: EnumScheduleOrderStatus.Created,
        createdBy: this.createRecipeDto.username,
        updatedBy: this.createRecipeDto.username,
        recipeName: this.recipe?.Recipe || '',
        productionOrderAllocation: productionOrder.quantity || 0,
        recipeGroup: { connect: { id: this.recipeGroup?.id } },
      },
    });

    console.log(`Schedule order created successfully with id: ${scheduleOrder.id}`);
    this.scheduleOrder = scheduleOrder;
    this.productionOrder = productionOrder;
    return { productionOrder, scheduleOrder };
  }
}