import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { MashingDatumService } from "./mashingDatum.service";
import { MashingDatumControllerBase } from "./base/mashingDatum.controller.base";

@swagger.ApiTags("mashingData")
@common.Controller("mashingData")
export class MashingDatumController extends MashingDatumControllerBase {
  constructor(
    protected readonly service: MashingDatumService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
