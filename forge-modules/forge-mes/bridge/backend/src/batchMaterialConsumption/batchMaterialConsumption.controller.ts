import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { BatchMaterialConsumptionService } from "./batchMaterialConsumption.service";
import { BatchMaterialConsumptionControllerBase } from "./base/batchMaterialConsumption.controller.base";

@swagger.ApiTags("batchMaterialConsumptions")
@common.Controller("batchMaterialConsumptions")
export class BatchMaterialConsumptionController extends BatchMaterialConsumptionControllerBase {
  constructor(
    protected readonly service: BatchMaterialConsumptionService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
