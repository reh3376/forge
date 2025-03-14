import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { MashingProtocolStepActualResolverBase } from "./base/mashingProtocolStepActual.resolver.base";
import { MashingProtocolStepActual } from "./base/MashingProtocolStepActual";
import { MashingProtocolStepActualService } from "./mashingProtocolStepActual.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => MashingProtocolStepActual)
export class MashingProtocolStepActualResolver extends MashingProtocolStepActualResolverBase {
  constructor(
    protected readonly service: MashingProtocolStepActualService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
