import { Test } from "@nestjs/testing";
import {
  INestApplication,
  HttpStatus,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import request from "supertest";
import { ACGuard } from "nest-access-control";
import { DefaultAuthGuard } from "../auth/defaultAuth.guard";
import { ACLModule } from "../auth/acl.module";
import { AclFilterResponseInterceptor } from "../interceptors/aclFilterResponse.interceptor";
import { AclValidateRequestInterceptor } from "../interceptors/aclValidateRequest.interceptor";
import { map } from "rxjs";
import { RecipeController } from "./recipe.controller";
import { RecipeService } from "./recipe.service";
import { RecipeCookCreationService } from "./recipe.cookcreation.service";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import { RecipeGenerator } from "./recipe.generation";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  Recipe: "exampleRecipe",
  active: "true",
  cooksPerFerm: 42,
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  customerCode: "exampleCustomerCode",
  estimatedAbv: 42.424242424,
  globalId: "exampleGlobalId",
  id: "exampleId",
  isClassDefinition: "true",
  revision: 42,
  schemaVersion: "exampleSchemaVersion",
  targetProof: 42.424242424,
  totalCooks: 42,
  totalFermenters: 42,
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
};
const CREATE_RESULT = {
  Recipe: "exampleRecipe",
  active: "true",
  cooksPerFerm: 42,
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  customerCode: "exampleCustomerCode",
  estimatedAbv: 42.424242424,
  globalId: "exampleGlobalId",
  id: "exampleId",
  isClassDefinition: "true",
  revision: 42,
  schemaVersion: "exampleSchemaVersion",
  targetProof: 42.424242424,
  totalCooks: 42,
  totalFermenters: 42,
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
};
const FIND_MANY_RESULT = [
  {
    Recipe: "exampleRecipe",
    active: "true",
    cooksPerFerm: 42,
    createdAt: new Date(),
    createdBy: "exampleCreatedBy",
    customerCode: "exampleCustomerCode",
    estimatedAbv: 42.424242424,
    globalId: "exampleGlobalId",
    id: "exampleId",
    isClassDefinition: "true",
    revision: 42,
    schemaVersion: "exampleSchemaVersion",
    targetProof: 42.424242424,
    totalCooks: 42,
    totalFermenters: 42,
    updatedAt: new Date(),
    updatedBy: "exampleUpdatedBy",
  },
];
const FIND_MANY_RESULT_ACTIVE_RECIPES = [
  {
    Recipe: "exampleRecipe",
    productionOrderName: "PRO123456",
    productionOrderId: "exampleProductionOrderId",
    active: "true",
    cooksPerFerm: 42,
    createdAt: new Date(),
    createdBy: "exampleCreatedBy",
    customerCode: "exampleCustomerCode",
    estimatedAbv: 42.424242424,
    globalId: "exampleGlobalId",
    id: "exampleId",
    isClassDefinition: "true",
    revision: 42,
    schemaVersion: "exampleSchemaVersion",
    targetProof: 42.424242424,
    totalCooks: 42,
    totalFermenters: 42,
    updatedAt: new Date(),
    updatedBy: "exampleUpdatedBy",
    ScheduledAt: new Date(),
  },
];
const FIND_ONE_RESULT = {
  Recipe: "exampleRecipe",
  active: "true",
  cooksPerFerm: 42,
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  customerCode: "exampleCustomerCode",
  estimatedAbv: 42.424242424,
  globalId: "exampleGlobalId",
  id: "exampleId",
  isClassDefinition: "true",
  revision: 42,
  schemaVersion: "exampleSchemaVersion",
  targetProof: 42.424242424,
  totalCooks: 42,
  totalFermenters: 42,
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
};

const recipeCookCreationService = {
  createNewCook() {
    return CREATE_RESULT;
  },
  recipes: () => FIND_MANY_RESULT,
  recipe: ({ where }: { where: { id: string } }) => {
    switch (where.id) {
      case existingId:
        return FIND_ONE_RESULT;
      case nonExistingId:
        return null;
    }
  },
};

const CUSTOMER_CODE = "ABC";
const MASH_BILL = '51-00-40-09'; //  Match Item Record
const FINAL_PROOF = 120;
const BARREL_INFO = '53-06-4-0-0'; // Match Item Record - rated capactiy-months of seasoning-char-toast-top/side fill
const CUSTOMER_NAME = "JBM Liquid Assets, LLC"; // This needs to match ERP / MESDB customer reocrd
const ORDER_QTY = 100; // barrels
const TOTAL_GRAIN_WEIGHT = 24080;
const BBLS_PER_FERM = 100;
const USER = 'csummers@whiskeyhouse.com';

const WATER_QTY = 3900;
const BACKSET_QTY = 3600;

const BBL_ITEM_NUMBERS = [
'BBL-ISC02-53-06-4-0-0-Standard4',
'BBL-WVG02-53-06-4-0-0-Standard4'
]

const YEAST_ITEM_NUMBERS_QTYS: { [key: string]: number } = {
'YEA-FER01-Yeast (USW6)': 10,
}

const MASHING_PROTOCOL = [
{ action: "Add Liquid", liquidType01: "Water", liquidType02: "Backset", notQty: 0 },
{ action: "Hold", holdType: "Heat", temperature: 130 },
{ action: "Add Additive", additiveType: "Citric", qty: 0 },
{ action: "Add Grain", grainType: "Malt", qty: 188 },
{ action: "Add Additive", additiveType: "Liquozyme", qty: 1.4 },
{ action: "Add Grain", grainType: "Corn", qty: 12281 },
// { action: "Hold", holdType: "Hold", time: 3 }, // UNCOMMENT IF NEED SECONDARY DROP
// { action: "Add Grain", grainType: "Corn", qty: 20001 }, // UNCOMMENT IF NEED SECONDARY DROP
{ action: "Hold", holdType: "Heat", temperature: 180, time: 20 },
{ action: "Hold", holdType: "Cool", temperature: 170 },
{ action: "Add Grain", grainType: "Wheat", qty: 6500 },
{ action: "Hold", holdType: "Hold", time: 3 }, // UNCOMMENT IF NEED SECONDARY DROP
{ action: "Add Grain", grainType: "Wheat", qty: 3132 }, // UNCOMMENT IF NEED SECONDARY DROP
{ action: "Hold", holdType: "Hold", time: 15 },
{ action: "Hold", holdType: "Cool", temperature: 152 },
{ action: "Add Additive", additiveType: "DIAZYME", qty: 6.6 },
{ action: "Add Additive", additiveType: "Viscoferm", qty: 4.8 },
{ action: "Hold", holdType: "Cool", temperature: 145 },
{ action: "Add Grain", grainType: "Malt", qty: 1700 },
{ action: "Hold", holdType: "Hold", time: 3 }, // UNCOMMENT IF NEED SECONDARY DROP
{ action: "Add Grain", grainType: "Malt", qty: 279 }, // UNCOMMENT IF NEED SECONDARY DROP
{ action: "Hold", holdType: "Hold", time: 10 },
];
const RECIPE_PARAMETERS = [
{ name: 'HighWineProof', setpointValue: 140 },
{ name: 'LowWineProof', setpointValue: 130 },
{ name: 'FinalProof', setpointValue: 120 },
{ name: 'BaseLoss', setpointValue: 0.1 },
{ name: 'BeerFeedTray', setpointValue: 15 },
{ name: 'FermentationAge', setpointValue: 72 },
{ name: 'ControlTemperature', setpointValue: 92 },
{ name: 'CooksPerFerm', setpointValue: 3 },
  { name: 'TopOffFrequency', setpointValue: 24 },
  { name: 'TopOffQuantity', setpointValue: 100 },
  { name: 'TopOffTemperature', setpointValue: 80 },
  { name: 'MashpH', setpointValue: 5.1 },
  { name: 'MashRatio', setpointValue: 3.0 },
  { name: 'RatioByFerm', setpointValue: 2.8 },
  { name: 'FermSetTemp', setpointValue: 80 },
  { name: 'StarterSweetpH', setpointValue: 5.1 },
  { name: 'TotalGrainWeight', setpointValue: 20500 },
  { name: 'TotalLiquid', setpointValue: 70000 },
  { name: 'NumberOfCooks', setpointValue: ORDER_QTY * 3/ BBLS_PER_FERM },
  { name: 'AssumedFermABV', setpointValue: 12.5 }
];

const BIN_ASSIGNMENTS = {
  bin1: 'Corn',
  bin2: 'Rye',
  bin3: 'Wheat',
};

const recipeGenerator = {
  constructorParams: {}, // Store all constructor parameters
  init(params: any) {
    this.constructorParams = params;
  },
  createRecipeData() {
  }
};

const service = {
  createRecipe() {
    return CREATE_RESULT;
  },
  getActiveRecipes() {
    return FIND_MANY_RESULT_ACTIVE_RECIPES;
  },
  recipes: () => FIND_MANY_RESULT_ACTIVE_RECIPES,
  recipe: ({ where }: { where: { id: string } }) => {
    switch (where.id) {
      case existingId:
        return FIND_ONE_RESULT;
      case nonExistingId:
        return null;
    }
  },
};

const basicAuthGuard = {
  canActivate: (context: ExecutionContext) => {
    const argumentHost = context.switchToHttp();
    const request = argumentHost.getRequest();
    request.user = {
      roles: ["user"],
    };
    return true;
  },
};

const acGuard = {
  canActivate: () => {
    return true;
  },
};

const aclFilterResponseInterceptor = {
  intercept: (context: ExecutionContext, next: CallHandler) => {
    return next.handle().pipe(
      map((data) => {
        return data;
      })
    );
  },
};
const aclValidateRequestInterceptor = {
  intercept: (context: ExecutionContext, next: CallHandler) => {
    return next.handle();
  },
};

const mockRabbitMQProducerService = {
  emitMessage: jest.fn(), // Mock the emitMessage method
};

describe("Recipe - Custom", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: RecipeService,
          useValue: service,
        },
        {
          provide: RecipeCookCreationService,
          useValue: recipeCookCreationService,
        },
        {
          provide: RabbitMQProducerService,
          useValue: mockRabbitMQProducerService
        },
        {
          provide: RecipeGenerator,
          useValue: recipeGenerator
        },
      ],
      controllers: [RecipeController],
      imports: [ACLModule],
    })
      .overrideGuard(DefaultAuthGuard)
      .useValue(basicAuthGuard)
      .overrideGuard(ACGuard)
      .useValue(acGuard)
      .overrideInterceptor(AclFilterResponseInterceptor)
      .useValue(aclFilterResponseInterceptor)
      .overrideInterceptor(AclValidateRequestInterceptor)
      .useValue(aclValidateRequestInterceptor)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  test("GET /recipes/active-recipes", async () => {
    await request(app.getHttpServer())
      .get("/recipes/active-recipes")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT_ACTIVE_RECIPES[0],
          createdAt: FIND_MANY_RESULT_ACTIVE_RECIPES[0].createdAt.toISOString(),
          ScheduledAt: FIND_MANY_RESULT_ACTIVE_RECIPES[0].ScheduledAt.toISOString(),
          updatedAt: FIND_MANY_RESULT_ACTIVE_RECIPES[0].updatedAt.toISOString(),
        },
      ]);
  });

  test("POST /recipes/generate-recipe", async () => {
    await request(app.getHttpServer())
      .post("/recipes/generate-recipe")
      .send({
        customerCode: CUSTOMER_CODE,
        mashBill: MASH_BILL,
        finalProof: FINAL_PROOF,
        barrelInfo: BARREL_INFO,
        customerName: CUSTOMER_NAME,
        orderQty: ORDER_QTY,
        totalGrainWeight: TOTAL_GRAIN_WEIGHT,
        bblsPerFerm: BBLS_PER_FERM,
        username: USER,
        waterQty: WATER_QTY,
        backsetQty: BACKSET_QTY,
        bblItemNumbers: BBL_ITEM_NUMBERS,
        yeastItemNumbersQtys: YEAST_ITEM_NUMBERS_QTYS,
        mashingProtocol: MASHING_PROTOCOL,
        recipeParameters: RECIPE_PARAMETERS,
        binAssignments: BIN_ASSIGNMENTS
      })
      .expect(HttpStatus.CREATED)
      .expect({
        message: "Recipe generated successfully",
      });
    });
});
