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
import { RecipeBomItemController } from "../recipeBomItem.controller";
import { RecipeBomItemService } from "../recipeBomItem.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  id: "exampleId",
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "exampleCreatedBy",
  updatedBy: new Date(),
  operationIndex: 42,
  isClassDefinition: "true",
  quantity: 42,
  units: "exampleUnits",
  quantityActual: 42.424242424,
  globalId: "exampleGlobalId",
  lot: "exampleLot",
};
const CREATE_RESULT = {
  id: "exampleId",
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "exampleCreatedBy",
  updatedBy: new Date(),
  operationIndex: 42,
  isClassDefinition: "true",
  quantity: 42,
  units: "exampleUnits",
  quantityActual: 42.424242424,
  globalId: "exampleGlobalId",
  lot: "exampleLot",
};
const FIND_MANY_RESULT = [
  {
    id: "exampleId",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "exampleCreatedBy",
    updatedBy: new Date(),
    operationIndex: 42,
    isClassDefinition: "true",
    quantity: 42,
    units: "exampleUnits",
    quantityActual: 42.424242424,
    globalId: "exampleGlobalId",
    lot: "exampleLot",
  },
];
const FIND_ONE_RESULT = {
  id: "exampleId",
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "exampleCreatedBy",
  updatedBy: new Date(),
  operationIndex: 42,
  isClassDefinition: "true",
  quantity: 42,
  units: "exampleUnits",
  quantityActual: 42.424242424,
  globalId: "exampleGlobalId",
  lot: "exampleLot",
};

const service = {
  createRecipeBomItem() {
    return CREATE_RESULT;
  },
  recipeBomItems: () => FIND_MANY_RESULT,
  recipeBomItem: ({ where }: { where: { id: string } }) => {
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

describe("RecipeBomItem", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: RecipeBomItemService,
          useValue: service,
        },
      ],
      controllers: [RecipeBomItemController],
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

  test("POST /recipeBomItems", async () => {
    await request(app.getHttpServer())
      .post("/recipeBomItems")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
        updatedBy: CREATE_RESULT.updatedBy.toISOString(),
      });
  });

  test("GET /recipeBomItems", async () => {
    await request(app.getHttpServer())
      .get("/recipeBomItems")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          updatedAt: FIND_MANY_RESULT[0].updatedAt.toISOString(),
          updatedBy: FIND_MANY_RESULT[0].updatedBy.toISOString(),
        },
      ]);
  });

  test("GET /recipeBomItems/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/recipeBomItems"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /recipeBomItems/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/recipeBomItems"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        updatedAt: FIND_ONE_RESULT.updatedAt.toISOString(),
        updatedBy: FIND_ONE_RESULT.updatedBy.toISOString(),
      });
  });

  test("POST /recipeBomItems existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/recipeBomItems")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
        updatedBy: CREATE_RESULT.updatedBy.toISOString(),
      })
      .then(function () {
        agent
          .post("/recipeBomItems")
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
