import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { RecipeBomActualService } from "./recipeBomActual.service";
import { RecipeBomActualControllerBase } from "./base/recipeBomActual.controller.base";
import { InjectRolesBuilder } from "nest-access-control";

@swagger.ApiTags("recipeBomActuals")
@common.Controller("recipeBomActuals")
export class RecipeBomActualController extends RecipeBomActualControllerBase {
  constructor(
    protected readonly service: RecipeBomActualService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
