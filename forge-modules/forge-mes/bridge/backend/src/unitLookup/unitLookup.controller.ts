import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { UnitLookupService } from "./unitLookup.service";
import { UnitLookupControllerBase } from "./base/unitLookup.controller.base";

@swagger.ApiTags("unitLookups")
@common.Controller("unitLookups")
export class UnitLookupController extends UnitLookupControllerBase {
  constructor(
    protected readonly service: UnitLookupService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
