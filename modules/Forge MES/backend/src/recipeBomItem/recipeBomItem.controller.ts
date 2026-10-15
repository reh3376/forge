import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { RecipeBomItemService } from "./recipeBomItem.service";
import { RecipeBomItemControllerBase } from "./base/recipeBomItem.controller.base";

@swagger.ApiTags("recipeBomItems")
@common.Controller("recipeBomItems")
export class RecipeBomItemController extends RecipeBomItemControllerBase {
  constructor(
    protected readonly service: RecipeBomItemService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
