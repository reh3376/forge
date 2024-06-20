import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { FermentationChemistryService } from "./fermentationChemistry.service";
import { FermentationChemistryControllerBase } from "./base/fermentationChemistry.controller.base";

@swagger.ApiTags("fermentationChemistries")
@common.Controller("fermentationChemistries")
export class FermentationChemistryController extends FermentationChemistryControllerBase {
  constructor(
    protected readonly service: FermentationChemistryService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
