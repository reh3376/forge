import * as graphql from "@nestjs/graphql";
import { ACGuard, InjectRolesBuilder, RolesBuilder, UseRoles } from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { FermentationSettingDatumResolverBase } from "./base/fermentationSettingDatum.resolver.base";
import { FermentationSettingDatum } from "./base/FermentationSettingDatum";
import { FermentationSettingDatumService } from "./fermentationSettingDatum.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => FermentationSettingDatum)
export class FermentationSettingDatumResolver extends FermentationSettingDatumResolverBase {
  constructor(
    protected readonly service: FermentationSettingDatumService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
