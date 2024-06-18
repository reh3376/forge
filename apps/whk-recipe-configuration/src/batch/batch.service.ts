import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BatchServiceBase } from "./base/batch.service.base";

@Injectable()
export class BatchService extends BatchServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
