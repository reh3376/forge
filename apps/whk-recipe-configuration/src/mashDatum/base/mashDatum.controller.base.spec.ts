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
import { MashDatumController } from "../mashDatum.controller";
import { MashDatumService } from "../mashDatum.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  backSetPH: 42.424242424,
  backsetVolume: 42.424242424,
  balling: 42.424242424,
  cornLbs: 42.424242424,
  createdAt: new Date(),
  fermenterNumber: 42,
  id: "exampleId",
  loggedBy: "exampleLoggedBy",
  lotId: "exampleLotId",
  maltLbs: 42.424242424,
  pH: 42.424242424,
  ryeLbs: 42.424242424,
  updatedAt: new Date(),
  waterVolume: 42.424242424,
  wheatLbs: 42.424242424,
};
const CREATE_RESULT = {
  backSetPH: 42.424242424,
  backsetVolume: 42.424242424,
  balling: 42.424242424,
  cornLbs: 42.424242424,
  createdAt: new Date(),
  fermenterNumber: 42,
  id: "exampleId",
  loggedBy: "exampleLoggedBy",
  lotId: "exampleLotId",
  maltLbs: 42.424242424,
  pH: 42.424242424,
  ryeLbs: 42.424242424,
  updatedAt: new Date(),
  waterVolume: 42.424242424,
  wheatLbs: 42.424242424,
};
const FIND_MANY_RESULT = [
  {
    backSetPH: 42.424242424,
    backsetVolume: 42.424242424,
    balling: 42.424242424,
    cornLbs: 42.424242424,
    createdAt: new Date(),
    fermenterNumber: 42,
    id: "exampleId",
    loggedBy: "exampleLoggedBy",
    lotId: "exampleLotId",
    maltLbs: 42.424242424,
    pH: 42.424242424,
    ryeLbs: 42.424242424,
    updatedAt: new Date(),
    waterVolume: 42.424242424,
    wheatLbs: 42.424242424,
  },
];
const FIND_ONE_RESULT = {
  backSetPH: 42.424242424,
  backsetVolume: 42.424242424,
  balling: 42.424242424,
  cornLbs: 42.424242424,
  createdAt: new Date(),
  fermenterNumber: 42,
  id: "exampleId",
  loggedBy: "exampleLoggedBy",
  lotId: "exampleLotId",
  maltLbs: 42.424242424,
  pH: 42.424242424,
  ryeLbs: 42.424242424,
  updatedAt: new Date(),
  waterVolume: 42.424242424,
  wheatLbs: 42.424242424,
};

const service = {
  createMashDatum() {
    return CREATE_RESULT;
  },
  mashData: () => FIND_MANY_RESULT,
  mashDatum: ({ where }: { where: { id: string } }) => {
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

describe("MashDatum", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: MashDatumService,
          useValue: service,
        },
      ],
      controllers: [MashDatumController],
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

  test("POST /mashData", async () => {
    await request(app.getHttpServer())
      .post("/mashData")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      });
  });

  test("GET /mashData", async () => {
    await request(app.getHttpServer())
      .get("/mashData")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          updatedAt: FIND_MANY_RESULT[0].updatedAt.toISOString(),
        },
      ]);
  });

  test("GET /mashData/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/mashData"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /mashData/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/mashData"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        updatedAt: FIND_ONE_RESULT.updatedAt.toISOString(),
      });
  });

  test("POST /mashData existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/mashData")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      })
      .then(function () {
        agent
          .post("/mashData")
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
