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
import { PurchaseOrderController } from "../purchaseOrder.controller";
import { PurchaseOrderService } from "../purchaseOrder.service";
import { PrismaService } from "../../prisma/prisma.service";
import { LoggerModule } from "../../logger/logger.module";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  className: "exampleClassName",
  complete: "true",
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  erpId: "exampleErpId",
  globalId: "exampleGlobalId",
  id: "exampleId",
  name: "exampleName",
  purchaseOrderReceiptDate: new Date(),
  purchaseOrderReceived: "true",
  receivedQuantity: 42,
  revision: 42,
  schemaVersion: "exampleSchemaVersion",
  totalOrderQuantity: 42,
  transactionGroup: "exampleTransactionGroup",
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
};
const CREATE_RESULT = {
  className: "exampleClassName",
  complete: "true",
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  erpId: "exampleErpId",
  globalId: "exampleGlobalId",
  id: "exampleId",
  name: "exampleName",
  purchaseOrderReceiptDate: new Date(),
  purchaseOrderReceived: "true",
  receivedQuantity: 42,
  revision: 42,
  schemaVersion: "exampleSchemaVersion",
  totalOrderQuantity: 42,
  transactionGroup: "exampleTransactionGroup",
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
};
const FIND_MANY_RESULT = [
  {
    className: "exampleClassName",
    complete: "true",
    createdAt: new Date(),
    createdBy: "exampleCreatedBy",
    erpId: "exampleErpId",
    globalId: "exampleGlobalId",
    id: "exampleId",
    name: "exampleName",
    purchaseOrderReceiptDate: new Date(),
    purchaseOrderReceived: "true",
    receivedQuantity: 42,
    revision: 42,
    schemaVersion: "exampleSchemaVersion",
    totalOrderQuantity: 42,
    transactionGroup: "exampleTransactionGroup",
    updatedAt: new Date(),
    updatedBy: "exampleUpdatedBy",
  },
];
const FIND_ONE_RESULT = {
  className: "exampleClassName",
  complete: "true",
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  erpId: "exampleErpId",
  globalId: "exampleGlobalId",
  id: "exampleId",
  name: "exampleName",
  purchaseOrderReceiptDate: new Date(),
  purchaseOrderReceived: "true",
  receivedQuantity: 42,
  revision: 42,
  schemaVersion: "exampleSchemaVersion",
  totalOrderQuantity: 42,
  transactionGroup: "exampleTransactionGroup",
  updatedAt: new Date(),
  updatedBy: "exampleUpdatedBy",
};

const service = {
  createPurchaseOrder() {
    return CREATE_RESULT;
  },
  purchaseOrders: () => FIND_MANY_RESULT,
  purchaseOrder: ({ where }: { where: { id: string } }) => {
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

describe("PurchaseOrder", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: PurchaseOrderService,
          useValue: service,
        },
        PrismaService,
      ],
      controllers: [PurchaseOrderController],
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

  test("POST /purchaseOrders", async () => {
    await request(app.getHttpServer())
      .post("/purchaseOrders")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        purchaseOrderReceiptDate:
          CREATE_RESULT.purchaseOrderReceiptDate.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      });
  });

  test("GET /purchaseOrders", async () => {
    await request(app.getHttpServer())
      .get("/purchaseOrders")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          purchaseOrderReceiptDate:
            FIND_MANY_RESULT[0].purchaseOrderReceiptDate.toISOString(),
          updatedAt: FIND_MANY_RESULT[0].updatedAt.toISOString(),
        },
      ]);
  });

  test("GET /purchaseOrders/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/purchaseOrders"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /purchaseOrders/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/purchaseOrders"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        purchaseOrderReceiptDate:
          FIND_ONE_RESULT.purchaseOrderReceiptDate.toISOString(),
        updatedAt: FIND_ONE_RESULT.updatedAt.toISOString(),
      });
  });

  test("POST /purchaseOrders existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/purchaseOrders")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        purchaseOrderReceiptDate:
          CREATE_RESULT.purchaseOrderReceiptDate.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      })
      .then(function () {
        agent
          .post("/purchaseOrders")
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
