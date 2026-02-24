import { Test } from "@nestjs/testing";
import {
  INestApplication,
  HttpStatus,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import request from "supertest";
import { ACGuard } from "nest-access-control";
import { DefaultAuthGuard } from "../../auth/defaultAuth.guard";
import { ACLModule } from "../../auth/acl.module";
import { AclFilterResponseInterceptor } from "../../interceptors/aclFilterResponse.interceptor";
import { AclValidateRequestInterceptor } from "../../interceptors/aclValidateRequest.interceptor";
import { map } from "rxjs";
import { RecipeParameterController } from "../recipeParameter.controller";
import { RecipeParameterService } from "../recipeParameter.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  active: "true",
  className: "exampleClassName",
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  description: "exampleDescription",
  globalId: "exampleGlobalId",
  id: "exampleId",
  isClassDefinition: "true",
  operationIndex: 42,
  recipeNumericalSetpoint: 42.424242424,
  recipeParamDescription: "exampleRecipeParamDescription",
  recipeParamName: "exampleRecipeParamName",
  recipeParamUnits: "exampleRecipeParamUnits",
  recipeSetpointBooleanValue: "true",
  recipeSetpointLowerLimit: 42.42,
  recipeSetpointUpperLimit: 42.42,
  required: "true",
  revision: 42,
  schemaVersion: "exampleSchemaVersion",
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
};
const CREATE_RESULT = {
  active: "true",
  className: "exampleClassName",
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  description: "exampleDescription",
  globalId: "exampleGlobalId",
  id: "exampleId",
  isClassDefinition: "true",
  operationIndex: 42,
  recipeNumericalSetpoint: 42.424242424,
  recipeParamDescription: "exampleRecipeParamDescription",
  recipeParamName: "exampleRecipeParamName",
  recipeParamUnits: "exampleRecipeParamUnits",
  recipeSetpointBooleanValue: "true",
  recipeSetpointLowerLimit: 42.42,
  recipeSetpointUpperLimit: 42.42,
  required: "true",
  revision: 42,
  schemaVersion: "exampleSchemaVersion",
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
};
const FIND_MANY_RESULT = [
  {
    active: "true",
    className: "exampleClassName",
    createdAt: new Date(),
    createdBy: "exampleCreatedBy",
    description: "exampleDescription",
    globalId: "exampleGlobalId",
    id: "exampleId",
    isClassDefinition: "true",
    operationIndex: 42,
    recipeNumericalSetpoint: 42.424242424,
    recipeParamDescription: "exampleRecipeParamDescription",
    recipeParamName: "exampleRecipeParamName",
    recipeParamUnits: "exampleRecipeParamUnits",
    recipeSetpointBooleanValue: "true",
    recipeSetpointLowerLimit: 42.42,
    recipeSetpointUpperLimit: 42.42,
    required: "true",
    revision: 42,
    schemaVersion: "exampleSchemaVersion",
    updatedAt: new Date(),
    updatedBy: "exampleUpdatedBy",
  },
];
const FIND_ONE_RESULT = {
  active: "true",
  className: "exampleClassName",
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  description: "exampleDescription",
  globalId: "exampleGlobalId",
  id: "exampleId",
  isClassDefinition: "true",
  operationIndex: 42,
  recipeNumericalSetpoint: 42.424242424,
  recipeParamDescription: "exampleRecipeParamDescription",
  recipeParamName: "exampleRecipeParamName",
  recipeParamUnits: "exampleRecipeParamUnits",
  recipeSetpointBooleanValue: "true",
  recipeSetpointLowerLimit: 42.42,
  recipeSetpointUpperLimit: 42.42,
  required: "true",
  revision: 42,
  schemaVersion: "exampleSchemaVersion",
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
};

const service = {
  createRecipeParameter() {
    return CREATE_RESULT;
  },
  recipeParameters: () => FIND_MANY_RESULT,
  recipeParameter: ({ where }: { where: { id: string } }) => {
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

describe("RecipeParameter", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: RecipeParameterService,
          useValue: service,
        },
      ],
      controllers: [RecipeParameterController],
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

  test("POST /recipeParameters", async () => {
    await request(app.getHttpServer())
      .post("/recipeParameters")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      });
  });

  test("GET /recipeParameters", async () => {
    await request(app.getHttpServer())
      .get("/recipeParameters")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          updatedAt: FIND_MANY_RESULT[0].updatedAt.toISOString(),
        },
      ]);
  });

  test("GET /recipeParameters/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/recipeParameters"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /recipeParameters/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/recipeParameters"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        updatedAt: FIND_ONE_RESULT.updatedAt.toISOString(),
      });
  });

  test("POST /recipeParameters existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/recipeParameters")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      })
      .then(function () {
        agent
          .post("/recipeParameters")
          .send(CREATE_INPUT)
          .expect(HttpStatus.CONFLICT)
          .expect({
            statusCode: HttpStatus.CONFLICT,
          });
      });
  });

  afterAll(async () => {
    await app.close();
  });
});
