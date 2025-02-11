import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import { ACGuard, InjectRolesBuilder, RolesBuilder, UseRoles } from "nest-access-control";
import { FermentationDayDatumService } from "./fermentationDayDatum.service";
import { FermentationDayDatumControllerBase } from "./base/fermentationDayDatum.controller.base";

@swagger.ApiTags("fermentationDayData")
@common.Controller("fermentationDayData")
export class FermentationDayDatumController extends FermentationDayDatumControllerBase {
  constructor(
    protected readonly service: FermentationDayDatumService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
