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
import { ItemReceiptController } from "../itemReceipt.controller";
import { ItemReceiptService } from "../itemReceipt.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  driver: "exampleDriver",
  glabalId: "exampleGlabalId",
  id: "exampleId",
  quantity: 42.424242424,
  receiptAccepted: "true",
  schemaVersion: "exampleSchemaVersion",
  supplierLot: "exampleSupplierLot",
  units: "exampleUnits",
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
  weighIn: 42.424242424,
  weighOut: 42.424242424,
};
const CREATE_RESULT = {
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  driver: "exampleDriver",
  glabalId: "exampleGlabalId",
  id: "exampleId",
  quantity: 42.424242424,
  receiptAccepted: "true",
  schemaVersion: "exampleSchemaVersion",
  supplierLot: "exampleSupplierLot",
  units: "exampleUnits",
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
  weighIn: 42.424242424,
  weighOut: 42.424242424,
};
const FIND_MANY_RESULT = [
  {
    createdAt: new Date(),
    createdBy: "exampleCreatedBy",
    driver: "exampleDriver",
    glabalId: "exampleGlabalId",
    id: "exampleId",
    quantity: 42.424242424,
    receiptAccepted: "true",
    schemaVersion: "exampleSchemaVersion",
    supplierLot: "exampleSupplierLot",
    units: "exampleUnits",
    updatedAt: new Date(),
    updatedBy: "exampleUpdatedBy",
    weighIn: 42.424242424,
    weighOut: 42.424242424,
  },
];
const FIND_ONE_RESULT = {
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  driver: "exampleDriver",
  glabalId: "exampleGlabalId",
  id: "exampleId",
  quantity: 42.424242424,
  receiptAccepted: "true",
  schemaVersion: "exampleSchemaVersion",
  supplierLot: "exampleSupplierLot",
  units: "exampleUnits",
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
  weighIn: 42.424242424,
  weighOut: 42.424242424,
};

const service = {
  createItemReceipt() {
    return CREATE_RESULT;
  },
  itemReceipts: () => FIND_MANY_RESULT,
  itemReceipt: ({ where }: { where: { id: string } }) => {
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

describe("ItemReceipt", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: ItemReceiptService,
          useValue: service,
        },
      ],
      controllers: [ItemReceiptController],
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

  test("POST /itemReceipts", async () => {
    await request(app.getHttpServer())
      .post("/itemReceipts")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      });
  });

  test("GET /itemReceipts", async () => {
    await request(app.getHttpServer())
      .get("/itemReceipts")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          updatedAt: FIND_MANY_RESULT[0].updatedAt.toISOString(),
        },
      ]);
  });

  test("GET /itemReceipts/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/itemReceipts"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /itemReceipts/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/itemReceipts"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        updatedAt: FIND_ONE_RESULT.updatedAt.toISOString(),
      });
  });

  test("POST /itemReceipts existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/itemReceipts")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      })
      .then(function () {
        agent
          .post("/itemReceipts")
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
