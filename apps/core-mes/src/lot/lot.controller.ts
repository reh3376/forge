import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { LotService } from "./lot.service";
import { LotControllerBase } from "./base/lot.controller.base";

@swagger.ApiTags("lots")
@common.Controller("lots")
export class LotController extends LotControllerBase {
  constructor(
    protected readonly service: LotService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
