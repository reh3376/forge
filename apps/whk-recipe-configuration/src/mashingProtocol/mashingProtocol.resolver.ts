import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { MashingProtocolResolverBase } from "./base/mashingProtocol.resolver.base";
import { MashingProtocol } from "./base/MashingProtocol";
import { MashingProtocolService } from "./mashingProtocol.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => MashingProtocol)
export class MashingProtocolResolver extends MashingProtocolResolverBase {
  constructor(
    protected readonly service: MashingProtocolService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
