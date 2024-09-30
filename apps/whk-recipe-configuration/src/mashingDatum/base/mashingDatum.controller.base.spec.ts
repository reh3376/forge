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
import { MashingDatumController } from "../mashingDatum.controller";
import { MashingDatumService } from "../mashingDatum.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  backsetQuantity: 42,
  cookCompleteTime: new Date(),
  cookDropTime: new Date(),
  cookDuration: 42,
  cookStartTime: new Date(),
  cookStartedBy: "exampleCookStartedBy",
  cookerNumber: 42,
  cornQuantity: 42,
  createdAt: new Date(),
  dropDuration: 42,
  id: "exampleId",
  maltQuantity: 42,
  preMaltQuantity: 42,
  ryeQuantity: 42,
  specialtyQuantity: 42,
  totalDuration: 42,
  updatedAt: new Date(),
  waterQuantity: 42,
  wheatQuantity: 42,
};
const CREATE_RESULT = {
  backsetQuantity: 42,
  cookCompleteTime: new Date(),
  cookDropTime: new Date(),
  cookDuration: 42,
  cookStartTime: new Date(),
  cookStartedBy: "exampleCookStartedBy",
  cookerNumber: 42,
  cornQuantity: 42,
  createdAt: new Date(),
  dropDuration: 42,
  id: "exampleId",
  maltQuantity: 42,
  preMaltQuantity: 42,
  ryeQuantity: 42,
  specialtyQuantity: 42,
  totalDuration: 42,
  updatedAt: new Date(),
  waterQuantity: 42,
  wheatQuantity: 42,
};
const FIND_MANY_RESULT = [
  {
    backsetQuantity: 42,
    cookCompleteTime: new Date(),
    cookDropTime: new Date(),
    cookDuration: 42,
    cookStartTime: new Date(),
    cookStartedBy: "exampleCookStartedBy",
    cookerNumber: 42,
    cornQuantity: 42,
    createdAt: new Date(),
    dropDuration: 42,
    id: "exampleId",
    maltQuantity: 42,
    preMaltQuantity: 42,
    ryeQuantity: 42,
    specialtyQuantity: 42,
    totalDuration: 42,
    updatedAt: new Date(),
    waterQuantity: 42,
    wheatQuantity: 42,
  },
];
const FIND_ONE_RESULT = {
  backsetQuantity: 42,
  cookCompleteTime: new Date(),
  cookDropTime: new Date(),
  cookDuration: 42,
  cookStartTime: new Date(),
  cookStartedBy: "exampleCookStartedBy",
  cookerNumber: 42,
  cornQuantity: 42,
  createdAt: new Date(),
  dropDuration: 42,
  id: "exampleId",
  maltQuantity: 42,
  preMaltQuantity: 42,
  ryeQuantity: 42,
  specialtyQuantity: 42,
  totalDuration: 42,
  updatedAt: new Date(),
  waterQuantity: 42,
  wheatQuantity: 42,
};

const service = {
  createMashingDatum() {
    return CREATE_RESULT;
  },
  mashingData: () => FIND_MANY_RESULT,
  mashingDatum: ({ where }: { where: { id: string } }) => {
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

describe("MashingDatum", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: MashingDatumService,
          useValue: service,
        },
      ],
      controllers: [MashingDatumController],
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

  test("POST /mashingData", async () => {
    await request(app.getHttpServer())
      .post("/mashingData")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        cookCompleteTime: CREATE_RESULT.cookCompleteTime.toISOString(),
        cookDropTime: CREATE_RESULT.cookDropTime.toISOString(),
        cookStartTime: CREATE_RESULT.cookStartTime.toISOString(),
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      });
  });

  test("GET /mashingData", async () => {
    await request(app.getHttpServer())
      .get("/mashingData")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          cookCompleteTime: FIND_MANY_RESULT[0].cookCompleteTime.toISOString(),
          cookDropTime: FIND_MANY_RESULT[0].cookDropTime.toISOString(),
          cookStartTime: FIND_MANY_RESULT[0].cookStartTime.toISOString(),
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          updatedAt: FIND_MANY_RESULT[0].updatedAt.toISOString(),
        },
      ]);
  });

  test("GET /mashingData/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/mashingData"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /mashingData/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/mashingData"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        cookCompleteTime: FIND_ONE_RESULT.cookCompleteTime.toISOString(),
        cookDropTime: FIND_ONE_RESULT.cookDropTime.toISOString(),
        cookStartTime: FIND_ONE_RESULT.cookStartTime.toISOString(),
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        updatedAt: FIND_ONE_RESULT.updatedAt.toISOString(),
      });
  });

  test("POST /mashingData existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/mashingData")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        cookCompleteTime: CREATE_RESULT.cookCompleteTime.toISOString(),
        cookDropTime: CREATE_RESULT.cookDropTime.toISOString(),
        cookStartTime: CREATE_RESULT.cookStartTime.toISOString(),
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      })
      .then(function () {
        agent
          .post("/mashingData")
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
