import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EquipmentPhaseModuleBase } from "./base/equipmentPhase.module.base";
import { EquipmentPhaseService } from "./equipmentPhase.service";
import { EquipmentPhaseController } from "./equipmentPhase.controller";
import { EquipmentPhaseResolver } from "./equipmentPhase.resolver";

@Module({
  imports: [EquipmentPhaseModuleBase, forwardRef(() => AuthModule)],
  controllers: [EquipmentPhaseController],
  providers: [EquipmentPhaseService, EquipmentPhaseResolver],
  exports: [EquipmentPhaseService],
})
export class EquipmentPhaseModule {}
