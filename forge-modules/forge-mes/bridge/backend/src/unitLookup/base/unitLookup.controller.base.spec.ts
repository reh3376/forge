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
import { UnitLookupController } from "../unitLookup.controller";
import { UnitLookupService } from "../unitLookup.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  abbreviation: "exampleAbbreviation",
  baseUnit: "true",
  conversionRate: 42.424242424,
  createdAt: new Date(),
  id: "exampleId",
  name: "exampleName",
  pluralAbbreviation: "examplePluralAbbreviation",
  pluralName: "examplePluralName",
  typeName: "exampleTypeName",
  updatedAt: new Date(),
};
const CREATE_RESULT = {
  abbreviation: "exampleAbbreviation",
  baseUnit: "true",
  conversionRate: 42.424242424,
  createdAt: new Date(),
  id: "exampleId",
  name: "exampleName",
  pluralAbbreviation: "examplePluralAbbreviation",
  pluralName: "examplePluralName",
  typeName: "exampleTypeName",
  updatedAt: new Date(),
};
const FIND_MANY_RESULT = [
  {
    abbreviation: "exampleAbbreviation",
    baseUnit: "true",
    conversionRate: 42.424242424,
    createdAt: new Date(),
    id: "exampleId",
    name: "exampleName",
    pluralAbbreviation: "examplePluralAbbreviation",
    pluralName: "examplePluralName",
    typeName: "exampleTypeName",
    updatedAt: new Date(),
  },
];
const FIND_ONE_RESULT = {
  abbreviation: "exampleAbbreviation",
  baseUnit: "true",
  conversionRate: 42.424242424,
  createdAt: new Date(),
  id: "exampleId",
  name: "exampleName",
  pluralAbbreviation: "examplePluralAbbreviation",
  pluralName: "examplePluralName",
  typeName: "exampleTypeName",
  updatedAt: new Date(),
};

const service = {
  createUnitLookup() {
    return CREATE_RESULT;
  },
  unitLookups: () => FIND_MANY_RESULT,
  unitLookup: ({ where }: { where: { id: string } }) => {
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

describe("UnitLookup", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: UnitLookupService,
          useValue: service,
        },
      ],
      controllers: [UnitLookupController],
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

  test("POST /unitLookups", async () => {
    await request(app.getHttpServer())
      .post("/unitLookups")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      });
  });

  test("GET /unitLookups", async () => {
    await request(app.getHttpServer())
      .get("/unitLookups")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          updatedAt: FIND_MANY_RESULT[0].updatedAt.toISOString(),
        },
      ]);
  });

  test("GET /unitLookups/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/unitLookups"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /unitLookups/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/unitLookups"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        updatedAt: FIND_ONE_RESULT.updatedAt.toISOString(),
      });
  });

  test("POST /unitLookups existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/unitLookups")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      })
      .then(function () {
        agent
          .post("/unitLookups")
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

  it("should always pass", () => {
    expect(true).toBe(true);
  });
});
