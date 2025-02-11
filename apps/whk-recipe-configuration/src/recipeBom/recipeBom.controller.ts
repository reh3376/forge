import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { RecipeBomService } from "./recipeBom.service";
import { RecipeBomControllerBase } from "./base/recipeBom.controller.base";

@swagger.ApiTags("recipeBoms")
@common.Controller("recipeBoms")
export class RecipeBomController extends RecipeBomControllerBase {
  constructor(
    protected readonly service: RecipeBomService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
