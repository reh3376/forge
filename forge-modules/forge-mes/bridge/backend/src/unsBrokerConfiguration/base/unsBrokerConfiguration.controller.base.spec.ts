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
import { UnsBrokerConfigurationController } from "../unsBrokerConfiguration.controller";
import { UnsBrokerConfigurationService } from "../unsBrokerConfiguration.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  baseTopicPath: "exampleBaseTopicPath",
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  host: "exampleHost",
  id: "exampleId",
  password: "examplePassword",
  port: 42,
  protocol: "exampleProtocol",
  tls: "true",
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
  username: "exampleUsername",
  validateCertificate: "true",
};
const CREATE_RESULT = {
  baseTopicPath: "exampleBaseTopicPath",
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  host: "exampleHost",
  id: "exampleId",
  password: "examplePassword",
  port: 42,
  protocol: "exampleProtocol",
  tls: "true",
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
  username: "exampleUsername",
  validateCertificate: "true",
};
const FIND_MANY_RESULT = [
  {
    baseTopicPath: "exampleBaseTopicPath",
    createdAt: new Date(),
    createdBy: "exampleCreatedBy",
    host: "exampleHost",
    id: "exampleId",
    password: "examplePassword",
    port: 42,
    protocol: "exampleProtocol",
    tls: "true",
    updatedAt: new Date(),
    updatedBy: "exampleUpdatedBy",
    username: "exampleUsername",
    validateCertificate: "true",
  },
];
const FIND_ONE_RESULT = {
  baseTopicPath: "exampleBaseTopicPath",
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  host: "exampleHost",
  id: "exampleId",
  password: "examplePassword",
  port: 42,
  protocol: "exampleProtocol",
  tls: "true",
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
  username: "exampleUsername",
  validateCertificate: "true",
};

const service = {
  createUnsBrokerConfiguration() {
    return CREATE_RESULT;
  },
  unsBrokerConfigurations: () => FIND_MANY_RESULT,
  unsBrokerConfiguration: ({ where }: { where: { id: string } }) => {
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

describe("UnsBrokerConfiguration", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: UnsBrokerConfigurationService,
          useValue: service,
        },
      ],
      controllers: [UnsBrokerConfigurationController],
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

  test("POST /unsBrokerConfigurations", async () => {
    await request(app.getHttpServer())
      .post("/unsBrokerConfigurations")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      });
  });

  test("GET /unsBrokerConfigurations", async () => {
    await request(app.getHttpServer())
      .get("/unsBrokerConfigurations")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          updatedAt: FIND_MANY_RESULT[0].updatedAt.toISOString(),
        },
      ]);
  });

  test("GET /unsBrokerConfigurations/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/unsBrokerConfigurations"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /unsBrokerConfigurations/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/unsBrokerConfigurations"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        updatedAt: FIND_ONE_RESULT.updatedAt.toISOString(),
      });
  });

  test("POST /unsBrokerConfigurations existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/unsBrokerConfigurations")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      })
      .then(function () {
        agent
          .post("/unsBrokerConfigurations")
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
