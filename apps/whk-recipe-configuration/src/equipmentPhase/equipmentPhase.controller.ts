import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import { ACGuard, InjectRolesBuilder, RolesBuilder, UseRoles } from "nest-access-control";
import { EquipmentPhaseService } from "./equipmentPhase.service";
import { EquipmentPhaseControllerBase } from "./base/equipmentPhase.controller.base";

@swagger.ApiTags("equipmentPhases")
@common.Controller("equipmentPhases")
export class EquipmentPhaseController extends EquipmentPhaseControllerBase {
  constructor(
    protected readonly service: EquipmentPhaseService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
