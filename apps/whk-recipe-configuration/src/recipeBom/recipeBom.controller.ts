import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { RecipeBomService } from "./recipeBom.service";
import { RecipeBomControllerBase } from "./base/recipeBom.controller.base";

@swagger.ApiTags("recipeBoms")
@common.Controller("recipeBoms")
export class RecipeBomController extends RecipeBomControllerBase {
  constructor(
    protected readonly service: RecipeBomService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
