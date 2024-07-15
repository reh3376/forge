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
import { ScheduleOrderController } from "../scheduleOrder.controller";
import { ScheduleOrderService } from "../scheduleOrder.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  id: "exampleId",
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "exampleCreatedBy",
  updatedBy: "exampleUpdatedBy",
  recipeName: "exampleRecipeName",
  totalProofGallons: 42,
  estimatedTotalProductionTime: 42,
  estimatedMashingTime: 42,
  estimatedFermentationTime: 42,
  estimatedDistillationTime: 42,
  estimatedProcessing: 42,
  totalBarrels: 42,
  globalId: "exampleGlobalId",
  estimatedStart: new Date(),
  estimatedEnd: new Date(),
  actualStart: new Date(),
  actualEnd: new Date(),
  duration: 42.424242424,
  durationUnits: "exampleDurationUnits",
  name: "exampleName",
};
const CREATE_RESULT = {
  id: "exampleId",
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "exampleCreatedBy",
  updatedBy: "exampleUpdatedBy",
  recipeName: "exampleRecipeName",
  totalProofGallons: 42,
  estimatedTotalProductionTime: 42,
  estimatedMashingTime: 42,
  estimatedFermentationTime: 42,
  estimatedDistillationTime: 42,
  estimatedProcessing: 42,
  totalBarrels: 42,
  globalId: "exampleGlobalId",
  estimatedStart: new Date(),
  estimatedEnd: new Date(),
  actualStart: new Date(),
  actualEnd: new Date(),
  duration: 42.424242424,
  durationUnits: "exampleDurationUnits",
  name: "exampleName",
};
const FIND_MANY_RESULT = [
  {
    id: "exampleId",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "exampleCreatedBy",
    updatedBy: "exampleUpdatedBy",
    recipeName: "exampleRecipeName",
    totalProofGallons: 42,
    estimatedTotalProductionTime: 42,
    estimatedMashingTime: 42,
    estimatedFermentationTime: 42,
    estimatedDistillationTime: 42,
    estimatedProcessing: 42,
    totalBarrels: 42,
    globalId: "exampleGlobalId",
    estimatedStart: new Date(),
    estimatedEnd: new Date(),
    actualStart: new Date(),
    actualEnd: new Date(),
    duration: 42.424242424,
    durationUnits: "exampleDurationUnits",
    name: "exampleName",
  },
];
const FIND_ONE_RESULT = {
  id: "exampleId",
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "exampleCreatedBy",
  updatedBy: "exampleUpdatedBy",
  recipeName: "exampleRecipeName",
  totalProofGallons: 42,
  estimatedTotalProductionTime: 42,
  estimatedMashingTime: 42,
  estimatedFermentationTime: 42,
  estimatedDistillationTime: 42,
  estimatedProcessing: 42,
  totalBarrels: 42,
  globalId: "exampleGlobalId",
  estimatedStart: new Date(),
  estimatedEnd: new Date(),
  actualStart: new Date(),
  actualEnd: new Date(),
  duration: 42.424242424,
  durationUnits: "exampleDurationUnits",
  name: "exampleName",
};

const service = {
  createScheduleOrder() {
    return CREATE_RESULT;
  },
  scheduleOrders: () => FIND_MANY_RESULT,
  scheduleOrder: ({ where }: { where: { id: string } }) => {
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

describe("ScheduleOrder", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: ScheduleOrderService,
          useValue: service,
        },
      ],
      controllers: [ScheduleOrderController],
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

  test("POST /scheduleOrders", async () => {
    await request(app.getHttpServer())
      .post("/scheduleOrders")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
        estimatedStart: CREATE_RESULT.estimatedStart.toISOString(),
        estimatedEnd: CREATE_RESULT.estimatedEnd.toISOString(),
        actualStart: CREATE_RESULT.actualStart.toISOString(),
        actualEnd: CREATE_RESULT.actualEnd.toISOString(),
      });
  });

  test("GET /scheduleOrders", async () => {
    await request(app.getHttpServer())
      .get("/scheduleOrders")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          updatedAt: FIND_MANY_RESULT[0].updatedAt.toISOString(),
          estimatedStart: FIND_MANY_RESULT[0].estimatedStart.toISOString(),
          estimatedEnd: FIND_MANY_RESULT[0].estimatedEnd.toISOString(),
          actualStart: FIND_MANY_RESULT[0].actualStart.toISOString(),
          actualEnd: FIND_MANY_RESULT[0].actualEnd.toISOString(),
        },
      ]);
  });

  test("GET /scheduleOrders/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/scheduleOrders"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /scheduleOrders/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/scheduleOrders"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        updatedAt: FIND_ONE_RESULT.updatedAt.toISOString(),
        estimatedStart: FIND_ONE_RESULT.estimatedStart.toISOString(),
        estimatedEnd: FIND_ONE_RESULT.estimatedEnd.toISOString(),
        actualStart: FIND_ONE_RESULT.actualStart.toISOString(),
        actualEnd: FIND_ONE_RESULT.actualEnd.toISOString(),
      });
  });

  test("POST /scheduleOrders existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/scheduleOrders")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
        estimatedStart: CREATE_RESULT.estimatedStart.toISOString(),
        estimatedEnd: CREATE_RESULT.estimatedEnd.toISOString(),
        actualStart: CREATE_RESULT.actualStart.toISOString(),
        actualEnd: CREATE_RESULT.actualEnd.toISOString(),
      })
      .then(function () {
        agent
          .post("/scheduleOrders")
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
