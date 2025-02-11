import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { BomItemService } from "./bomItem.service";
import { BomItemControllerBase } from "./base/bomItem.controller.base";

@swagger.ApiTags("bomItems")
@common.Controller("bomItems")
export class BomItemController extends BomItemControllerBase {
  constructor(
    protected readonly service: BomItemService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
