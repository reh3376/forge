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
import { FermentationSettingDatumController } from "../fermentationSettingDatum.controller";
import { FermentationSettingDatumService } from "../fermentationSettingDatum.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  acid: 42.424242424,
  balling: 42.424242424,
  createdAt: new Date(),
  dryInches: 42.424242424,
  fermenterNumber: 42,
  id: "exampleId",
  loggedBy: "exampleLoggedBy",
  lotId: "exampleLotId",
  pH: 42.424242424,
  setTime: new Date(),
  temperature: 42.424242424,
  updatedAt: new Date(),
  yeastPitchTime: new Date(),
};
const CREATE_RESULT = {
  acid: 42.424242424,
  balling: 42.424242424,
  createdAt: new Date(),
  dryInches: 42.424242424,
  fermenterNumber: 42,
  id: "exampleId",
  loggedBy: "exampleLoggedBy",
  lotId: "exampleLotId",
  pH: 42.424242424,
  setTime: new Date(),
  temperature: 42.424242424,
  updatedAt: new Date(),
  yeastPitchTime: new Date(),
};
const FIND_MANY_RESULT = [
  {
    acid: 42.424242424,
    balling: 42.424242424,
    createdAt: new Date(),
    dryInches: 42.424242424,
    fermenterNumber: 42,
    id: "exampleId",
    loggedBy: "exampleLoggedBy",
    lotId: "exampleLotId",
    pH: 42.424242424,
    setTime: new Date(),
    temperature: 42.424242424,
    updatedAt: new Date(),
    yeastPitchTime: new Date(),
  },
];
const FIND_ONE_RESULT = {
  acid: 42.424242424,
  balling: 42.424242424,
  createdAt: new Date(),
  dryInches: 42.424242424,
  fermenterNumber: 42,
  id: "exampleId",
  loggedBy: "exampleLoggedBy",
  lotId: "exampleLotId",
  pH: 42.424242424,
  setTime: new Date(),
  temperature: 42.424242424,
  updatedAt: new Date(),
  yeastPitchTime: new Date(),
};

const service = {
  createFermentationSettingDatum() {
    return CREATE_RESULT;
  },
  fermentationSettingData: () => FIND_MANY_RESULT,
  fermentationSettingDatum: ({ where }: { where: { id: string } }) => {
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

describe("FermentationSettingDatum", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: FermentationSettingDatumService,
          useValue: service,
        },
      ],
      controllers: [FermentationSettingDatumController],
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

  test("POST /fermentationSettingData", async () => {
    await request(app.getHttpServer())
      .post("/fermentationSettingData")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        setTime: CREATE_RESULT.setTime.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
        yeastPitchTime: CREATE_RESULT.yeastPitchTime.toISOString(),
      });
  });

  test("GET /fermentationSettingData", async () => {
    await request(app.getHttpServer())
      .get("/fermentationSettingData")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          setTime: FIND_MANY_RESULT[0].setTime.toISOString(),
          updatedAt: FIND_MANY_RESULT[0].updatedAt.toISOString(),
          yeastPitchTime: FIND_MANY_RESULT[0].yeastPitchTime.toISOString(),
        },
      ]);
  });

  test("GET /fermentationSettingData/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/fermentationSettingData"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /fermentationSettingData/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/fermentationSettingData"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        setTime: FIND_ONE_RESULT.setTime.toISOString(),
        updatedAt: FIND_ONE_RESULT.updatedAt.toISOString(),
        yeastPitchTime: FIND_ONE_RESULT.yeastPitchTime.toISOString(),
      });
  });

  test("POST /fermentationSettingData existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/fermentationSettingData")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        setTime: CREATE_RESULT.setTime.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
        yeastPitchTime: CREATE_RESULT.yeastPitchTime.toISOString(),
      })
      .then(function () {
        agent
          .post("/fermentationSettingData")
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
