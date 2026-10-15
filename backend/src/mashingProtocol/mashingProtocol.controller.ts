import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { MashingProtocolService } from "./mashingProtocol.service";
import { MashingProtocolControllerBase } from "./base/mashingProtocol.controller.base";

@swagger.ApiTags("mashingProtocols")
@common.Controller("mashingProtocols")
export class MashingProtocolController extends MashingProtocolControllerBase {
  constructor(
    protected readonly service: MashingProtocolService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }

  // Add new endpoint for fetching templates
  @common.Get("/templates")
  @UseRoles({
    resource: "MashingProtocol",
    action: "read",
    possession: "any",
  })
  async getTemplates() {
    return this.service.findTemplates();
  }

  // Add endpoint for cloning a template
  @common.Post("/clone-template/:id")
  @UseRoles({
    resource: "MashingProtocol",
    action: "create",
    possession: "any",
  })
  async cloneTemplate(
    @common.Param("id") id: string,
    @common.Body() data: { name: string; createdBy: string }
  ) {
    return this.service.cloneTemplate(id, data.name, data.createdBy);
  }
}
