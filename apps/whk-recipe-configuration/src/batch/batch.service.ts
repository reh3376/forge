import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BatchServiceBase } from "./base/batch.service.base";
import { Batch } from "./base/Batch";

@Injectable()
export class BatchService extends BatchServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  // private transformActualsToBatch(actuals: Actual[]): Batch {
  //   return actuals.map((actual) => ({
  //     id: actual.id,
  //     name: actual.name,
  //   }));
  // }
}
