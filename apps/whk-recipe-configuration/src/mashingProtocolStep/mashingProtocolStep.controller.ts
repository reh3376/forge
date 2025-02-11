import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { MashingProtocolStepService } from "./mashingProtocolStep.service";
import { MashingProtocolStepControllerBase } from "./base/mashingProtocolStep.controller.base";

@swagger.ApiTags("mashingProtocolSteps")
@common.Controller("mashingProtocolSteps")
export class MashingProtocolStepController extends MashingProtocolStepControllerBase {
  constructor(
    protected readonly service: MashingProtocolStepService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
