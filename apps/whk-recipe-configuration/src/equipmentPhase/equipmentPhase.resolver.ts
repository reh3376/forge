import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { EquipmentPhaseResolverBase } from "./base/equipmentPhase.resolver.base";
import { EquipmentPhase } from "./base/EquipmentPhase";
import { EquipmentPhaseService } from "./equipmentPhase.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => EquipmentPhase)
export class EquipmentPhaseResolver extends EquipmentPhaseResolverBase {
  constructor(
    protected readonly service: EquipmentPhaseService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
