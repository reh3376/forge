import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { UnitLookupService } from "./unitLookup.service";
import { UnitLookupControllerBase } from "./base/unitLookup.controller.base";

@swagger.ApiTags("unitLookups")
@common.Controller("unitLookups")
export class UnitLookupController extends UnitLookupControllerBase {
  constructor(
    protected readonly service: UnitLookupService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
