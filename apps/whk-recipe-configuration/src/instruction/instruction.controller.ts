import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { InstructionService } from "./instruction.service";
import { InstructionControllerBase } from "./base/instruction.controller.base";

@swagger.ApiTags("instructions")
@common.Controller("instructions")
export class InstructionController extends InstructionControllerBase {
  constructor(
    protected readonly service: InstructionService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
