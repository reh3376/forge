import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MashingDatumServiceBase } from "./base/mashingDatum.service.base";

@Injectable()
export class MashingDatumService extends MashingDatumServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
