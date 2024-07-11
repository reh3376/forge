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
import { InventoryLogController } from "../inventoryLog.controller";
import { InventoryLogService } from "../inventoryLog.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  id: "exampleId",
  createdAt: new Date(),
  updatedAt: new Date(),
  dateTime: new Date(),
  date: new Date(),
  quantity: 42.424242424,
  loggedBy: "exampleLoggedBy",
  revision: 42,
  revisedBy: "exampleRevisedBy",
  rawMeasurementValue: "exampleRawMeasurementValue",
  rawMeasurementUnits: "exampleRawMeasurementUnits",
  units: "exampleUnits",
};
const CREATE_RESULT = {
  id: "exampleId",
  createdAt: new Date(),
  updatedAt: new Date(),
  dateTime: new Date(),
  date: new Date(),
  quantity: 42.424242424,
  loggedBy: "exampleLoggedBy",
  revision: 42,
  revisedBy: "exampleRevisedBy",
  rawMeasurementValue: "exampleRawMeasurementValue",
  rawMeasurementUnits: "exampleRawMeasurementUnits",
  units: "exampleUnits",
};
const FIND_MANY_RESULT = [
  {
    id: "exampleId",
    createdAt: new Date(),
    updatedAt: new Date(),
    dateTime: new Date(),
    date: new Date(),
    quantity: 42.424242424,
    loggedBy: "exampleLoggedBy",
    revision: 42,
    revisedBy: "exampleRevisedBy",
    rawMeasurementValue: "exampleRawMeasurementValue",
    rawMeasurementUnits: "exampleRawMeasurementUnits",
    units: "exampleUnits",
  },
];
const FIND_ONE_RESULT = {
  id: "exampleId",
  createdAt: new Date(),
  updatedAt: new Date(),
  dateTime: new Date(),
  date: new Date(),
  quantity: 42.424242424,
  loggedBy: "exampleLoggedBy",
  revision: 42,
  revisedBy: "exampleRevisedBy",
  rawMeasurementValue: "exampleRawMeasurementValue",
  rawMeasurementUnits: "exampleRawMeasurementUnits",
  units: "exampleUnits",
};

const service = {
  createInventoryLog() {
    return CREATE_RESULT;
  },
  inventoryLogs: () => FIND_MANY_RESULT,
  inventoryLog: ({ where }: { where: { id: string } }) => {
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

describe("InventoryLog", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: InventoryLogService,
          useValue: service,
        },
      ],
      controllers: [InventoryLogController],
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

  test("POST /inventoryLogs", async () => {
    await request(app.getHttpServer())
      .post("/inventoryLogs")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
        dateTime: CREATE_RESULT.dateTime.toISOString(),
        date: CREATE_RESULT.date.toISOString(),
      });
  });

  test("GET /inventoryLogs", async () => {
    await request(app.getHttpServer())
      .get("/inventoryLogs")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          updatedAt: FIND_MANY_RESULT[0].updatedAt.toISOString(),
          dateTime: FIND_MANY_RESULT[0].dateTime.toISOString(),
          date: FIND_MANY_RESULT[0].date.toISOString(),
        },
      ]);
  });

  test("GET /inventoryLogs/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/inventoryLogs"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /inventoryLogs/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/inventoryLogs"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        updatedAt: FIND_ONE_RESULT.updatedAt.toISOString(),
        dateTime: FIND_ONE_RESULT.dateTime.toISOString(),
        date: FIND_ONE_RESULT.date.toISOString(),
      });
  });

  test("POST /inventoryLogs existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/inventoryLogs")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
        dateTime: CREATE_RESULT.dateTime.toISOString(),
        date: CREATE_RESULT.date.toISOString(),
      })
      .then(function () {
        agent
          .post("/inventoryLogs")
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
