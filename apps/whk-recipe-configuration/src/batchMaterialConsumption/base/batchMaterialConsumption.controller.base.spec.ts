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
import { BatchMaterialConsumptionController } from "../batchMaterialConsumption.controller";
import { BatchMaterialConsumptionService } from "../batchMaterialConsumption.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  binNumber: 42,
  consumedAt: new Date(),
  createdAt: new Date(),
  id: "exampleId",
  quantity: 42.42,
  supplierLot: "exampleSupplierLot",
  units: "exampleUnits",
  updatedAt: new Date(),
  verified: "true",
  verifiedAt: new Date(),
  verifiedBy: "exampleVerifiedBy",
};
const CREATE_RESULT = {
  binNumber: 42,
  consumedAt: new Date(),
  createdAt: new Date(),
  id: "exampleId",
  quantity: 42.42,
  supplierLot: "exampleSupplierLot",
  units: "exampleUnits",
  updatedAt: new Date(),
  verified: "true",
  verifiedAt: new Date(),
  verifiedBy: "exampleVerifiedBy",
};
const FIND_MANY_RESULT = [
  {
    binNumber: 42,
    consumedAt: new Date(),
    createdAt: new Date(),
    id: "exampleId",
    quantity: 42.42,
    supplierLot: "exampleSupplierLot",
    units: "exampleUnits",
    updatedAt: new Date(),
    verified: "true",
    verifiedAt: new Date(),
    verifiedBy: "exampleVerifiedBy",
  },
];
const FIND_ONE_RESULT = {
  binNumber: 42,
  consumedAt: new Date(),
  createdAt: new Date(),
  id: "exampleId",
  quantity: 42.42,
  supplierLot: "exampleSupplierLot",
  units: "exampleUnits",
  updatedAt: new Date(),
  verified: "true",
  verifiedAt: new Date(),
  verifiedBy: "exampleVerifiedBy",
};

const service = {
  createBatchMaterialConsumption() {
    return CREATE_RESULT;
  },
  batchMaterialConsumptions: () => FIND_MANY_RESULT,
  batchMaterialConsumption: ({ where }: { where: { id: string } }) => {
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

describe("BatchMaterialConsumption", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: BatchMaterialConsumptionService,
          useValue: service,
        },
      ],
      controllers: [BatchMaterialConsumptionController],
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

  test("POST /batchMaterialConsumptions", async () => {
    await request(app.getHttpServer())
      .post("/batchMaterialConsumptions")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        consumedAt: CREATE_RESULT.consumedAt.toISOString(),
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
        verifiedAt: CREATE_RESULT.verifiedAt.toISOString(),
      });
  });

  test("GET /batchMaterialConsumptions", async () => {
    await request(app.getHttpServer())
      .get("/batchMaterialConsumptions")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          consumedAt: FIND_MANY_RESULT[0].consumedAt.toISOString(),
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          updatedAt: FIND_MANY_RESULT[0].updatedAt.toISOString(),
          verifiedAt: FIND_MANY_RESULT[0].verifiedAt.toISOString(),
        },
      ]);
  });

  test("GET /batchMaterialConsumptions/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/batchMaterialConsumptions"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /batchMaterialConsumptions/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/batchMaterialConsumptions"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        consumedAt: FIND_ONE_RESULT.consumedAt.toISOString(),
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        updatedAt: FIND_ONE_RESULT.updatedAt.toISOString(),
        verifiedAt: FIND_ONE_RESULT.verifiedAt.toISOString(),
      });
  });

  test("POST /batchMaterialConsumptions existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/batchMaterialConsumptions")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        consumedAt: CREATE_RESULT.consumedAt.toISOString(),
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
        verifiedAt: CREATE_RESULT.verifiedAt.toISOString(),
      })
      .then(function () {
        agent
          .post("/batchMaterialConsumptions")
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
