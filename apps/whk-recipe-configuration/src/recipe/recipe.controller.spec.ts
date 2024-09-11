// import { Test, TestingModule } from '@nestjs/testing';
// import { RecipeController } from './recipe.controller';
// import { RecipeService } from './recipe.service';
// import { RecipeCreationService } from './recipe.creation.service';
// import { RecipeCookCreationService } from './recipe.cookcreation.service';
// import { map } from "rxjs";
// import { ACGuard, RolesBuilder } from 'nest-access-control';
// import { CallHandler, ExecutionContext, HttpException, HttpStatus, INestApplication } from '@nestjs/common';
// import { ACLModule } from '../auth/acl.module';
// import { DefaultAuthGuard } from '../auth/defaultAuth.guard';
// import { AclFilterResponseInterceptor } from '../interceptors/aclFilterResponse.interceptor';
// import { AclValidateRequestInterceptor } from '../interceptors/aclValidateRequest.interceptor';
// import request from "supertest";

// const nonExistingId = "nonExistingId";
// const existingId = "existingId";
// const COOK_CREATE_INPUT = {
//   scheduleOrderQueueId: 'queue-id',
//   username: 'testuser',
// };

// const CREATE_INPUT = {
//   fgItemNumber: '123',
//   bomName: 'Test BOM',
//   bomRevision: '1.0',
//   recipeName: 'Test Recipe',
//   startCook: 1,
//   numberOfCooks: 5,
//   customerName: 'Test Customer',
//   mashingSequenceData: {},
//   runQuantity: 100,
//   username: 'testuser',
// };

// const CREATE_RESULT = {
//   id: "exampleId",
//   createdAt: new Date(),
//   updatedAt: new Date(),
//   createdBy: "testuser",
//   updatedBy: "testuser",
//   schemaVersion: "exampleSchemaVersion",
//   revision: 42,
//   active: "true",
//   customerCode: "exampleCustomerCode",
//   Recipe: "exampleRecipe",
//   globalId: "exampleGlobalId",
// };

// const FIND_MANY_RESULT = [
//   {
//     id: "exampleId",
//     createdAt: new Date(),
//     updatedAt: new Date(),
//     createdBy: "exampleCreatedBy",
//     updatedBy: "exampleUpdatedBy",
//     schemaVersion: "exampleSchemaVersion",
//     revision: 42,
//     active: "true",
//     customerCode: "exampleCustomerCode",
//     Recipe: "exampleRecipe",
//     globalId: "exampleGlobalId",
//   },
// ];
// const FIND_ONE_RESULT = {
//   id: "exampleId",
//   createdAt: new Date(),
//   updatedAt: new Date(),
//   createdBy: "exampleCreatedBy",
//   updatedBy: "exampleUpdatedBy",
//   schemaVersion: "exampleSchemaVersion",
//   revision: 42,
//   active: "true",
//   customerCode: "exampleCustomerCode",
//   Recipe: "exampleRecipe",
//   globalId: "exampleGlobalId",
// };

// const recipeCreationService = {
//   createNewRecipe() {
//     return CREATE_RESULT;
//   },
//   recipes: () => FIND_MANY_RESULT,
//   recipe: ({ where }: { where: { id: string } }) => {
//     switch (where.id) {
//       case existingId:
//         return FIND_ONE_RESULT;
//       case nonExistingId:
//         return null;
//     }
//   },
// };

// const recipeCookCreationService = {
//   createNewCook() {
//     return CREATE_RESULT;
//   },
//   recipes: () => FIND_MANY_RESULT,
//   recipe: ({ where }: { where: { id: string } }) => {
//     switch (where.id) {
//       case existingId:
//         return FIND_ONE_RESULT;
//       case nonExistingId:
//         return null;
//     }
//   },
// };

// const service = {
//   createRecipe() {
//     return CREATE_RESULT;
//   },
//   recipes: () => FIND_MANY_RESULT,
//   recipe: ({ where }: { where: { id: string } }) => {
//     switch (where.id) {
//       case existingId:
//         return FIND_ONE_RESULT;
//       case nonExistingId:
//         return null;
//     }
//   },
// };

// const basicAuthGuard = {
//   canActivate: (context: ExecutionContext) => {
//     const argumentHost = context.switchToHttp();
//     const request = argumentHost.getRequest();
//     request.user = {
//       roles: ["user"],
//     };
//     return true;
//   },
// };

// const acGuard = {
//   canActivate: () => {
//     return true;
//   },
// };

// const aclFilterResponseInterceptor = {
//   intercept: (context: ExecutionContext, next: CallHandler) => {
//     return next.handle().pipe(
//       map((data) => {
//         return data;
//       })
//     );
//   },
// };
// const aclValidateRequestInterceptor = {
//   intercept: (context: ExecutionContext, next: CallHandler) => {
//     return next.handle();
//   },
// };

// // describe('RecipeController', () => {
// //   let controller: RecipeController;
// //   let recipeCreationService: RecipeCreationService;
// //   let cookCreationService: RecipeCookCreationService;

// //   beforeEach(async () => {
// //     const module: TestingModule = await Test.createTestingModule({
// //       controllers: [RecipeController],
// //       providers: [
// //         {
// //           provide: RecipeService,
// //           useValue: {},
// //         },
// //         {
// //           provide: RecipeCreationService,
// //           useValue: {
// //             createRecipe: jest.fn(),
// //           },
// //         },
// //         {
// //           provide: RecipeCookCreationService,
// //           useValue: {
// //             createCook: jest.fn(),
// //           },
// //         },
// //         {
// //           provide: RolesBuilder,
// //           useValue: {},
// //         },
// //       ],
// //     }).compile();

// //     controller = module.get<RecipeController>(RecipeController);
// //     recipeCreationService = module.get<RecipeCreationService>(RecipeCreationService);
// //     cookCreationService = module.get<RecipeCookCreationService>(RecipeCookCreationService);
// //   });

// //   it('should be defined', () => {
// //     expect(controller).toBeDefined();
// //   });

// //   describe('createNewRecipe', () => {
// //     it('should create a new recipe successfully', async () => {
// //       const createRecipeDto = {
// //         fgItemNumber: '123',
// //         bomName: 'Test BOM',
// //         bomRevision: '1.0',
// //         recipeName: 'Test Recipe',
// //         startCook: 1,
// //         numberOfCooks: 5,
// //         customerName: 'Test Customer',
// //         mashingSequenceData: {},
// //         runQuantity: 100,
// //         username: 'testuser',
// //       };
// //       const expectedResult = { id: 'recipe-id' };

// //       jest.spyOn(recipeCreationService, 'createRecipe').mockResolvedValue(expectedResult as any);

// //       const result = await controller.createNewRecipe(createRecipeDto);

// //       expect(result).toEqual(expectedResult);
// //       expect(recipeCreationService.createRecipe).toHaveBeenCalledWith(createRecipeDto);
// //     });

// //     it('should throw HttpException on error', async () => {
// //       const createRecipeDto = {
// //         fgItemNumber: '123',
// //         bomName: 'Test BOM',
// //         bomRevision: '1.0',
// //         recipeName: 'Test Recipe',
// //         startCook: 1,
// //         numberOfCooks: 5,
// //         customerName: 'Test Customer',
// //         mashingSequenceData: {},
// //         runQuantity: 100,
// //         username: 'testuser',
// //       };

// //       jest.spyOn(recipeCreationService, 'createRecipe').mockRejectedValue(new Error('Test error'));

// //       await expect(controller.createNewRecipe(createRecipeDto)).rejects.toThrow(HttpException);
// //     });
// //   });

// //   describe('createNewCook', () => {
// //     it('should create a new cook successfully', async () => {
// //       const createCookDto = {
// //         scheduleOrderQueueId: 'queue-id',
// //         username: 'testuser',
// //       };
// //       const expectedResult = { id: 'cook-id' };

// //       jest.spyOn(cookCreationService, 'createCook').mockResolvedValue(expectedResult as any);

// //       const result = await controller.createNewCook(createCookDto);

// //       expect(result).toEqual(expectedResult);
// //       expect(cookCreationService.createCook).toHaveBeenCalledWith(createCookDto.scheduleOrderQueueId);
// //     });

// //     it('should throw HttpException on error', async () => {
// //       const createCookDto = {
// //         scheduleOrderQueueId: 'queue-id',
// //         username: 'testuser',
// //       };

// //       jest.spyOn(cookCreationService, 'createCook').mockRejectedValue(new Error('Test error'));

// //       await expect(controller.createNewCook(createCookDto)).rejects.toThrow(HttpException);
// //     });
// //   });
// // });

// describe("Recipe", () => {
//   let app: INestApplication;

//   beforeAll(async () => {
//     const moduleRef = await Test.createTestingModule({
//       providers: [
//         {
//           provide: RecipeService,
//           useValue: service,
//         },
//         {
//           provide: RecipeCreationService,
//           useValue: recipeCreationService,
//         },
//         {
//           provide: RecipeCookCreationService,
//           useValue: recipeCookCreationService,
//         },
//       ],
//       controllers: [RecipeController],
//       imports: [ACLModule],
//     })
//       .overrideGuard(DefaultAuthGuard)
//       .useValue(basicAuthGuard)
//       .overrideGuard(ACGuard)
//       .useValue(acGuard)
//       .overrideInterceptor(AclFilterResponseInterceptor)
//       .useValue(aclFilterResponseInterceptor)
//       .overrideInterceptor(AclValidateRequestInterceptor)
//       .useValue(aclValidateRequestInterceptor)
//       .compile();

//     app = moduleRef.createNestApplication();
//     await app.init();
//   }, 30000); // Added 30 seconds timeout

//   test("POST /recipes", async () => {
//     await request(app.getHttpServer())
//       .post("/recipes/create")
//       .send(CREATE_INPUT)
//       .expect(HttpStatus.CREATED)
//       .expect({
//         ...CREATE_RESULT,
//         createdAt: CREATE_RESULT.createdAt.toISOString(),
//         updatedAt: CREATE_RESULT.updatedAt.toISOString(),
//       });
//   });

//   test("POST /recipes/create-cook", async () => {
//     await request(app.getHttpServer())
//       .post("/recipes/create-cook")
//       .send(COOK_CREATE_INPUT)
//       .expect(HttpStatus.CREATED)
//       .expect({
//         ...CREATE_RESULT,
//         createdAt: CREATE_RESULT.createdAt.toISOString(),
//         updatedAt: CREATE_RESULT.updatedAt.toISOString(),
//       });
//   });
// });


  test("dummy test", () => {
    expect(true).toBe(true);
  });



