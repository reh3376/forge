import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { ProductionOrderRecipeInstanceService } from "./productionOrderRecipeInstance.service";
import { ProductionOrderRecipeInstanceControllerBase } from "./base/productionOrderRecipeInstance.controller.base";

@swagger.ApiTags("productionOrderRecipeInstances")
@common.Controller("productionOrderRecipeInstances")
export class ProductionOrderRecipeInstanceController extends ProductionOrderRecipeInstanceControllerBase {
  constructor(
    protected readonly service: ProductionOrderRecipeInstanceService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }

  @common.Post("create-from-schedule-queue/:scheduleOrderQueueId")
  @swagger.ApiOperation({
    summary: "Create production order recipe instance from schedule queue",
    description:
      "Creates a production order recipe instance when a schedule order queue becomes active at mashing (index = 0). This also creates instances of recipe parameters, recipe BOMs, and mashing protocols linked to the production order recipe instance.",
  })
  @swagger.ApiParam({
    name: "scheduleOrderQueueId",
    type: "string",
    description:
      "Schedule order queue ID that is active at mashing (index = 0)",
  })
  @swagger.ApiBody({
    schema: {
      type: "object",
      properties: {
        createdBy: {
          type: "string",
          description: "Username of the user creating the instance",
        },
      },
      required: ["createdBy"],
    },
  })
  @swagger.ApiCreatedResponse({
    description:
      "Production order recipe instance created successfully with all related instances",
  })
  @swagger.ApiBadRequestResponse({
    description:
      "Schedule order queue not found or not at index 0 (active at mashing)",
  })
  @UseRoles({
    resource: "ProductionOrderRecipeInstance",
    action: "create",
    possession: "any",
  })
  async createFromScheduleQueue(
    @common.Param("scheduleOrderQueueId") scheduleOrderQueueId: string,
    @common.Body() body: { createdBy: string }
  ) {
    return this.service.createProductionOrderRecipeInstanceFromScheduleQueue(
      scheduleOrderQueueId,
      body.createdBy
    );
  }
}
