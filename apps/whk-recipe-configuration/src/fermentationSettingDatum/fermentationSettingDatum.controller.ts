import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { FermentationSettingDatumService } from "./fermentationSettingDatum.service";
import { FermentationSettingDatumControllerBase } from "./base/fermentationSettingDatum.controller.base";

@swagger.ApiTags("fermentationSettingData")
@common.Controller("fermentationSettingData")
export class FermentationSettingDatumController extends FermentationSettingDatumControllerBase {
  constructor(
    protected readonly service: FermentationSettingDatumService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
