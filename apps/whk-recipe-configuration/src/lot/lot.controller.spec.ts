import { Test } from "@nestjs/testing";
import {
  INestApplication,
  HttpStatus,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import request from "supertest";
import { ACGuard } from "nest-access-control";
import { DefaultAuthGuard } from "../auth/defaultAuth.guard";
import { ACLModule } from "../auth/acl.module";
import { AclFilterResponseInterceptor } from "../interceptors/aclFilterResponse.interceptor";
import { AclValidateRequestInterceptor } from "../interceptors/aclValidateRequest.interceptor";
import { map } from "rxjs";
import { LotController } from "./lot.controller";
import { LotService } from "./lot.service";
import { PrismaModule } from "../prisma/prisma.module";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import { WINSTON_MODULE_NEST_PROVIDER, WinstonModule } from "nest-winston";
import { RabbitMQModule } from "../rabbitmq/rabbitmq.module";
import { ConfigService } from "@nestjs/config";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  avgBblFillByPg: 42.42,
  avgBblFillByWg: 42.42,
  avgPGsFerm: 42.42,
  bblEntryProof: 42.42,
  bblOem: "exampleBblOem",
  bblTotal: 42,
  bblType: "ISC",
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
  lotAlphaChar: "A",
  lotCreatedAt: new Date(),
  notes: "exampleNotes",
  pgLosses: 42.42,
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
  bblType: "ISC",
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
  lotAlphaChar: "A",
  lotCreatedAt: new Date(),
  lotNumber: "24J08A.10",
  notes: "exampleNotes",
  pgLosses: 42.42,
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

  test("calculateLotMetrics calculates metrics correctly", async () => {
    // const lotService = app.get<LotService>(LotService);
        const module = await Test.createTestingModule({
      imports: [PrismaModule, WinstonModule],
      providers: [
        LotService,
        {
          provide: RabbitMQProducerService,
          useValue: {
            // Mock implementation of RabbitMQProducerService methods
          },
        },
        {
          provide: WINSTON_MODULE_NEST_PROVIDER,
          useValue: {
            // Mock implementation of Winston logger
          },
        },
        {
          provide: ConfigService,
          useValue: {
            // Mock implementation of ConfigService
            get: jest.fn().mockReturnValue('mocked-value'),
          },
        },
      ],
    }).compile();
    const lotService = module.get<LotService>(LotService);
    const inputData = {
      avgBblFillByPg: 0,
      avgBblFillByWg: 0,
      avgPGsFerm: 0,
      bblOem: "exampleBblOem",
      bblType: "ISC",
      createdAt: new Date(),
      createdBy: "exampleCreatedBy",
      externalId: "exampleExternalId",
      filledFromString: "exampleFilledFromString",
      globalId: "exampleGlobalId",
      grainLbsFerm: 0,
      grainLbsPg: 0,
      id: "exampleId",
      lotAlphaChar: "A",
      lotCreatedAt: new Date(),
      notes: "exampleNotes",
      pgLosses: 0,
      schemaVersion: "exampleSchemaVersion",
      standardYield: 0,
      totalFermenters: 3,
      totalPGs: 0,
      totalPGsByRecipe: 0,
      totalVolumeWg: 0,
      totalWGs: 0,
      totalWeight: 0,
      updatedAt: new Date(),
      warehouseEntryNumber: 42,
      densityFinal: 1,
      initialVolume: 1000,
      initialWeight: 2000,
      finalVolume: 950, 
      finalWeight: 1900,
      bblEntryProof: 10,
      bblTotal: 100,
    };

    const result = await lotService.calculateLotAnalytics(inputData);

    // Expect the result to contain only the calculated fields and essential data
    expect(result).toEqual({
      totalWeight: expect.any(Number),
      totalVolumeWg: expect.any(Number),
      totalPGs: expect.any(Number),
      totalWGs: expect.any(Number),
      avgPGsFerm: expect.any(Number),
      avgBblFillByPg: expect.any(Number),
      avgBblFillByWg: expect.any(Number),
      status: expect.any(String),
      densityFinal: expect.any(Number),
    });

    // Check for the presence of calculated metrics
    expect(result).toHaveProperty('densityFinal');
    expect(result).toHaveProperty('avgPGsFerm');
    expect(result).toHaveProperty('avgBblFillByPg');
    expect(result).toHaveProperty('avgBblFillByWg');
    expect(result).toHaveProperty('totalWeight');
    expect(result).toHaveProperty('totalVolumeWg');
    expect(result).toHaveProperty('totalPGs');
    expect(result).toHaveProperty('totalWGs');

    // Add specific checks for each calculated metric
    expect(result.densityFinal).toBeCloseTo(1*8.3454, 1);
    expect(result.avgPGsFerm).toBeGreaterThan(0);
    expect(result.avgBblFillByPg).toBeGreaterThan(0);
    expect(result.avgBblFillByWg).toBeGreaterThan(0);
  });

  afterAll(async () => {
    await app.close();
  });
});
