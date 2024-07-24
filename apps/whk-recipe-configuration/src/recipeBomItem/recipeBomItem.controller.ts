import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { RecipeBomItemService } from "./recipeBomItem.service";
import { RecipeBomItemControllerBase } from "./base/recipeBomItem.controller.base";

@swagger.ApiTags("recipeBomItems")
@common.Controller("recipeBomItems")
export class RecipeBomItemController extends RecipeBomItemControllerBase {
  constructor(
    protected readonly service: RecipeBomItemService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
