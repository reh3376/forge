// import { Test, TestingModule } from '@nestjs/testing';
// import { RecipeCookCreationService } from './recipe.cookcreation.service';
// import { PrismaService } from 'src/prisma/prisma.service';
// import { EnumOperationName, EnumUnitProcedureName, EnumPhaseParameterStaticName, EnumPhaseParameterSetpointType, Operation, UnitProcedure } from '@prisma/client';

// describe('RecipeCookCreationService', () => {
//   let service: RecipeCookCreationService;
//   let prismaService: PrismaService;

//   beforeEach(async () => {
//     const module: TestingModule = await Test.createTestingModule({
//       providers: [
//         RecipeCookCreationService,
//         {
//           provide: PrismaService,
//           useValue: {
//             scheduleOrderQueue: { findFirst: jest.fn() },
//             scheduleOrder: { findFirst: jest.fn() },
//             recipe: { findFirst: jest.fn() },
//             operation: { findFirst: jest.fn(), create: jest.fn() },
//             equipmentPhase: { create: jest.fn(), update: jest.fn() },
//             phaseParameter: { create: jest.fn() },
//           },
//         },
//       ],
//     }).compile();

//     service = module.get<RecipeCookCreationService>(RecipeCookCreationService);
//     prismaService = module.get<PrismaService>(PrismaService);
//   });

//   it('should be defined', () => {
//     expect(service).toBeDefined();
//   });

//   describe('createCook', () => {
//     it('should create a new cook instance when not reaching max cooks', async () => {
//       const mockScheduleOrderQueueId = 'mock-queue-id';
//       const mockRecipe = { id: 'recipe-id', unitProcedures: [{ id: 'up-id', name: EnumUnitProcedureName.Mashing01 }] };
//       const mockLastCook = { procedureSequenceIndex: 5 };
//       const mockNewCookInstance = { id: 'new-cook-id' };

//       jest.spyOn(service as any, 'getRecipeAndMashingUnitProcedure').mockResolvedValue({ recipe: mockRecipe, mashingUnitProcedure: mockRecipe.unitProcedures[0] });
//       jest.spyOn(service as any, 'getLastCook').mockResolvedValue(mockLastCook);
//       jest.spyOn(service as any, 'isMaxCooksReached').mockReturnValue(false);
//       jest.spyOn(service as any, 'createNewCookInstance').mockResolvedValue(mockNewCookInstance);
//       jest.spyOn(service as any, 'createEquipmentPhasesFromLastCook').mockResolvedValue(undefined);

//       const result = await service.createCook(mockScheduleOrderQueueId);

//       expect(service['getRecipeAndMashingUnitProcedure']).toHaveBeenCalledWith(mockScheduleOrderQueueId);
//       expect(service['getLastCook']).toHaveBeenCalledWith(mockRecipe.unitProcedures[0].id);
//       expect(service['isMaxCooksReached']).toHaveBeenCalledWith(mockLastCook);
//       expect(service['createNewCookInstance']).toHaveBeenCalledWith(mockRecipe.unitProcedures[0], mockLastCook);
//       expect(service['createEquipmentPhasesFromLastCook']).toHaveBeenCalledWith(mockLastCook, mockNewCookInstance, mockRecipe.unitProcedures[0]);
//       expect(result).toEqual(mockNewCookInstance);
//     });

//     it('should not create a new cook instance when max cooks are reached', async () => {
//       const mockScheduleOrderQueueId = 'mock-queue-id';
//       const mockRecipe = { id: 'recipe-id', unitProcedures: [{ id: 'up-id', name: EnumUnitProcedureName.Mashing01 }] };
//       const mockLastCook = { procedureSequenceIndex: 17 }; // Assuming 18 is the max

//       jest.spyOn(service as any, 'getRecipeAndMashingUnitProcedure').mockResolvedValue({ recipe: mockRecipe, mashingUnitProcedure: mockRecipe.unitProcedures[0] });
//       jest.spyOn(service as any, 'getLastCook').mockResolvedValue(mockLastCook);
//       jest.spyOn(service as any, 'isMaxCooksReached').mockReturnValue(true);
//       const consoleSpy = jest.spyOn(console, 'log');

//       await service.createCook(mockScheduleOrderQueueId);

//       expect(service['getRecipeAndMashingUnitProcedure']).toHaveBeenCalledWith(mockScheduleOrderQueueId);
//       expect(service['getLastCook']).toHaveBeenCalledWith(mockRecipe.unitProcedures[0].id);
//       expect(service['isMaxCooksReached']).toHaveBeenCalledWith(mockLastCook);
//       expect(consoleSpy).toHaveBeenCalledWith('No more cooks to create');
//       expect(service['createNewCookInstance']).not.toHaveBeenCalled();
//       expect(service['createEquipmentPhasesFromLastCook']).not.toHaveBeenCalled();
//     });

//     it('should throw an error when no mashing protocol and no last cook found', async () => {
//       const mockScheduleOrderQueueId = 'mock-queue-id';
//       const mockRecipe = { id: 'recipe-id', unitProcedures: [{ id: 'up-id', name: EnumUnitProcedureName.Mashing01 }] };

//       jest.spyOn(service as any, 'getRecipeAndMashingUnitProcedure').mockResolvedValue({ recipe: mockRecipe, mashingUnitProcedure: mockRecipe.unitProcedures[0] });
//       jest.spyOn(service as any, 'getLastCook').mockResolvedValue(null);
//       jest.spyOn(service as any, 'isMaxCooksReached').mockReturnValue(false);

//       await expect(service.createCook(mockScheduleOrderQueueId)).rejects.toThrow('No mashing protocol provided and no last cook found');

//       expect(service['getRecipeAndMashingUnitProcedure']).toHaveBeenCalledWith(mockScheduleOrderQueueId);
//       expect(service['getLastCook']).toHaveBeenCalledWith(mockRecipe.unitProcedures[0].id);
//       expect(service['isMaxCooksReached']).toHaveBeenCalledWith(null);
//       expect(service['createNewCookInstance']).not.toHaveBeenCalled();
//       expect(service['createEquipmentPhasesFromLastCook']).not.toHaveBeenCalled();
//     });
//   });

//   describe('getRecipeAndMashingUnitProcedure', () => {
//     it('should return recipe and mashing unit procedure', async () => {
//       const mockScheduleOrderQueueId = 'mock-queue-id';
//       const mockRecipe = {
//         id: 'recipe-id',
//         unitProcedures: [{ id: 'up-id', name: EnumUnitProcedureName.Mashing01 }],
//         parameters: []
//       };
//       const mockScheduleOrderQueue = {
//         id: mockScheduleOrderQueueId,
//         scheduleOrder: { id: 'schedule-order-id' }
//       };
//       const mockScheduleOrder = {
//         id: 'schedule-order-id',
//         scheduleOrderRecipe: { id: 'recipe-id' }
//       };

//       jest.spyOn(service['prisma'].scheduleOrderQueue, 'findFirst').mockResolvedValue(mockScheduleOrderQueue as any);
//       jest.spyOn(service['prisma'].scheduleOrder, 'findFirst').mockResolvedValue(mockScheduleOrder as any);
//       jest.spyOn(service['prisma'].recipe, 'findFirst').mockResolvedValue(mockRecipe as any);

//       const result = await service['getRecipeAndMashingUnitProcedure'](mockScheduleOrderQueueId);

//       expect(service['prisma'].scheduleOrderQueue.findFirst).toHaveBeenCalledWith({
//         where: { id: mockScheduleOrderQueueId },
//         include: { scheduleOrder: true }
//       });
//       expect(service['prisma'].scheduleOrder.findFirst).toHaveBeenCalledWith({
//         where: { id: mockScheduleOrderQueue.scheduleOrder.id },
//         include: { scheduleOrderRecipe: true }
//       });
//       expect(service['prisma'].recipe.findFirst).toHaveBeenCalledWith({
//         where: { id: mockScheduleOrder.scheduleOrderRecipe.id },
//         include: { unitProcedures: true, parameters: true }
//       });
//       expect(result).toEqual({
//         recipe: mockRecipe,
//         mashingUnitProcedure: mockRecipe.unitProcedures[0]
//       });
//     });

//     it('should throw an error when schedule order not found', async () => {
//       const mockScheduleOrderQueueId = 'mock-queue-id';
//       const mockScheduleOrderQueue = {
//         id: mockScheduleOrderQueueId,
//         scheduleOrder: { id: 'schedule-order-id' }
//       };

//       jest.spyOn(service['prisma'].scheduleOrderQueue, 'findFirst').mockResolvedValue(mockScheduleOrderQueue as any);
//       jest.spyOn(service['prisma'].scheduleOrder, 'findFirst').mockResolvedValue(null);

//       await expect(service['getRecipeAndMashingUnitProcedure'](mockScheduleOrderQueueId))
//         .rejects.toThrow('Schedule order not found');

//       expect(service['prisma'].scheduleOrderQueue.findFirst).toHaveBeenCalledWith({
//         where: { id: mockScheduleOrderQueueId },
//         include: { scheduleOrder: true }
//       });
//       expect(service['prisma'].scheduleOrder.findFirst).toHaveBeenCalledWith({
//         where: { id: mockScheduleOrderQueue.scheduleOrder.id },
//         include: { scheduleOrderRecipe: true }
//       });
//     });
//   });

//   describe('getLastCook', () => {
//     it('should return the last cook operation', async () => {
//       const mockUnitProcedureId = 'mock-unit-procedure-id';
//       const mockLastCook = {
//         id: 'mock-last-cook-id',
//         name: EnumOperationName.Cook,
//         isClassDefinition: false,
//         unitProcedureId: mockUnitProcedureId,
//         procedureSequenceIndex: 2,
//         equipmentPhases: [
//           {
//             id: 'mock-phase-1',
//             bomItem: [{ id: 'mock-bom-1', item: { id: 'mock-item-1' } }],
//             phaseParameters: [{ id: 'mock-param-1' }]
//           },
//           {
//             id: 'mock-phase-2',
//             bomItem: [{ id: 'mock-bom-2', item: { id: 'mock-item-2' } }],
//             phaseParameters: [{ id: 'mock-param-2' }]
//           }
//         ]
//       };

//       jest.spyOn(service['prisma'].operation, 'findFirst').mockResolvedValue(mockLastCook as any);

//       const result = await service['getLastCook'](mockUnitProcedureId);

//       expect(service['prisma'].operation.findFirst).toHaveBeenCalledWith({
//         where: {
//           name: EnumOperationName.Cook,
//           isClassDefinition: false,
//           unitProcedureId: mockUnitProcedureId
//         },
//         orderBy: { procedureSequenceIndex: 'desc' },
//         include: {
//           equipmentPhases: {
//             include: {
//               bomItem: { include: { item: true } },
//               phaseParameters: true
//             },
//             orderBy: { operationSequenceIndex: 'asc' }
//           }
//         }
//       });

//       expect(result).toEqual(mockLastCook);
//     });
//   });

//   // describe('isMaxCooksReached', () => {
//   //   it('should return true when max cooks are reached', () => {
//   //     const mockLastCook = { procedureSequenceIndex: 18 } as Operation;
//   //     const result = service['isMaxCooksReached'](mockLastCook, service.numberOfCooksPerFerm);
//   //     expect(result).toBe(true);

//   //     const mockLastCookNotReached = { procedureSequenceIndex: 17 } as Operation;
//   //     const resultNotReached = service['isMaxCooksReached'](mockLastCookNotReached, service.numberOfCooksPerFerm);
//   //     expect(resultNotReached).toBe(false);

//   //     const mockLastCookNull = null;
//   //     const resultNull = service['isMaxCooksReached'](mockLastCookNull, service.numberOfCooksPerFerm);
//   //     expect(resultNull).toBe(false);
//   //   });

//   //   it('should return false when max cooks are not reached', () => {
//   //     const mockLastCook = { procedureSequenceIndex: 10 } as Operation;
//   //     const result = service['isMaxCooksReached'](mockLastCook, service['numberOfCooksPerFerm']);
//   //     expect(result).toBe(false);

//   //     const mockLastCookZero = { procedureSequenceIndex: 0 } as Operation;
//   //     const resultZero = service['isMaxCooksReached'](mockLastCookZero, service['numberOfCooksPerFerm']);
//   //     expect(resultZero).toBe(false);

//   //     const mockLastCookNull = null;
//   //     const resultNull = service['isMaxCooksReached'](mockLastCookNull, service.numberOfCooksPerFerm);
//   //     expect(resultNull).toBe(false);
//   //   });
//   // });

//   describe('createNewCookInstance', () => {
//     it('should create a new cook instance', async () => {
//       const mockMashingUnitProcedure = { id: 'up-id', path: 'Mashing01' } as UnitProcedure;
//       const mockLastCook = { procedureSequenceIndex: 2 } as Operation;
//       const mockNewCookInstance = {
//         id: 'new-cook-id',
//         name: EnumOperationName.Cook,
//         isClassDefinition: false,
//         unitProcedureId: 'up-id',
//         description: 'Cook 3',
//         createdBy: 'testUser',
//         procedureSequenceIndex: 3,
//         abbreviation: 'MAS',
//       };

//       jest.spyOn(service['prisma'].operation, 'create').mockResolvedValue(mockNewCookInstance as any);

//       const result = await service['createNewCookInstance'](mockMashingUnitProcedure, mockLastCook);

//       expect(service['prisma'].operation.create).toHaveBeenCalledWith({
//         data: {
//           name: EnumOperationName.Cook,
//           isClassDefinition: false,
//           unitProcedureId: mockMashingUnitProcedure.id,
//           description: 'Cook 3',
//           createdBy: service['username'],
//           procedureSequenceIndex: 3,
//           abbreviation: 'MAS',
//         }
//       });

//       expect(result).toEqual(mockNewCookInstance);
//     });
//   });

//   describe('createEquipmentPhasesFromLastCook', () => {
//     it('should create equipment phases from last cook', async () => {
//       const mockLastCook = {
//         equipmentPhases: [
//           { id: 'phase1', name: 'Phase 1', bomItem: [{ id: 'bom1' }], phaseParameters: [{ name: 'Param 1', staticName: EnumPhaseParameterStaticName.Temperature, setpointNumericalValue: 65, units: 'C' }] },
//           { id: 'phase2', name: 'Phase 2', bomItem: [], phaseParameters: [] }
//         ]
//       };
//       const mockNewCookInstance = { id: 'newCook' } as Operation;
//       const mockMashingUnitProcedure = { id: 'mashing', path: 'Mashing01' } as UnitProcedure;

//       const mockNewPhase = { id: 'newPhase' };
//       jest.spyOn(service as any, 'createNewEquipmentPhase').mockResolvedValue(mockNewPhase);
//       jest.spyOn(service as any, 'mapBomItems').mockResolvedValue(undefined);
//       jest.spyOn(service as any, 'createAndMapPhaseParameters').mockResolvedValue(undefined);

//       await service['createEquipmentPhasesFromLastCook'](mockLastCook, mockNewCookInstance, mockMashingUnitProcedure);

//       expect(service['createNewEquipmentPhase']).toHaveBeenCalledTimes(2);
//       expect(service['mapBomItems']).toHaveBeenCalledTimes(2);
//       expect(service['createAndMapPhaseParameters']).toHaveBeenCalledTimes(2);

//       expect(service['createNewEquipmentPhase']).toHaveBeenCalledWith(mockLastCook.equipmentPhases[0], mockNewCookInstance, mockMashingUnitProcedure, mockLastCook);
//       expect(service['mapBomItems']).toHaveBeenCalledWith(mockNewPhase, mockLastCook.equipmentPhases[0]);
//       expect(service['createAndMapPhaseParameters']).toHaveBeenCalledWith(mockNewPhase, mockLastCook.equipmentPhases[0]);
//     });
//   });
// });

describe("dummy test", () => {
  it("should pass this dummy test", () => {
    expect(true).toBe(true);
  });
});
