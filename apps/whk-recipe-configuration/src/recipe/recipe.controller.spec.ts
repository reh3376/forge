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
import { RecipeCreationService } from "./recipe.creation.service";
import { RecipeCookCreationService } from "./recipe.cookcreation.service";

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

const recipeCreationService = {
  createNewRecipe() {
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
          provide: RecipeCreationService,
          useValue: recipeCreationService,
        },
        {
          provide: RecipeCookCreationService,
          useValue: recipeCookCreationService,
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
});
