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
import { BomController } from "../bom.controller";
import { BomService } from "../bom.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  id: "exampleId",
  editedBy: "exampleEditedBy",
  schemaVersion: "exampleSchemaVersion",
  className: "exampleClassName",
  editedAt: new Date(),
  createdBy: "exampleCreatedBy",
  createdAt: new Date(),
  bomName: "exampleBomName",
  bomRevision: "exampleBomRevision",
  globalId: "exampleGlobalId",
  bomType: "exampleBomType",
  notes: "exampleNotes",
  inactive: "true",
  effectiveStartDate: new Date(),
  effectiveEndDate: new Date(),
  erpId: "exampleErpId",
};
const CREATE_RESULT = {
  id: "exampleId",
  editedBy: "exampleEditedBy",
  schemaVersion: "exampleSchemaVersion",
  className: "exampleClassName",
  editedAt: new Date(),
  createdBy: "exampleCreatedBy",
  createdAt: new Date(),
  bomName: "exampleBomName",
  bomRevision: "exampleBomRevision",
  globalId: "exampleGlobalId",
  bomType: "exampleBomType",
  notes: "exampleNotes",
  inactive: "true",
  effectiveStartDate: new Date(),
  effectiveEndDate: new Date(),
  erpId: "exampleErpId",
};
const FIND_MANY_RESULT = [
  {
    id: "exampleId",
    editedBy: "exampleEditedBy",
    schemaVersion: "exampleSchemaVersion",
    className: "exampleClassName",
    editedAt: new Date(),
    createdBy: "exampleCreatedBy",
    createdAt: new Date(),
    bomName: "exampleBomName",
    bomRevision: "exampleBomRevision",
    globalId: "exampleGlobalId",
    bomType: "exampleBomType",
    notes: "exampleNotes",
    inactive: "true",
    effectiveStartDate: new Date(),
    effectiveEndDate: new Date(),
    erpId: "exampleErpId",
  },
];
const FIND_ONE_RESULT = {
  id: "exampleId",
  editedBy: "exampleEditedBy",
  schemaVersion: "exampleSchemaVersion",
  className: "exampleClassName",
  editedAt: new Date(),
  createdBy: "exampleCreatedBy",
  createdAt: new Date(),
  bomName: "exampleBomName",
  bomRevision: "exampleBomRevision",
  globalId: "exampleGlobalId",
  bomType: "exampleBomType",
  notes: "exampleNotes",
  inactive: "true",
  effectiveStartDate: new Date(),
  effectiveEndDate: new Date(),
  erpId: "exampleErpId",
};

const service = {
  createBom() {
    return CREATE_RESULT;
  },
  boms: () => FIND_MANY_RESULT,
  bom: ({ where }: { where: { id: string } }) => {
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

describe("Bom", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: BomService,
          useValue: service,
        },
      ],
      controllers: [BomController],
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

  test("POST /boms", async () => {
    await request(app.getHttpServer())
      .post("/boms")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        editedAt: CREATE_RESULT.editedAt.toISOString(),
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        effectiveStartDate: CREATE_RESULT.effectiveStartDate.toISOString(),
        effectiveEndDate: CREATE_RESULT.effectiveEndDate.toISOString(),
      });
  });

  test("GET /boms", async () => {
    await request(app.getHttpServer())
      .get("/boms")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          editedAt: FIND_MANY_RESULT[0].editedAt.toISOString(),
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          effectiveStartDate:
            FIND_MANY_RESULT[0].effectiveStartDate.toISOString(),
          effectiveEndDate: FIND_MANY_RESULT[0].effectiveEndDate.toISOString(),
        },
      ]);
  });

  test("GET /boms/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/boms"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /boms/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/boms"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        editedAt: FIND_ONE_RESULT.editedAt.toISOString(),
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        effectiveStartDate: FIND_ONE_RESULT.effectiveStartDate.toISOString(),
        effectiveEndDate: FIND_ONE_RESULT.effectiveEndDate.toISOString(),
      });
  });

  test("POST /boms existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/boms")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        editedAt: CREATE_RESULT.editedAt.toISOString(),
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        effectiveStartDate: CREATE_RESULT.effectiveStartDate.toISOString(),
        effectiveEndDate: CREATE_RESULT.effectiveEndDate.toISOString(),
      })
      .then(function () {
        agent
          .post("/boms")
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
