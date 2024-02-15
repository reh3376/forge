import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { OperationService } from "./operation.service";
import { OperationControllerBase } from "./base/operation.controller.base";

@swagger.ApiTags("operations")
@common.Controller("operations")
export class OperationController extends OperationControllerBase {
  constructor(
    protected readonly service: OperationService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
