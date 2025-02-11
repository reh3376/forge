import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { InventoryLogService } from "./inventoryLog.service";
import { InventoryLogControllerBase } from "./base/inventoryLog.controller.base";

@swagger.ApiTags("inventoryLogs")
@common.Controller("inventoryLogs")
export class InventoryLogController extends InventoryLogControllerBase {
  constructor(
    protected readonly service: InventoryLogService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
