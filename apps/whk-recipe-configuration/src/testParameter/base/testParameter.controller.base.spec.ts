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
import { TestParameterController } from "../testParameter.controller";
import { TestParameterService } from "../testParameter.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  active: "true",
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  description: "exampleDescription",
  globalId: "exampleGlobalId",
  id: "exampleId",
  isClassDef: "true",
  name: "exampleName",
  required: "true",
  schemaVersion: "exampleSchemaVersion",
  testDetails: "exampleTestDetails",
  testParamRevision: "exampleTestParamRevision",
  testParamUnits: "exampleTestParamUnits",
  testPass: "true",
  testResult: 42.424242424,
  testSetpointBooleanValue: "true",
  testSetpointLowerLimit: 42.42,
  testSetpointUpperLimit: 42.42,
  testSetpointValue: 42.42,
  testedAt: new Date(),
  testedBy: "exampleTestedBy",
  tooltip: "exampleTooltip",
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
};
const CREATE_RESULT = {
  active: "true",
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  description: "exampleDescription",
  globalId: "exampleGlobalId",
  id: "exampleId",
  isClassDef: "true",
  name: "exampleName",
  required: "true",
  schemaVersion: "exampleSchemaVersion",
  testDetails: "exampleTestDetails",
  testParamRevision: "exampleTestParamRevision",
  testParamUnits: "exampleTestParamUnits",
  testPass: "true",
  testResult: 42.424242424,
  testSetpointBooleanValue: "true",
  testSetpointLowerLimit: 42.42,
  testSetpointUpperLimit: 42.42,
  testSetpointValue: 42.42,
  testedAt: new Date(),
  testedBy: "exampleTestedBy",
  tooltip: "exampleTooltip",
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
};
const FIND_MANY_RESULT = [
  {
    active: "true",
    createdAt: new Date(),
    createdBy: "exampleCreatedBy",
    description: "exampleDescription",
    globalId: "exampleGlobalId",
    id: "exampleId",
    isClassDef: "true",
    name: "exampleName",
    required: "true",
    schemaVersion: "exampleSchemaVersion",
    testDetails: "exampleTestDetails",
    testParamRevision: "exampleTestParamRevision",
    testParamUnits: "exampleTestParamUnits",
    testPass: "true",
    testResult: 42.424242424,
    testSetpointBooleanValue: "true",
    testSetpointLowerLimit: 42.42,
    testSetpointUpperLimit: 42.42,
    testSetpointValue: 42.42,
    testedAt: new Date(),
    testedBy: "exampleTestedBy",
    tooltip: "exampleTooltip",
    updatedAt: new Date(),
    updatedBy: "exampleUpdatedBy",
  },
];
const FIND_ONE_RESULT = {
  active: "true",
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  description: "exampleDescription",
  globalId: "exampleGlobalId",
  id: "exampleId",
  isClassDef: "true",
  name: "exampleName",
  required: "true",
  schemaVersion: "exampleSchemaVersion",
  testDetails: "exampleTestDetails",
  testParamRevision: "exampleTestParamRevision",
  testParamUnits: "exampleTestParamUnits",
  testPass: "true",
  testResult: 42.424242424,
  testSetpointBooleanValue: "true",
  testSetpointLowerLimit: 42.42,
  testSetpointUpperLimit: 42.42,
  testSetpointValue: 42.42,
  testedAt: new Date(),
  testedBy: "exampleTestedBy",
  tooltip: "exampleTooltip",
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
};

const service = {
  createTestParameter() {
    return CREATE_RESULT;
  },
  testParameters: () => FIND_MANY_RESULT,
  testParameter: ({ where }: { where: { id: string } }) => {
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

describe("TestParameter", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: TestParameterService,
          useValue: service,
        },
      ],
      controllers: [TestParameterController],
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

  test("POST /testParameters", async () => {
    await request(app.getHttpServer())
      .post("/testParameters")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        testedAt: CREATE_RESULT.testedAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      });
  });

  test("GET /testParameters", async () => {
    await request(app.getHttpServer())
      .get("/testParameters")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          testedAt: FIND_MANY_RESULT[0].testedAt.toISOString(),
          updatedAt: FIND_MANY_RESULT[0].updatedAt.toISOString(),
        },
      ]);
  });

  test("GET /testParameters/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/testParameters"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /testParameters/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/testParameters"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        testedAt: FIND_ONE_RESULT.testedAt.toISOString(),
        updatedAt: FIND_ONE_RESULT.updatedAt.toISOString(),
      });
  });

  test("POST /testParameters existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/testParameters")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        testedAt: CREATE_RESULT.testedAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      })
      .then(function () {
        agent
          .post("/testParameters")
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
