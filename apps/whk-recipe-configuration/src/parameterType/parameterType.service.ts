import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ParameterTypeServiceBase } from "./base/parameterType.service.base";

@Injectable()
export class ParameterTypeService extends ParameterTypeServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
