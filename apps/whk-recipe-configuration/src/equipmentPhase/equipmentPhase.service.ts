import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EquipmentPhaseServiceBase } from "./base/equipmentPhase.service.base";

@Injectable()
export class EquipmentPhaseService extends EquipmentPhaseServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
