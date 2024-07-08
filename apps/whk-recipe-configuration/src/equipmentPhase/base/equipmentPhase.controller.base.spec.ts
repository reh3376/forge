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
import { EquipmentPhaseController } from "../equipmentPhase.controller";
import { EquipmentPhaseService } from "../equipmentPhase.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  createdBy: "exampleCreatedBy",
  createdAt: new Date(),
  schemaVersion: "exampleSchemaVersion",
  operationSequenceIndex: 42,
  id: "exampleId",
  editedBy: "exampleEditedBy",
  revision: 42,
  editedAt: new Date(),
  className: "exampleClassName",
  description: "exampleDescription",
  isClassDefinition: "true",
  active: "true",
  path: "examplePath",
  globalId: "exampleGlobalId",
  message: "exampleMessage",
};
const CREATE_RESULT = {
  createdBy: "exampleCreatedBy",
  createdAt: new Date(),
  schemaVersion: "exampleSchemaVersion",
  operationSequenceIndex: 42,
  id: "exampleId",
  editedBy: "exampleEditedBy",
  revision: 42,
  editedAt: new Date(),
  className: "exampleClassName",
  description: "exampleDescription",
  isClassDefinition: "true",
  active: "true",
  path: "examplePath",
  globalId: "exampleGlobalId",
  message: "exampleMessage",
};
const FIND_MANY_RESULT = [
  {
    createdBy: "exampleCreatedBy",
    createdAt: new Date(),
    schemaVersion: "exampleSchemaVersion",
    operationSequenceIndex: 42,
    id: "exampleId",
    editedBy: "exampleEditedBy",
    revision: 42,
    editedAt: new Date(),
    className: "exampleClassName",
    description: "exampleDescription",
    isClassDefinition: "true",
    active: "true",
    path: "examplePath",
    globalId: "exampleGlobalId",
    message: "exampleMessage",
  },
];
const FIND_ONE_RESULT = {
  createdBy: "exampleCreatedBy",
  createdAt: new Date(),
  schemaVersion: "exampleSchemaVersion",
  operationSequenceIndex: 42,
  id: "exampleId",
  editedBy: "exampleEditedBy",
  revision: 42,
  editedAt: new Date(),
  className: "exampleClassName",
  description: "exampleDescription",
  isClassDefinition: "true",
  active: "true",
  path: "examplePath",
  globalId: "exampleGlobalId",
  message: "exampleMessage",
};

const service = {
  createEquipmentPhase() {
    return CREATE_RESULT;
  },
  equipmentPhases: () => FIND_MANY_RESULT,
  equipmentPhase: ({ where }: { where: { id: string } }) => {
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

describe("EquipmentPhase", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: EquipmentPhaseService,
          useValue: service,
        },
      ],
      controllers: [EquipmentPhaseController],
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

  test("POST /equipmentPhases", async () => {
    await request(app.getHttpServer())
      .post("/equipmentPhases")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        editedAt: CREATE_RESULT.editedAt.toISOString(),
      });
  });

  test("GET /equipmentPhases", async () => {
    await request(app.getHttpServer())
      .get("/equipmentPhases")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          editedAt: FIND_MANY_RESULT[0].editedAt.toISOString(),
        },
      ]);
  });

  test("GET /equipmentPhases/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/equipmentPhases"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /equipmentPhases/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/equipmentPhases"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        editedAt: FIND_ONE_RESULT.editedAt.toISOString(),
      });
  });

  test("POST /equipmentPhases existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/equipmentPhases")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        editedAt: CREATE_RESULT.editedAt.toISOString(),
      })
      .then(function () {
        agent
          .post("/equipmentPhases")
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
