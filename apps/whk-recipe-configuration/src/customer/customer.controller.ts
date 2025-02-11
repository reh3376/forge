import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import { ACGuard, InjectRolesBuilder, RolesBuilder, UseRoles } from "nest-access-control";
import { CustomerService } from "./customer.service";
import { CustomerControllerBase } from "./base/customer.controller.base";

@swagger.ApiTags("customers")
@common.Controller("customers")
export class CustomerController extends CustomerControllerBase {
  constructor(
    protected readonly service: CustomerService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
