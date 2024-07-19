import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { MashingProtocolService } from "./mashingProtocol.service";
import { MashingProtocolControllerBase } from "./base/mashingProtocol.controller.base";

@swagger.ApiTags("mashingProtocols")
@common.Controller("mashingProtocols")
export class MashingProtocolController extends MashingProtocolControllerBase {
  constructor(
    protected readonly service: MashingProtocolService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
