import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { ItemService } from "./item.service";
import { ItemControllerBase } from "./base/item.controller.base";

@swagger.ApiTags("items")
@common.Controller("items")
export class ItemController extends ItemControllerBase {
  constructor(
    protected readonly service: ItemService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
