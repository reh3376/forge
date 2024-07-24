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
import { MashingProtocolStepController } from "../mashingProtocolStep.controller";
import { MashingProtocolStepService } from "../mashingProtocolStep.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  id: "exampleId",
  createdAt: new Date(),
  updatedAt: new Date(),
  index: 42,
  agitatorEnabled: "true",
  agitatorSpdSp: 42.424242424,
  coolEnabled: "true",
  coolTempSp: 42.424242424,
  heatEnabled: "true",
  heatTempSp: 42.424242424,
  isClassDefinition: "true",
  temperatureSetpoint: 42.424242424,
  temperatureActual: 42.424242424,
  createdBy: "exampleCreatedBy",
  updatedBy: "exampleUpdatedBy",
};
const CREATE_RESULT = {
  id: "exampleId",
  createdAt: new Date(),
  updatedAt: new Date(),
  index: 42,
  agitatorEnabled: "true",
  agitatorSpdSp: 42.424242424,
  coolEnabled: "true",
  coolTempSp: 42.424242424,
  heatEnabled: "true",
  heatTempSp: 42.424242424,
  isClassDefinition: "true",
  temperatureSetpoint: 42.424242424,
  temperatureActual: 42.424242424,
  createdBy: "exampleCreatedBy",
  updatedBy: "exampleUpdatedBy",
};
const FIND_MANY_RESULT = [
  {
    id: "exampleId",
    createdAt: new Date(),
    updatedAt: new Date(),
    index: 42,
    agitatorEnabled: "true",
    agitatorSpdSp: 42.424242424,
    coolEnabled: "true",
    coolTempSp: 42.424242424,
    heatEnabled: "true",
    heatTempSp: 42.424242424,
    isClassDefinition: "true",
    temperatureSetpoint: 42.424242424,
    temperatureActual: 42.424242424,
    createdBy: "exampleCreatedBy",
    updatedBy: "exampleUpdatedBy",
  },
];
const FIND_ONE_RESULT = {
  id: "exampleId",
  createdAt: new Date(),
  updatedAt: new Date(),
  index: 42,
  agitatorEnabled: "true",
  agitatorSpdSp: 42.424242424,
  coolEnabled: "true",
  coolTempSp: 42.424242424,
  heatEnabled: "true",
  heatTempSp: 42.424242424,
  isClassDefinition: "true",
  temperatureSetpoint: 42.424242424,
  temperatureActual: 42.424242424,
  createdBy: "exampleCreatedBy",
  updatedBy: "exampleUpdatedBy",
};

const service = {
  createMashingProtocolStep() {
    return CREATE_RESULT;
  },
  mashingProtocolSteps: () => FIND_MANY_RESULT,
  mashingProtocolStep: ({ where }: { where: { id: string } }) => {
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

describe("MashingProtocolStep", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: MashingProtocolStepService,
          useValue: service,
        },
      ],
      controllers: [MashingProtocolStepController],
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

  test("POST /mashingProtocolSteps", async () => {
    await request(app.getHttpServer())
      .post("/mashingProtocolSteps")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      });
  });

  test("GET /mashingProtocolSteps", async () => {
    await request(app.getHttpServer())
      .get("/mashingProtocolSteps")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          updatedAt: FIND_MANY_RESULT[0].updatedAt.toISOString(),
        },
      ]);
  });

  test("GET /mashingProtocolSteps/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/mashingProtocolSteps"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /mashingProtocolSteps/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/mashingProtocolSteps"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        updatedAt: FIND_ONE_RESULT.updatedAt.toISOString(),
      });
  });

  test("POST /mashingProtocolSteps existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/mashingProtocolSteps")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      })
      .then(function () {
        agent
          .post("/mashingProtocolSteps")
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
