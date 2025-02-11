import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { TestParameterService } from "./testParameter.service";
import { TestParameterControllerBase } from "./base/testParameter.controller.base";

@swagger.ApiTags("testParameters")
@common.Controller("testParameters")
export class TestParameterController extends TestParameterControllerBase {
  constructor(
    protected readonly service: TestParameterService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
