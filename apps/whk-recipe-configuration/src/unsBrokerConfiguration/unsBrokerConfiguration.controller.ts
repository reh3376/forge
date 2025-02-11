import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import { ACGuard, InjectRolesBuilder, RolesBuilder, UseRoles } from "nest-access-control";
import { UnsBrokerConfigurationService } from "./unsBrokerConfiguration.service";
import { UnsBrokerConfigurationControllerBase } from "./base/unsBrokerConfiguration.controller.base";

@swagger.ApiTags("unsBrokerConfigurations")
@common.Controller("unsBrokerConfigurations")
export class UnsBrokerConfigurationController extends UnsBrokerConfigurationControllerBase {
  constructor(
    protected readonly service: UnsBrokerConfigurationService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
