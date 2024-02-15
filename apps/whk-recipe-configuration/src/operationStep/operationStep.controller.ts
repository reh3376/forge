import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { OperationStepService } from "./operationStep.service";
import { OperationStepControllerBase } from "./base/operationStep.controller.base";

@swagger.ApiTags("operationSteps")
@common.Controller("operationSteps")
export class OperationStepController extends OperationStepControllerBase {
  constructor(
    protected readonly service: OperationStepService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
