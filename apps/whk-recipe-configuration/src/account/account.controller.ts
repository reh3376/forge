import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { AccountService } from "./account.service";
import { AccountControllerBase } from "./base/account.controller.base";

@swagger.ApiTags("accounts")
@common.Controller("accounts")
export class AccountController extends AccountControllerBase {
  constructor(
    protected readonly service: AccountService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
