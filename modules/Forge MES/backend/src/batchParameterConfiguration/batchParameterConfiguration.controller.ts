import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { BatchParameterConfigurationService } from "./batchParameterConfiguration.service";
import { BatchParameterConfigurationControllerBase } from "./base/batchParameterConfiguration.controller.base";

@swagger.ApiTags("batchParameterConfigurations")
@common.Controller("batchParameterConfigurations")
export class BatchParameterConfigurationController extends BatchParameterConfigurationControllerBase {
  constructor(
    protected readonly service: BatchParameterConfigurationService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
