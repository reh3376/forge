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
import { MashingProtocolStepActualController } from "../mashingProtocolStepActual.controller";
import { MashingProtocolStepActualService } from "../mashingProtocolStepActual.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  actualValue: 42.42,
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  id: "exampleId",
  stepCompletedAt: new Date(),
  timeActualValue: 42.42,
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
};
const CREATE_RESULT = {
  actualValue: 42.42,
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  id: "exampleId",
  stepCompletedAt: new Date(),
  timeActualValue: 42.42,
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
};
const FIND_MANY_RESULT = [
  {
    actualValue: 42.42,
    createdAt: new Date(),
    createdBy: "exampleCreatedBy",
    id: "exampleId",
    stepCompletedAt: new Date(),
    timeActualValue: 42.42,
    updatedAt: new Date(),
    updatedBy: "exampleUpdatedBy",
  },
];
const FIND_ONE_RESULT = {
  actualValue: 42.42,
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  id: "exampleId",
  stepCompletedAt: new Date(),
  timeActualValue: 42.42,
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
};

const service = {
  createMashingProtocolStepActual() {
    return CREATE_RESULT;
  },
  mashingProtocolStepActuals: () => FIND_MANY_RESULT,
  mashingProtocolStepActual: ({ where }: { where: { id: string } }) => {
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

describe("MashingProtocolStepActual", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: MashingProtocolStepActualService,
          useValue: service,
        },
      ],
      controllers: [MashingProtocolStepActualController],
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

  test("POST /mashingProtocolStepActuals", async () => {
    await request(app.getHttpServer())
      .post("/mashingProtocolStepActuals")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        stepCompletedAt: CREATE_RESULT.stepCompletedAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      });
  });

  test("GET /mashingProtocolStepActuals", async () => {
    await request(app.getHttpServer())
      .get("/mashingProtocolStepActuals")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          stepCompletedAt: FIND_MANY_RESULT[0].stepCompletedAt.toISOString(),
          updatedAt: FIND_MANY_RESULT[0].updatedAt.toISOString(),
        },
      ]);
  });

  test("GET /mashingProtocolStepActuals/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/mashingProtocolStepActuals"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /mashingProtocolStepActuals/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/mashingProtocolStepActuals"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        stepCompletedAt: FIND_ONE_RESULT.stepCompletedAt.toISOString(),
        updatedAt: FIND_ONE_RESULT.updatedAt.toISOString(),
      });
  });

  test("POST /mashingProtocolStepActuals existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/mashingProtocolStepActuals")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        stepCompletedAt: CREATE_RESULT.stepCompletedAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      })
      .then(function () {
        agent
          .post("/mashingProtocolStepActuals")
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
