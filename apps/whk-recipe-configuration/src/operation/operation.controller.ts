import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import { ACGuard, InjectRolesBuilder, RolesBuilder, UseRoles } from "nest-access-control";
import { OperationService } from "./operation.service";
import { OperationControllerBase } from "./base/operation.controller.base";

@swagger.ApiTags("operations")
@common.Controller("operations")
export class OperationController extends OperationControllerBase {
  constructor(
    protected readonly service: OperationService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
