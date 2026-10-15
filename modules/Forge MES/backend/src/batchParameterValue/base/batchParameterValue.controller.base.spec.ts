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
import { BatchParameterValueController } from "../batchParameterValue.controller";
import { BatchParameterValueService } from "../batchParameterValue.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  booleanValue: "true",
  collectedAt: new Date(),
  collectionSource: "exampleCollectionSource",
  createdAt: new Date(),
  dataQuality: "exampleDataQuality",
  deviationPercent: 42.42,
  id: "exampleId",
  isWithinSpec: "true",
  numericValue: 42.42,
  parameterConfig: "exampleParameterConfig",
  stringValue: "exampleStringValue",
  updatedAt: new Date(),
  validatedAt: new Date(),
  validatedBy: "exampleValidatedBy",
};
const CREATE_RESULT = {
  booleanValue: "true",
  collectedAt: new Date(),
  collectionSource: "exampleCollectionSource",
  createdAt: new Date(),
  dataQuality: "exampleDataQuality",
  deviationPercent: 42.42,
  id: "exampleId",
  isWithinSpec: "true",
  numericValue: 42.42,
  parameterConfig: "exampleParameterConfig",
  stringValue: "exampleStringValue",
  updatedAt: new Date(),
  validatedAt: new Date(),
  validatedBy: "exampleValidatedBy",
};
const FIND_MANY_RESULT = [
  {
    booleanValue: "true",
    collectedAt: new Date(),
    collectionSource: "exampleCollectionSource",
    createdAt: new Date(),
    dataQuality: "exampleDataQuality",
    deviationPercent: 42.42,
    id: "exampleId",
    isWithinSpec: "true",
    numericValue: 42.42,
    parameterConfig: "exampleParameterConfig",
    stringValue: "exampleStringValue",
    updatedAt: new Date(),
    validatedAt: new Date(),
    validatedBy: "exampleValidatedBy",
  },
];
const FIND_ONE_RESULT = {
  booleanValue: "true",
  collectedAt: new Date(),
  collectionSource: "exampleCollectionSource",
  createdAt: new Date(),
  dataQuality: "exampleDataQuality",
  deviationPercent: 42.42,
  id: "exampleId",
  isWithinSpec: "true",
  numericValue: 42.42,
  parameterConfig: "exampleParameterConfig",
  stringValue: "exampleStringValue",
  updatedAt: new Date(),
  validatedAt: new Date(),
  validatedBy: "exampleValidatedBy",
};

const service = {
  createBatchParameterValue() {
    return CREATE_RESULT;
  },
  batchParameterValues: () => FIND_MANY_RESULT,
  batchParameterValue: ({ where }: { where: { id: string } }) => {
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

describe("BatchParameterValue", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: BatchParameterValueService,
          useValue: service,
        },
      ],
      controllers: [BatchParameterValueController],
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

  test("POST /batchParameterValues", async () => {
    await request(app.getHttpServer())
      .post("/batchParameterValues")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        collectedAt: CREATE_RESULT.collectedAt.toISOString(),
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
        validatedAt: CREATE_RESULT.validatedAt.toISOString(),
      });
  });

  test("GET /batchParameterValues", async () => {
    await request(app.getHttpServer())
      .get("/batchParameterValues")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          collectedAt: FIND_MANY_RESULT[0].collectedAt.toISOString(),
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          updatedAt: FIND_MANY_RESULT[0].updatedAt.toISOString(),
          validatedAt: FIND_MANY_RESULT[0].validatedAt.toISOString(),
        },
      ]);
  });

  test("GET /batchParameterValues/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/batchParameterValues"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /batchParameterValues/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/batchParameterValues"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        collectedAt: FIND_ONE_RESULT.collectedAt.toISOString(),
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        updatedAt: FIND_ONE_RESULT.updatedAt.toISOString(),
        validatedAt: FIND_ONE_RESULT.validatedAt.toISOString(),
      });
  });

  test("POST /batchParameterValues existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/batchParameterValues")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        collectedAt: CREATE_RESULT.collectedAt.toISOString(),
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
        validatedAt: CREATE_RESULT.validatedAt.toISOString(),
      })
      .then(function () {
        agent
          .post("/batchParameterValues")
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
