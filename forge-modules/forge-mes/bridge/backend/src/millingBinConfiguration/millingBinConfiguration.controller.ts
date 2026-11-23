import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { MillingBinConfigurationService } from "./millingBinConfiguration.service";
import { MillingBinConfigurationControllerBase } from "./base/millingBinConfiguration.controller.base";

@swagger.ApiTags("millingBinConfigurations")
@common.Controller("millingBinConfigurations")
export class MillingBinConfigurationController extends MillingBinConfigurationControllerBase {
  constructor(
    protected readonly service: MillingBinConfigurationService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
