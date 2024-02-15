import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TestParameterServiceBase } from "./base/testParameter.service.base";

@Injectable()
export class TestParameterService extends TestParameterServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
