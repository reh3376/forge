import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { ItemReceiptService } from "./itemReceipt.service";
import { ItemReceiptControllerBase } from "./base/itemReceipt.controller.base";

@swagger.ApiTags("itemReceipts")
@common.Controller("itemReceipts")
export class ItemReceiptController extends ItemReceiptControllerBase {
  constructor(
    protected readonly service: ItemReceiptService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
