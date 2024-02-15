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
import { OperationStepController } from "../operationStep.controller";
import { OperationStepService } from "../operationStep.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  bomId: "exampleBomId",
  className: "exampleClassName",
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  editedAt: new Date(),
  editedBy: "exampleEditedBy",
  id: "exampleId",
  operationStepDescription: "exampleOperationStepDescription",
  operationStepName: "exampleOperationStepName",
  operationStepRevision: 42,
  operationStepSequence: 42,
  recipeId: "exampleRecipeId",
  schemaVersion: "exampleSchemaVersion",
  sequenceOperation: "true",
};
const CREATE_RESULT = {
  bomId: "exampleBomId",
  className: "exampleClassName",
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  editedAt: new Date(),
  editedBy: "exampleEditedBy",
  id: "exampleId",
  operationStepDescription: "exampleOperationStepDescription",
  operationStepName: "exampleOperationStepName",
  operationStepRevision: 42,
  operationStepSequence: 42,
  recipeId: "exampleRecipeId",
  schemaVersion: "exampleSchemaVersion",
  sequenceOperation: "true",
};
const FIND_MANY_RESULT = [
  {
    bomId: "exampleBomId",
    className: "exampleClassName",
    createdAt: new Date(),
    createdBy: "exampleCreatedBy",
    editedAt: new Date(),
    editedBy: "exampleEditedBy",
    id: "exampleId",
    operationStepDescription: "exampleOperationStepDescription",
    operationStepName: "exampleOperationStepName",
    operationStepRevision: 42,
    operationStepSequence: 42,
    recipeId: "exampleRecipeId",
    schemaVersion: "exampleSchemaVersion",
    sequenceOperation: "true",
  },
];
const FIND_ONE_RESULT = {
  bomId: "exampleBomId",
  className: "exampleClassName",
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  editedAt: new Date(),
  editedBy: "exampleEditedBy",
  id: "exampleId",
  operationStepDescription: "exampleOperationStepDescription",
  operationStepName: "exampleOperationStepName",
  operationStepRevision: 42,
  operationStepSequence: 42,
  recipeId: "exampleRecipeId",
  schemaVersion: "exampleSchemaVersion",
  sequenceOperation: "true",
};

const service = {
  createOperationStep() {
    return CREATE_RESULT;
  },
  operationSteps: () => FIND_MANY_RESULT,
  operationStep: ({ where }: { where: { id: string } }) => {
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

describe("OperationStep", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: OperationStepService,
          useValue: service,
        },
      ],
      controllers: [OperationStepController],
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

  test("POST /operationSteps", async () => {
    await request(app.getHttpServer())
      .post("/operationSteps")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        editedAt: CREATE_RESULT.editedAt.toISOString(),
      });
  });

  test("GET /operationSteps", async () => {
    await request(app.getHttpServer())
      .get("/operationSteps")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          editedAt: FIND_MANY_RESULT[0].editedAt.toISOString(),
        },
      ]);
  });

  test("GET /operationSteps/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/operationSteps"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /operationSteps/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/operationSteps"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        editedAt: FIND_ONE_RESULT.editedAt.toISOString(),
      });
  });

  test("POST /operationSteps existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/operationSteps")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        editedAt: CREATE_RESULT.editedAt.toISOString(),
      })
      .then(function () {
        agent
          .post("/operationSteps")
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
