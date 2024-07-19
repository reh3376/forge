import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { MashingProtocolStepService } from "./mashingProtocolStep.service";
import { MashingProtocolStepControllerBase } from "./base/mashingProtocolStep.controller.base";

@swagger.ApiTags("mashingProtocolSteps")
@common.Controller("mashingProtocolSteps")
export class MashingProtocolStepController extends MashingProtocolStepControllerBase {
  constructor(
    protected readonly service: MashingProtocolStepService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
