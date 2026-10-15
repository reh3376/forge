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
import { BatchParameterConfigurationController } from "../batchParameterConfiguration.controller";
import { BatchParameterConfigurationService } from "../batchParameterConfiguration.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  active: "true",
  batchType: "exampleBatchType",
  category: "exampleCategory",
  createdAt: new Date(),
  decimalPlaces: 42,
  displayName: "exampleDisplayName",
  id: "exampleId",
  isRequired: "true",
  maxValue: 42.42,
  minValue: 42.42,
  parameterName: "exampleParameterName",
  parameterPath: "exampleParameterPath",
  sortOrder: 42,
  targetValue: 42.42,
  tolerance: 42.42,
  units: "exampleUnits",
  updatedAt: new Date(),
};
const CREATE_RESULT = {
  active: "true",
  batchType: "exampleBatchType",
  category: "exampleCategory",
  createdAt: new Date(),
  decimalPlaces: 42,
  displayName: "exampleDisplayName",
  id: "exampleId",
  isRequired: "true",
  maxValue: 42.42,
  minValue: 42.42,
  parameterName: "exampleParameterName",
  parameterPath: "exampleParameterPath",
  sortOrder: 42,
  targetValue: 42.42,
  tolerance: 42.42,
  units: "exampleUnits",
  updatedAt: new Date(),
};
const FIND_MANY_RESULT = [
  {
    active: "true",
    batchType: "exampleBatchType",
    category: "exampleCategory",
    createdAt: new Date(),
    decimalPlaces: 42,
    displayName: "exampleDisplayName",
    id: "exampleId",
    isRequired: "true",
    maxValue: 42.42,
    minValue: 42.42,
    parameterName: "exampleParameterName",
    parameterPath: "exampleParameterPath",
    sortOrder: 42,
    targetValue: 42.42,
    tolerance: 42.42,
    units: "exampleUnits",
    updatedAt: new Date(),
  },
];
const FIND_ONE_RESULT = {
  active: "true",
  batchType: "exampleBatchType",
  category: "exampleCategory",
  createdAt: new Date(),
  decimalPlaces: 42,
  displayName: "exampleDisplayName",
  id: "exampleId",
  isRequired: "true",
  maxValue: 42.42,
  minValue: 42.42,
  parameterName: "exampleParameterName",
  parameterPath: "exampleParameterPath",
  sortOrder: 42,
  targetValue: 42.42,
  tolerance: 42.42,
  units: "exampleUnits",
  updatedAt: new Date(),
};

const service = {
  createBatchParameterConfiguration() {
    return CREATE_RESULT;
  },
  batchParameterConfigurations: () => FIND_MANY_RESULT,
  batchParameterConfiguration: ({ where }: { where: { id: string } }) => {
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

describe("BatchParameterConfiguration", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: BatchParameterConfigurationService,
          useValue: service,
        },
      ],
      controllers: [BatchParameterConfigurationController],
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

  test("POST /batchParameterConfigurations", async () => {
    await request(app.getHttpServer())
      .post("/batchParameterConfigurations")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      });
  });

  test("GET /batchParameterConfigurations", async () => {
    await request(app.getHttpServer())
      .get("/batchParameterConfigurations")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          updatedAt: FIND_MANY_RESULT[0].updatedAt.toISOString(),
        },
      ]);
  });

  test("GET /batchParameterConfigurations/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/batchParameterConfigurations"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /batchParameterConfigurations/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/batchParameterConfigurations"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        updatedAt: FIND_ONE_RESULT.updatedAt.toISOString(),
      });
  });

  test("POST /batchParameterConfigurations existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/batchParameterConfigurations")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      })
      .then(function () {
        agent
          .post("/batchParameterConfigurations")
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
