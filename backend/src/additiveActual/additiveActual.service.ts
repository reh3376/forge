import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AdditiveActualServiceBase } from "./base/additiveActual.service.base";

@Injectable()
export class AdditiveActualService extends AdditiveActualServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
