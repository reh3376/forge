import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { MashingProtocolStepActualService } from "./mashingProtocolStepActual.service";
import { MashingProtocolStepActualControllerBase } from "./base/mashingProtocolStepActual.controller.base";
import { InjectRolesBuilder } from "nest-access-control";

@swagger.ApiTags("mashingProtocolStepActuals")
@common.Controller("mashingProtocolStepActuals")
export class MashingProtocolStepActualController extends MashingProtocolStepActualControllerBase {
  constructor(
    protected readonly service: MashingProtocolStepActualService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
