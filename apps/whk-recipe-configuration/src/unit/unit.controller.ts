import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { UnitService } from "./unit.service";
import { UnitControllerBase } from "./base/unit.controller.base";

@swagger.ApiTags("units")
@common.Controller("units")
export class UnitController extends UnitControllerBase {
  constructor(
    protected readonly service: UnitService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
