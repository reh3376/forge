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
import { UnitsController } from "../units.controller";
import { UnitsService } from "../units.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  abbreviation: "exampleAbbreviation",
  active: "true",
  archived: "true",
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  globalId: "exampleGlobalId",
  id: "exampleId",
  isBaseUnit: "true",
  mesConfiguredUnit: "true",
  name: "exampleName",
  pluralAbbreviation: "examplePluralAbbreviation",
  pluralName: "examplePluralName",
  revision: 42,
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
};
const CREATE_RESULT = {
  abbreviation: "exampleAbbreviation",
  active: "true",
  archived: "true",
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  globalId: "exampleGlobalId",
  id: "exampleId",
  isBaseUnit: "true",
  mesConfiguredUnit: "true",
  name: "exampleName",
  pluralAbbreviation: "examplePluralAbbreviation",
  pluralName: "examplePluralName",
  revision: 42,
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
};
const FIND_MANY_RESULT = [
  {
    abbreviation: "exampleAbbreviation",
    active: "true",
    archived: "true",
    createdAt: new Date(),
    createdBy: "exampleCreatedBy",
    globalId: "exampleGlobalId",
    id: "exampleId",
    isBaseUnit: "true",
    mesConfiguredUnit: "true",
    name: "exampleName",
    pluralAbbreviation: "examplePluralAbbreviation",
    pluralName: "examplePluralName",
    revision: 42,
    updatedAt: new Date(),
    updatedBy: "exampleUpdatedBy",
  },
];
const FIND_ONE_RESULT = {
  abbreviation: "exampleAbbreviation",
  active: "true",
  archived: "true",
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  globalId: "exampleGlobalId",
  id: "exampleId",
  isBaseUnit: "true",
  mesConfiguredUnit: "true",
  name: "exampleName",
  pluralAbbreviation: "examplePluralAbbreviation",
  pluralName: "examplePluralName",
  revision: 42,
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
};

const service = {
  createUnits() {
    return CREATE_RESULT;
  },
  unitsItems: () => FIND_MANY_RESULT,
  units: ({ where }: { where: { id: string } }) => {
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

describe("Units", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: UnitsService,
          useValue: service,
        },
      ],
      controllers: [UnitsController],
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

  test("POST /units", async () => {
    await request(app.getHttpServer())
      .post("/units")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      });
  });

  test("GET /units", async () => {
    await request(app.getHttpServer())
      .get("/units")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          updatedAt: FIND_MANY_RESULT[0].updatedAt.toISOString(),
        },
      ]);
  });

  test("GET /units/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/units"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /units/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/units"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        updatedAt: FIND_ONE_RESULT.updatedAt.toISOString(),
      });
  });

  test("POST /units existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/units")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      })
      .then(function () {
        agent
          .post("/units")
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
