import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { ItemService } from "./item.service";
import { ItemControllerBase } from "./base/item.controller.base";

@swagger.ApiTags("items")
@common.Controller("items")
export class ItemController extends ItemControllerBase {
  constructor(
    protected readonly service: ItemService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
