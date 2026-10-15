import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { BatchParameterValueService } from "./batchParameterValue.service";
import { BatchParameterValueControllerBase } from "./base/batchParameterValue.controller.base";

@swagger.ApiTags("batchParameterValues")
@common.Controller("batchParameterValues")
export class BatchParameterValueController extends BatchParameterValueControllerBase {
  constructor(
    protected readonly service: BatchParameterValueService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
