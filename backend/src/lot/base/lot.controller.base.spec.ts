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
import { LotController } from "../lot.controller";
import { LotService } from "../lot.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  avgBblFillByPg: 42.42,
  avgBblFillByWg: 42.42,
  avgPGsFerm: 42.42,
  bblEntryProof: 42.42,
  bblOem: "exampleBblOem",
  bblTotal: 42,
  bblType: "exampleBblType",
  confirmed: "true",
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  densityFinal: 42.42,
  externalId: "exampleExternalId",
  filledFromString: "exampleFilledFromString",
  finalVolume: 42.42,
  finalWeight: 42.42,
  globalId: "exampleGlobalId",
  grainLbsFerm: 42.42,
  grainLbsPg: 42.42,
  id: "exampleId",
  initialVolume: 42.42,
  initialWeight: 42.42,
  isRawMaterial: "true",
  lotAlphaChar: "exampleLotAlphaChar",
  lotCreatedAt: new Date(),
  lotNumber: "exampleLotNumber",
  notes: "exampleNotes",
  pgLosses: 42.42,
  proofInitial: 42.42,
  schemaVersion: "exampleSchemaVersion",
  standardYield: 42.42,
  totalFermenters: 42.42,
  totalPGs: 42.42,
  totalPGsByRecipe: 42.42,
  totalVolumeWg: 42.42,
  totalWGs: 42.42,
  totalWeight: 42.42,
  updatedAt: new Date(),
  warehouseEntryNumber: 42,
};
const CREATE_RESULT = {
  avgBblFillByPg: 42.42,
  avgBblFillByWg: 42.42,
  avgPGsFerm: 42.42,
  bblEntryProof: 42.42,
  bblOem: "exampleBblOem",
  bblTotal: 42,
  bblType: "exampleBblType",
  confirmed: "true",
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  densityFinal: 42.42,
  externalId: "exampleExternalId",
  filledFromString: "exampleFilledFromString",
  finalVolume: 42.42,
  finalWeight: 42.42,
  globalId: "exampleGlobalId",
  grainLbsFerm: 42.42,
  grainLbsPg: 42.42,
  id: "exampleId",
  initialVolume: 42.42,
  initialWeight: 42.42,
  isRawMaterial: "true",
  lotAlphaChar: "exampleLotAlphaChar",
  lotCreatedAt: new Date(),
  lotNumber: "exampleLotNumber",
  notes: "exampleNotes",
  pgLosses: 42.42,
  proofInitial: 42.42,
  schemaVersion: "exampleSchemaVersion",
  standardYield: 42.42,
  totalFermenters: 42.42,
  totalPGs: 42.42,
  totalPGsByRecipe: 42.42,
  totalVolumeWg: 42.42,
  totalWGs: 42.42,
  totalWeight: 42.42,
  updatedAt: new Date(),
  warehouseEntryNumber: 42,
};
const FIND_MANY_RESULT = [
  {
    avgBblFillByPg: 42.42,
    avgBblFillByWg: 42.42,
    avgPGsFerm: 42.42,
    bblEntryProof: 42.42,
    bblOem: "exampleBblOem",
    bblTotal: 42,
    bblType: "exampleBblType",
    confirmed: "true",
    createdAt: new Date(),
    createdBy: "exampleCreatedBy",
    densityFinal: 42.42,
    externalId: "exampleExternalId",
    filledFromString: "exampleFilledFromString",
    finalVolume: 42.42,
    finalWeight: 42.42,
    globalId: "exampleGlobalId",
    grainLbsFerm: 42.42,
    grainLbsPg: 42.42,
    id: "exampleId",
    initialVolume: 42.42,
    initialWeight: 42.42,
    isRawMaterial: "true",
    lotAlphaChar: "exampleLotAlphaChar",
    lotCreatedAt: new Date(),
    lotNumber: "exampleLotNumber",
    notes: "exampleNotes",
    pgLosses: 42.42,
    proofInitial: 42.42,
    schemaVersion: "exampleSchemaVersion",
    standardYield: 42.42,
    totalFermenters: 42.42,
    totalPGs: 42.42,
    totalPGsByRecipe: 42.42,
    totalVolumeWg: 42.42,
    totalWGs: 42.42,
    totalWeight: 42.42,
    updatedAt: new Date(),
    warehouseEntryNumber: 42,
  },
];
const FIND_ONE_RESULT = {
  avgBblFillByPg: 42.42,
  avgBblFillByWg: 42.42,
  avgPGsFerm: 42.42,
  bblEntryProof: 42.42,
  bblOem: "exampleBblOem",
  bblTotal: 42,
  bblType: "exampleBblType",
  confirmed: "true",
  createdAt: new Date(),
  createdBy: "exampleCreatedBy",
  densityFinal: 42.42,
  externalId: "exampleExternalId",
  filledFromString: "exampleFilledFromString",
  finalVolume: 42.42,
  finalWeight: 42.42,
  globalId: "exampleGlobalId",
  grainLbsFerm: 42.42,
  grainLbsPg: 42.42,
  id: "exampleId",
  initialVolume: 42.42,
  initialWeight: 42.42,
  isRawMaterial: "true",
  lotAlphaChar: "exampleLotAlphaChar",
  lotCreatedAt: new Date(),
  lotNumber: "exampleLotNumber",
  notes: "exampleNotes",
  pgLosses: 42.42,
  proofInitial: 42.42,
  schemaVersion: "exampleSchemaVersion",
  standardYield: 42.42,
  totalFermenters: 42.42,
  totalPGs: 42.42,
  totalPGsByRecipe: 42.42,
  totalVolumeWg: 42.42,
  totalWGs: 42.42,
  totalWeight: 42.42,
  updatedAt: new Date(),
  warehouseEntryNumber: 42,
};

const service = {
  createLot() {
    return CREATE_RESULT;
  },
  lots: () => FIND_MANY_RESULT,
  lot: ({ where }: { where: { id: string } }) => {
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

describe("Lot", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: LotService,
          useValue: service,
        },
      ],
      controllers: [LotController],
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

  test("POST /lots", async () => {
    await request(app.getHttpServer())
      .post("/lots")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        lotCreatedAt: CREATE_RESULT.lotCreatedAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      });
  });

  test("GET /lots", async () => {
    await request(app.getHttpServer())
      .get("/lots")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          lotCreatedAt: FIND_MANY_RESULT[0].lotCreatedAt.toISOString(),
          updatedAt: FIND_MANY_RESULT[0].updatedAt.toISOString(),
        },
      ]);
  });

  test("GET /lots/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/lots"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /lots/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/lots"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        lotCreatedAt: FIND_ONE_RESULT.lotCreatedAt.toISOString(),
        updatedAt: FIND_ONE_RESULT.updatedAt.toISOString(),
      });
  });

  test("POST /lots existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/lots")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        lotCreatedAt: CREATE_RESULT.lotCreatedAt.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      })
      .then(function () {
        agent
          .post("/lots")
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
