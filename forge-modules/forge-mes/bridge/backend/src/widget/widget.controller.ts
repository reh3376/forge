import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { WidgetService } from "./widget.service";
import { WidgetControllerBase } from "./base/widget.controller.base";

@swagger.ApiTags("widgets")
@common.Controller("widgets")
export class WidgetController extends WidgetControllerBase {
  constructor(
    protected readonly service: WidgetService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
