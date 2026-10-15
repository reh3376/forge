import { Module, forwardRef } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { EquipmentStateController } from "./equipmentState.controller";
import { EquipmentStateService } from "./equipmentState.service";

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule)],
  controllers: [EquipmentStateController],
  providers: [EquipmentStateService],
  exports: [EquipmentStateService],
})
export class EquipmentStateModule {}
