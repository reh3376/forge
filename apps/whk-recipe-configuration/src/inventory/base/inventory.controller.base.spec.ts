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
import { InventoryController } from "../inventory.controller";
import { InventoryService } from "../inventory.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  id: "exampleId",
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "exampleCreatedBy",
  updatedBy: "exampleUpdatedBy",
  schemaVersion: "exampleSchemaVersion",
  revision: 42,
  correctionNote: "exampleCorrectionNote",
  correctedBy: "exampleCorrectedBy",
  lotNumber: "exampleLotNumber",
  notes: "exampleNotes",
  units: "exampleUnits",
  globalId: "exampleGlobalId",
  proof: 42.424242424,
  fifoIndex: 42,
};
const CREATE_RESULT = {
  id: "exampleId",
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "exampleCreatedBy",
  updatedBy: "exampleUpdatedBy",
  schemaVersion: "exampleSchemaVersion",
  revision: 42,
  correctionNote: "exampleCorrectionNote",
  correctedBy: "exampleCorrectedBy",
  lotNumber: "exampleLotNumber",
  notes: "exampleNotes",
  units: "exampleUnits",
  globalId: "exampleGlobalId",
  proof: 42.424242424,
  fifoIndex: 42,
};
const FIND_MANY_RESULT = [
  {
    id: "exampleId",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "exampleCreatedBy",
    updatedBy: "exampleUpdatedBy",
    schemaVersion: "exampleSchemaVersion",
    revision: 42,
    correctionNote: "exampleCorrectionNote",
    correctedBy: "exampleCorrectedBy",
    lotNumber: "exampleLotNumber",
    notes: "exampleNotes",
    units: "exampleUnits",
    globalId: "exampleGlobalId",
    proof: 42.424242424,
    fifoIndex: 42,
  },
];
const FIND_ONE_RESULT = {
  id: "exampleId",
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "exampleCreatedBy",
  updatedBy: "exampleUpdatedBy",
  schemaVersion: "exampleSchemaVersion",
  revision: 42,
  correctionNote: "exampleCorrectionNote",
  correctedBy: "exampleCorrectedBy",
  lotNumber: "exampleLotNumber",
  notes: "exampleNotes",
  units: "exampleUnits",
  globalId: "exampleGlobalId",
  proof: 42.424242424,
  fifoIndex: 42,
};

const service = {
  createInventory() {
    return CREATE_RESULT;
  },
  inventories: () => FIND_MANY_RESULT,
  inventory: ({ where }: { where: { id: string } }) => {
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

describe("Inventory", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: InventoryService,
          useValue: service,
        },
      ],
      controllers: [InventoryController],
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

  test("POST /inventories", async () => {
    await request(app.getHttpServer())
      .post("/inventories")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      });
  });

  test("GET /inventories", async () => {
    await request(app.getHttpServer())
      .get("/inventories")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          updatedAt: FIND_MANY_RESULT[0].updatedAt.toISOString(),
        },
      ]);
  });

  test("GET /inventories/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/inventories"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /inventories/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/inventories"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        updatedAt: FIND_ONE_RESULT.updatedAt.toISOString(),
      });
  });

  test("POST /inventories existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/inventories")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      })
      .then(function () {
        agent
          .post("/inventories")
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
