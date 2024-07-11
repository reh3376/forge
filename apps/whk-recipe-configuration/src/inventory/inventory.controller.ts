import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { InventoryService } from "./inventory.service";
import { InventoryControllerBase } from "./base/inventory.controller.base";

@swagger.ApiTags("inventories")
@common.Controller("inventories")
export class InventoryController extends InventoryControllerBase {
  constructor(
    protected readonly service: InventoryService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
