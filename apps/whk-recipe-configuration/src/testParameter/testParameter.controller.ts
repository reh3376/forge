import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { TestParameterService } from "./testParameter.service";
import { TestParameterControllerBase } from "./base/testParameter.controller.base";

@swagger.ApiTags("testParameters")
@common.Controller("testParameters")
export class TestParameterController extends TestParameterControllerBase {
  constructor(
    protected readonly service: TestParameterService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
