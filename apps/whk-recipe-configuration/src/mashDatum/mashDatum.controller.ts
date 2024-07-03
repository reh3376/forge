import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { MashDatumService } from "./mashDatum.service";
import { MashDatumControllerBase } from "./base/mashDatum.controller.base";

@swagger.ApiTags("mashData")
@common.Controller("mashData")
export class MashDatumController extends MashDatumControllerBase {
  constructor(
    protected readonly service: MashDatumService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
