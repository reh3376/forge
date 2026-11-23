import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BatchTimeSeriesDataServiceBase } from "./base/batchTimeSeriesData.service.base";

@Injectable()
export class BatchTimeSeriesDataService extends BatchTimeSeriesDataServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
