import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { FermentationDayDatumServiceBase } from "./base/fermentationDayDatum.service.base";

@Injectable()
export class FermentationDayDatumService extends FermentationDayDatumServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
