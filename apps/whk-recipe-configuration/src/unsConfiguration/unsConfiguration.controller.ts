import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { UnsConfigurationService } from "./unsConfiguration.service";
import { UnsConfigurationControllerBase } from "./base/unsConfiguration.controller.base";

@swagger.ApiTags("unsConfigurations")
@common.Controller("unsConfigurations")
export class UnsConfigurationController extends UnsConfigurationControllerBase {
  constructor(
    protected readonly service: UnsConfigurationService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
