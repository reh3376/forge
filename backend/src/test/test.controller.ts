import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { TestService } from "./test.service";
import { TestControllerBase } from "./base/test.controller.base";

@swagger.ApiTags("tests")
@common.Controller("tests")
export class TestController extends TestControllerBase {
  constructor(
    protected readonly service: TestService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
