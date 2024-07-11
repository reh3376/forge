import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { InventoryLogResolverBase } from "./base/inventoryLog.resolver.base";
import { InventoryLog } from "./base/InventoryLog";
import { InventoryLogService } from "./inventoryLog.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => InventoryLog)
export class InventoryLogResolver extends InventoryLogResolverBase {
  constructor(
    protected readonly service: InventoryLogService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
