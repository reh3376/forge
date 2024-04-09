import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { ItemGroupService } from "./itemGroup.service";
import { ItemGroupControllerBase } from "./base/itemGroup.controller.base";

@swagger.ApiTags("itemGroups")
@common.Controller("itemGroups")
export class ItemGroupController extends ItemGroupControllerBase {
  constructor(
    protected readonly service: ItemGroupService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
