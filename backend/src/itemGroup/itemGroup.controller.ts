import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { ItemGroupService } from "./itemGroup.service";
import { ItemGroupControllerBase } from "./base/itemGroup.controller.base";

@swagger.ApiTags("itemGroups")
@common.Controller("itemGroups")
export class ItemGroupController extends ItemGroupControllerBase {
  constructor(
    protected readonly service: ItemGroupService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
