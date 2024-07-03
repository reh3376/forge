import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { FermentationDayDatumService } from "./fermentationDayDatum.service";
import { FermentationDayDatumControllerBase } from "./base/fermentationDayDatum.controller.base";

@swagger.ApiTags("fermentationDayData")
@common.Controller("fermentationDayData")
export class FermentationDayDatumController extends FermentationDayDatumControllerBase {
  constructor(
    protected readonly service: FermentationDayDatumService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
