import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MashingProtocolServiceBase } from "./base/mashingProtocol.service.base";

@Injectable()
export class MashingProtocolService extends MashingProtocolServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
