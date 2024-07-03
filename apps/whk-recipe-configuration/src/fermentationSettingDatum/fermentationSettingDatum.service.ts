import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { FermentationSettingDatumServiceBase } from "./base/fermentationSettingDatum.service.base";

@Injectable()
export class FermentationSettingDatumService extends FermentationSettingDatumServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
