import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { FermentationChemistryResolverBase } from "./base/fermentationChemistry.resolver.base";
import { FermentationChemistry } from "./base/FermentationChemistry";
import { FermentationChemistryService } from "./fermentationChemistry.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => FermentationChemistry)
export class FermentationChemistryResolver extends FermentationChemistryResolverBase {
  constructor(
    protected readonly service: FermentationChemistryService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
