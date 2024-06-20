import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MashDatumServiceBase } from "./base/mashDatum.service.base";

@Injectable()
export class MashDatumService extends MashDatumServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
