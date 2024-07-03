import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { FermentationChemistryServiceBase } from "./base/fermentationChemistry.service.base";

@Injectable()
export class FermentationChemistryService extends FermentationChemistryServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
