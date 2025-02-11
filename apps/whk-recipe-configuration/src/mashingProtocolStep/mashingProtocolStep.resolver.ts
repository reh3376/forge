import * as graphql from "@nestjs/graphql";
import { ACGuard, InjectRolesBuilder, RolesBuilder, UseRoles } from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { MashingProtocolStepResolverBase } from "./base/mashingProtocolStep.resolver.base";
import { MashingProtocolStep } from "./base/MashingProtocolStep";
import { MashingProtocolStepService } from "./mashingProtocolStep.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => MashingProtocolStep)
export class MashingProtocolStepResolver extends MashingProtocolStepResolverBase {
  constructor(
    protected readonly service: MashingProtocolStepService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
