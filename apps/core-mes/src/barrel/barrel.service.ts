import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BarrelServiceBase } from "./base/barrel.service.base";

@Injectable()
export class BarrelService extends BarrelServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
