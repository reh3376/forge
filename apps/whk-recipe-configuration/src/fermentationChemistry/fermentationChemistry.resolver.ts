import * as graphql from "@nestjs/graphql";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
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
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
