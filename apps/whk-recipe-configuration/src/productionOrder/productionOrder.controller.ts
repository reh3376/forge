import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { ProductionOrderService } from "./productionOrder.service";
import { ProductionOrderControllerBase } from "./base/productionOrder.controller.base";
import { CreateProductionOrderWithScheduleDto } from "./dto/create-production-order-with-schedule.dto";
import { CreateProductionOrderWizardDto } from "./dto/create-production-order-wizard.dto";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ProductionOrder } from "./base/ProductionOrder";

@swagger.ApiTags("productionOrders")
@common.Controller("productionOrders")
export class ProductionOrderController extends ProductionOrderControllerBase {
  constructor(
    protected readonly service: ProductionOrderService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }

  @common.Post("createWithSchedule")
  @ApiOperation({
    summary: "Create a production order with schedule order and add to queue",
  })
  @ApiResponse({
    status: 201,
    description:
      "Production order, schedule order, and queue created successfully",
  })
  @UseRoles({
    resource: "ProductionOrder",
    action: "create",
    possession: "any",
  })
  async createWithSchedule(
    @common.Body() data: CreateProductionOrderWithScheduleDto
  ) {
    return this.service.createProductionOrderWithSchedule(data);
  }

  @common.Post("/createFromWizard")
  @swagger.ApiOperation({
    summary: "Create production order from wizard data",
    description:
      "Creates a production order with complex payload structure from frontend wizard",
  })
  @swagger.ApiResponse({
    status: 201,
    description: "Production order created successfully",
    type: ProductionOrder,
  })
  @UseRoles({
    resource: "ProductionOrder",
    action: "create",
    possession: "any",
  })
  async createFromWizard(
    @common.Body()
    createProductionOrderWizardDto: CreateProductionOrderWizardDto
  ): Promise<ProductionOrder> {
    return this.service.createProductionOrderFromWizardDto(
      createProductionOrderWizardDto
    );
  }
}
