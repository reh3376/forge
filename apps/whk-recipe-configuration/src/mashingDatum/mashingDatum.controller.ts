import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { MashingDatumService } from "./mashingDatum.service";
import { MashingDatumControllerBase } from "./base/mashingDatum.controller.base";

@swagger.ApiTags("mashingData")
@common.Controller("mashingData")
export class MashingDatumController extends MashingDatumControllerBase {
  constructor(
    protected readonly service: MashingDatumService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
