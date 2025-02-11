import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import { ACGuard, InjectRolesBuilder, RolesBuilder, UseRoles } from "nest-access-control";
import { UserService } from "./user.service";
import { UserControllerBase } from "./base/user.controller.base";

@swagger.ApiTags("users")
@common.Controller("users")
export class UserController extends UserControllerBase {
  constructor(
    protected readonly service: UserService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
