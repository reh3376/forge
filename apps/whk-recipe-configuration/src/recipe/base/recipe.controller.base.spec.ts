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
import { RecipeController } from "../recipe.controller";
import { RecipeService } from "../recipe.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  active: "true",
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  customer: "exampleCustomer",
  customerId: "exampleCustomerId",
  globalId: "exampleGlobalId",
  id: "exampleId",
  itemDescription: "exampleItemDescription",
  itemId: "exampleItemId",
  Recipe: "exampleRecipe",
  revision: 42,
  schemaVersion: "exampleSchemaVersion",
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
};
const CREATE_RESULT = {
  active: "true",
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  customer: "exampleCustomer",
  customerId: "exampleCustomerId",
  globalId: "exampleGlobalId",
  id: "exampleId",
  itemDescription: "exampleItemDescription",
  itemId: "exampleItemId",
  Recipe: "exampleRecipe",
  revision: 42,
  schemaVersion: "exampleSchemaVersion",
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
};
const FIND_MANY_RESULT = [
  {
    active: "true",
    createdAt: new Date(),
    createdBy: "exampleCreatedBy",
    customer: "exampleCustomer",
    customerId: "exampleCustomerId",
    globalId: "exampleGlobalId",
    id: "exampleId",
    itemDescription: "exampleItemDescription",
    itemId: "exampleItemId",
    Recipe: "exampleRecipe",
    revision: 42,
    schemaVersion: "exampleSchemaVersion",
    updatedAt: new Date(),
    updatedBy: "exampleUpdatedBy",
  },
];
const FIND_ONE_RESULT = {
  active: "true",
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  customer: "exampleCustomer",
  customerId: "exampleCustomerId",
  globalId: "exampleGlobalId",
  id: "exampleId",
  itemDescription: "exampleItemDescription",
  itemId: "exampleItemId",
  Recipe: "exampleRecipe",
  revision: 42,
  schemaVersion: "exampleSchemaVersion",
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
};

const service = {
  createRecipe() {
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

describe("Recipe", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: RecipeService,
          useValue: service,
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

  test("POST /recipes", async () => {
    await request(app.getHttpServer())
      .post("/recipes")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      });
  });

  test("GET /recipes", async () => {
    await request(app.getHttpServer())
      .get("/recipes")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          updatedAt: FIND_MANY_RESULT[0].updatedAt.toISOString(),
        },
      ]);
  });

  test("GET /recipes/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/recipes"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /recipes/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/recipes"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        updatedAt: FIND_ONE_RESULT.updatedAt.toISOString(),
      });
  });

  test("POST /recipes existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/recipes")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      })
      .then(function () {
        agent
          .post("/recipes")
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
