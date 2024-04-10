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
import { ProductionScheduleController } from "../productionSchedule.controller";
import { ProductionScheduleService } from "../productionSchedule.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  actualEnd: new Date(),
  actualStart: new Date(),
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  duration: 42,
  estimatedEnd: new Date(),
  estimatedStart: new Date(),
  id: "exampleId",
  schemaVersion: "exampleSchemaVersion",
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
};
const CREATE_RESULT = {
  actualEnd: new Date(),
  actualStart: new Date(),
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  duration: 42,
  estimatedEnd: new Date(),
  estimatedStart: new Date(),
  id: "exampleId",
  schemaVersion: "exampleSchemaVersion",
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
};
const FIND_MANY_RESULT = [
  {
    actualEnd: new Date(),
    actualStart: new Date(),
    createdAt: new Date(),
    createdBy: "exampleCreatedBy",
    duration: 42,
    estimatedEnd: new Date(),
    estimatedStart: new Date(),
    id: "exampleId",
    schemaVersion: "exampleSchemaVersion",
    updatedAt: new Date(),
    updatedBy: "exampleUpdatedBy",
  },
];
const FIND_ONE_RESULT = {
  actualEnd: new Date(),
  actualStart: new Date(),
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  duration: 42,
  estimatedEnd: new Date(),
  estimatedStart: new Date(),
  id: "exampleId",
  schemaVersion: "exampleSchemaVersion",
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
};

const service = {
  createProductionSchedule() {
    return CREATE_RESULT;
  },
  productionSchedules: () => FIND_MANY_RESULT,
  productionSchedule: ({ where }: { where: { id: string } }) => {
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

describe("ProductionSchedule", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: ProductionScheduleService,
          useValue: service,
        },
      ],
      controllers: [ProductionScheduleController],
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

  test("POST /productionSchedules", async () => {
    await request(app.getHttpServer())
      .post("/productionSchedules")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        actualEnd: CREATE_RESULT.actualEnd.toISOString(),
        actualStart: CREATE_RESULT.actualStart.toISOString(),
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        estimatedEnd: CREATE_RESULT.estimatedEnd.toISOString(),
        estimatedStart: CREATE_RESULT.estimatedStart.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      });
  });

  test("GET /productionSchedules", async () => {
    await request(app.getHttpServer())
      .get("/productionSchedules")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          actualEnd: FIND_MANY_RESULT[0].actualEnd.toISOString(),
          actualStart: FIND_MANY_RESULT[0].actualStart.toISOString(),
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          estimatedEnd: FIND_MANY_RESULT[0].estimatedEnd.toISOString(),
          estimatedStart: FIND_MANY_RESULT[0].estimatedStart.toISOString(),
          updatedAt: FIND_MANY_RESULT[0].updatedAt.toISOString(),
        },
      ]);
  });

  test("GET /productionSchedules/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/productionSchedules"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /productionSchedules/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/productionSchedules"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        actualEnd: FIND_ONE_RESULT.actualEnd.toISOString(),
        actualStart: FIND_ONE_RESULT.actualStart.toISOString(),
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        estimatedEnd: FIND_ONE_RESULT.estimatedEnd.toISOString(),
        estimatedStart: FIND_ONE_RESULT.estimatedStart.toISOString(),
        updatedAt: FIND_ONE_RESULT.updatedAt.toISOString(),
      });
  });

  test("POST /productionSchedules existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/productionSchedules")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        actualEnd: CREATE_RESULT.actualEnd.toISOString(),
        actualStart: CREATE_RESULT.actualStart.toISOString(),
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        estimatedEnd: CREATE_RESULT.estimatedEnd.toISOString(),
        estimatedStart: CREATE_RESULT.estimatedStart.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      })
      .then(function () {
        agent
          .post("/productionSchedules")
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
