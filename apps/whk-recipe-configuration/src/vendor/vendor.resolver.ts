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
import { VendorResolverBase } from "./base/vendor.resolver.base";
import { Vendor } from "./base/Vendor";
import { VendorService } from "./vendor.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => Vendor)
export class VendorResolver extends VendorResolverBase {
  constructor(
    protected readonly service: VendorService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
