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
import { OperatorShiftController } from "../operatorShift.controller";
import { OperatorShiftService } from "../operatorShift.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  createdAt: new Date(),
  effectiveDate: new Date(),
  endTime: new Date(),
  expirationDate: new Date(),
  id: "exampleId",
  isActive: "true",
  notes: "exampleNotes",
  operator: "exampleOperator",
  shiftType: "exampleShiftType",
  startTime: new Date(),
  updatedAt: new Date(),
};
const CREATE_RESULT = {
  createdAt: new Date(),
  effectiveDate: new Date(),
  endTime: new Date(),
  expirationDate: new Date(),
  id: "exampleId",
  isActive: "true",
  notes: "exampleNotes",
  operator: "exampleOperator",
  shiftType: "exampleShiftType",
  startTime: new Date(),
  updatedAt: new Date(),
};
const FIND_MANY_RESULT = [
  {
    createdAt: new Date(),
    effectiveDate: new Date(),
    endTime: new Date(),
    expirationDate: new Date(),
    id: "exampleId",
    isActive: "true",
    notes: "exampleNotes",
    operator: "exampleOperator",
    shiftType: "exampleShiftType",
    startTime: new Date(),
    updatedAt: new Date(),
  },
];
const FIND_ONE_RESULT = {
  createdAt: new Date(),
  effectiveDate: new Date(),
  endTime: new Date(),
  expirationDate: new Date(),
  id: "exampleId",
  isActive: "true",
  notes: "exampleNotes",
  operator: "exampleOperator",
  shiftType: "exampleShiftType",
  startTime: new Date(),
  updatedAt: new Date(),
};

const service = {
  createOperatorShift() {
    return CREATE_RESULT;
  },
  operatorShifts: () => FIND_MANY_RESULT,
  operatorShift: ({ where }: { where: { id: string } }) => {
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

describe("OperatorShift", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: OperatorShiftService,
          useValue: service,
        },
      ],
      controllers: [OperatorShiftController],
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

  test("POST /operatorShifts", async () => {
    await request(app.getHttpServer())
      .post("/operatorShifts")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        effectiveDate: CREATE_RESULT.effectiveDate.toISOString(),
        endTime: CREATE_RESULT.endTime.toISOString(),
        expirationDate: CREATE_RESULT.expirationDate.toISOString(),
        startTime: CREATE_RESULT.startTime.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      });
  });

  test("GET /operatorShifts", async () => {
    await request(app.getHttpServer())
      .get("/operatorShifts")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          effectiveDate: FIND_MANY_RESULT[0].effectiveDate.toISOString(),
          endTime: FIND_MANY_RESULT[0].endTime.toISOString(),
          expirationDate: FIND_MANY_RESULT[0].expirationDate.toISOString(),
          startTime: FIND_MANY_RESULT[0].startTime.toISOString(),
          updatedAt: FIND_MANY_RESULT[0].updatedAt.toISOString(),
        },
      ]);
  });

  test("GET /operatorShifts/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/operatorShifts"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /operatorShifts/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/operatorShifts"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        effectiveDate: FIND_ONE_RESULT.effectiveDate.toISOString(),
        endTime: FIND_ONE_RESULT.endTime.toISOString(),
        expirationDate: FIND_ONE_RESULT.expirationDate.toISOString(),
        startTime: FIND_ONE_RESULT.startTime.toISOString(),
        updatedAt: FIND_ONE_RESULT.updatedAt.toISOString(),
      });
  });

  test("POST /operatorShifts existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/operatorShifts")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        effectiveDate: CREATE_RESULT.effectiveDate.toISOString(),
        endTime: CREATE_RESULT.endTime.toISOString(),
        expirationDate: CREATE_RESULT.expirationDate.toISOString(),
        startTime: CREATE_RESULT.startTime.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      })
      .then(function () {
        agent
          .post("/operatorShifts")
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
