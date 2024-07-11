import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { InventoryTransferService } from "./inventoryTransfer.service";
import { InventoryTransferControllerBase } from "./base/inventoryTransfer.controller.base";

@swagger.ApiTags("inventoryTransfers")
@common.Controller("inventoryTransfers")
export class InventoryTransferController extends InventoryTransferControllerBase {
  constructor(
    protected readonly service: InventoryTransferService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
