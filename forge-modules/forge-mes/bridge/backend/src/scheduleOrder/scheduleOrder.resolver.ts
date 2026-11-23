import * as graphql from "@nestjs/graphql";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { AclFilterResponseInterceptor } from "../interceptors/aclFilterResponse.interceptor";
import { ScheduleOrderResolverBase } from "./base/scheduleOrder.resolver.base";
import { ScheduleOrder } from "./base/ScheduleOrder";
import { ScheduleOrderService } from "./scheduleOrder.service";
import { ScheduleOrderGroupingService } from "./schedule-order-grouping.service";
import { CreateScheduleOrderInput } from "./CreateScheduleOrderInput";
import { UpdateScheduleOrderLoadsInput } from "./UpdateScheduleOrderLoadsInput";
import { PrismaService } from "../prisma/prisma.service";
import { SORecipeInstanceWithComponentsType } from "../scheduleOrderRecipeInstance/dto/schedule-order-recipe-instance.types";
import {
  RecordCookCompleteInput,
  CookCompleteResponse,
  RecordRecipeLoadedInput,
  RecipeLoadedResponse,
  AdvanceScheduleOrderQueueInput,
  AdvanceQueueResponse,
} from "./dto/cook-complete.input";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => ScheduleOrder)
export class ScheduleOrderResolver extends ScheduleOrderResolverBase {
  constructor(
    protected readonly service: ScheduleOrderService,
    protected readonly groupingService: ScheduleOrderGroupingService,
    private readonly prisma: PrismaService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }

  /**
   * Creates a ScheduleOrder from multiple ProductionOrders.
   * This is the "grouping" operation that creates a production run.
   *
   * The service:
   * 1. Validates all ProductionOrders can be grouped (same mash bill)
   * 2. Creates the ScheduleOrder with calculated timing and production estimates
   * 3. Links all ProductionOrders to it
   * 4. Creates ScheduleOrderRecipeInstance atomically
   */
  @graphql.Mutation(() => ScheduleOrder)
  async createScheduleOrderFromProductionOrders(
    @graphql.Args("productionOrderIds", { type: () => [String] })
    productionOrderIds: string[],
    @graphql.Args("data")
    data: CreateScheduleOrderInput
  ): Promise<ScheduleOrder> {
    console.log("createScheduleOrderFromProductionOrders called with:", {
      productionOrderIds,
      data,
    });

    // Derive recipeGroupId from ProductionOrders if not provided
    let recipeGroupId = data.recipeGroupId;

    if (!recipeGroupId && productionOrderIds.length > 0) {
      const firstOrder = await this.prisma.productionOrder.findUnique({
        where: { id: productionOrderIds[0] },
        include: {
          recipe: {
            include: { recipeGroup: true },
          },
        },
      });

      console.log("First production order lookup:", {
        orderId: productionOrderIds[0],
        found: !!firstOrder,
        hasRecipe: !!firstOrder?.recipe,
        hasRecipeGroup: !!firstOrder?.recipe?.recipeGroup,
        recipeGroupId: firstOrder?.recipe?.recipeGroup?.id,
      });

      if (firstOrder?.recipe?.recipeGroup?.id) {
        recipeGroupId = firstOrder.recipe.recipeGroup.id;
      } else {
        throw new common.BadRequestException(
          `Could not determine recipeGroupId from ProductionOrder ${productionOrderIds[0]}. ` +
            `Order found: ${!!firstOrder}, Has recipe: ${!!firstOrder?.recipe}, ` +
            `Has recipeGroup: ${!!firstOrder?.recipe?.recipeGroup}`
        );
      }
    }

    if (!recipeGroupId) {
      throw new common.BadRequestException("recipeGroupId is required");
    }

    console.log("Creating schedule order with recipeGroupId:", recipeGroupId);

    const result =
      await this.groupingService.createScheduleOrderFromProductionOrders({
        productionOrderIds,
        recipeGroupId,
        scheduleName: data.name,
        estimatedStart: new Date(data.estimatedStart),
        estimatedEnd: new Date(data.estimatedEnd),
      });

    console.log("Schedule order created:", result.id);

    // Add to schedule order queue after creation
    await this.service.createScheduleOrderQueue(result.id);

    console.log("Schedule order added to queue");

    // Fetch the complete schedule order with all relations for the response
    const completeScheduleOrder = await this.prisma.scheduleOrder.findUnique({
      where: { id: result.id },
      include: {
        productionOrders: {
          include: {
            customer: true,
          },
        },
        scheduleOrderQueues: true,
        recipeGroup: true,
        scheduleOrderRecipe: true,
        customers: true,
      },
    });

    console.log("Returning complete schedule order");

    return completeScheduleOrder as unknown as ScheduleOrder;
  }

  /**
   * Deschedule and delete a Schedule Order from the queue.
   * - Validates queue index > 0 (prevents deletion of currently running order)
   * - Unlinks ProductionOrders and marks them available for rescheduling
   * - Deletes ScheduleOrderRecipeInstance if exists
   * - Resequences queue indices
   */
  @graphql.Mutation(() => ScheduleOrder)
  @UseRoles({
    resource: "ScheduleOrder",
    action: "delete",
    possession: "any",
  })
  async descheduleScheduleOrder(
    @graphql.Args("scheduleOrderId", { type: () => String })
    scheduleOrderId: string,
    @graphql.Args("userId", { type: () => String })
    userId: string
  ): Promise<ScheduleOrder> {
    return this.service.descheduleScheduleOrder(scheduleOrderId, userId);
  }

  /**
   * Update grain and water loads for a schedule order
   * Triggers automatic BOM quantity recalculation
   */
  @graphql.Mutation(() => ScheduleOrder)
  @UseRoles({
    resource: "ScheduleOrder",
    action: "update",
    possession: "any",
  })
  async updateScheduleOrderLoads(
    @graphql.Args("scheduleOrderId", { type: () => String })
    scheduleOrderId: string,
    @graphql.Args("data", { type: () => UpdateScheduleOrderLoadsInput })
    data: UpdateScheduleOrderLoadsInput,
    @graphql.Args("userId", { type: () => String })
    userId: string
  ): Promise<ScheduleOrder> {
    return this.service.updateLoads(scheduleOrderId, data, userId);
  }

  /**
   * Record a cook completion from Ignition/PLC
   * Called when the PLC signals that a cook has completed.
   * Increments executedCooks and creates an audit record.
   */
  @graphql.Mutation(() => CookCompleteResponse)
  @UseRoles({
    resource: "ScheduleOrder",
    action: "update",
    possession: "any",
  })
  async recordCookComplete(
    @graphql.Args("data", { type: () => RecordCookCompleteInput })
    data: RecordCookCompleteInput
  ): Promise<CookCompleteResponse> {
    return this.service.recordCookComplete(data);
  }

  /**
   * Record that a recipe was loaded to the PLC
   * Called by Ignition after successfully writing recipe data to PLC tags.
   * Creates an audit record and captures updatedAt for change detection.
   */
  @graphql.Mutation(() => RecipeLoadedResponse)
  @UseRoles({
    resource: "ScheduleOrder",
    action: "update",
    possession: "any",
  })
  async recordRecipeLoadedToPLC(
    @graphql.Args("data", { type: () => RecordRecipeLoadedInput })
    data: RecordRecipeLoadedInput
  ): Promise<RecipeLoadedResponse> {
    return this.service.recordRecipeLoadedToPLC(data);
  }

  /**
   * Advance the schedule order queue (changeover)
   * Called by Ignition when all cooks complete and changeover is needed.
   * Marks the current SO as complete and shifts the queue.
   */
  @graphql.Mutation(() => AdvanceQueueResponse)
  @UseRoles({
    resource: "ScheduleOrder",
    action: "update",
    possession: "any",
  })
  async advanceScheduleOrderQueue(
    @graphql.Args("data", { type: () => AdvanceScheduleOrderQueueInput })
    data: AdvanceScheduleOrderQueueInput
  ): Promise<AdvanceQueueResponse> {
    return this.service.advanceScheduleOrderQueue(data);
  }

  /**
   * Field resolver for scheduleOrderRecipeInstance
   * Returns the SO-level recipe instance with all components (BOM, Parameters, MashingProtocol)
   */
  @common.UseInterceptors(AclFilterResponseInterceptor)
  @graphql.ResolveField(() => SORecipeInstanceWithComponentsType, {
    nullable: true,
    name: "scheduleOrderRecipeInstance",
  })
  @UseRoles({
    resource: "ScheduleOrder",
    action: "read",
    possession: "any",
  })
  async getScheduleOrderRecipeInstance(
    @graphql.Parent() parent: ScheduleOrder
  ): Promise<SORecipeInstanceWithComponentsType | null> {
    const instance = await this.prisma.scheduleOrderRecipeInstance.findFirst({
      where: { scheduleOrderId: parent.id },
      include: {
        scheduleOrder: {
          select: {
            id: true,
            status: true,
            name: true,
          },
        },
        recipe: {
          select: {
            id: true,
            Recipe: true,
            revision: true,
          },
        },
        recipeBoms: {
          include: {
            recipeBomITem: {
              include: {
                item: true,
                displayUnits: true,
              },
              orderBy: { quantity: "desc" },
            },
          },
        },
        mashingProtocols: {
          include: {
            steps: {
              include: {
                recipeBomItem: {
                  include: {
                    item: true,
                    displayUnits: true,
                  },
                },
              },
              orderBy: { index: "asc" },
            },
          },
        },
        recipeParameters: {
          include: {
            units: true,
          },
        },
      },
    });

    if (!instance) {
      return null;
    }

    // Map to GraphQL type
    return {
      id: instance.id,
      status: instance.status,
      updatedAt: instance.updatedAt,
      createdAt: instance.createdAt,
      scheduleOrder: instance.scheduleOrder
        ? {
            id: instance.scheduleOrder.id,
            status: instance.scheduleOrder.status ?? undefined,
            name: instance.scheduleOrder.name ?? undefined,
            scheduleOrderNumber: instance.scheduleOrder.name ?? undefined,
          }
        : undefined,
      recipe: instance.recipe
        ? {
            id: instance.recipe.id,
            name: instance.recipe.Recipe ?? undefined,
            revision: instance.recipe.revision ?? undefined,
          }
        : undefined,
      recipeBoms: (instance.recipeBoms || []).map((bom) => ({
        id: bom.id,
        recipeBomITem: (bom.recipeBomITem || []).map((item) => ({
          id: item.id,
          quantity: item.quantity ?? undefined,
          item: item.item
            ? {
                id: item.item.id,
                itemName: item.item.itemName ?? undefined,
                itemCode: undefined,
                itemNumber: item.item.itemNumber ?? undefined,
              }
            : undefined,
          displayUnits: item.displayUnits
            ? {
                id: item.displayUnits.id,
                name: item.displayUnits.name ?? undefined,
                abbreviation: item.displayUnits.abbreviation ?? undefined,
              }
            : undefined,
        })),
      })),
      recipeParameters: (instance.recipeParameters || []).map((param) => ({
        id: param.id,
        recipeParamName: param.recipeParamName ?? undefined,
        recipeParamDescription: param.recipeParamDescription ?? undefined,
        recipeSetpointType: param.recipeSetpointType ?? undefined,
        recipeNumericalSetpoint: param.recipeNumericalSetpoint ?? undefined,
        recipeSetpointBooleanValue:
          param.recipeSetpointBooleanValue ?? undefined,
        recipeSetpointUpperLimit: param.recipeSetpointUpperLimit ?? undefined,
        recipeSetpointLowerLimit: param.recipeSetpointLowerLimit ?? undefined,
        parameterCategory: param.parameterCategory ?? undefined,
        units: param.units
          ? {
              id: param.units.id,
              name: param.units.name ?? undefined,
              abbreviation: param.units.abbreviation ?? undefined,
            }
          : undefined,
      })),
      mashingProtocols: (instance.mashingProtocols || []).map((protocol) => ({
        id: protocol.id,
        name: protocol.name ?? undefined,
        steps: (protocol.steps || []).map((step) => ({
          id: step.id,
          index: step.index ?? undefined,
          stepType: step.stepType ?? undefined,
          holdType: step.holdType ?? undefined,
          stepTime: step.stepTime ?? undefined,
          temperatureSetpoint: step.temperatureSetpoint ?? undefined,
          heatEnabled: step.heatEnabled ?? undefined,
          heatTempSp: step.heatTempSp ?? undefined,
          coolEnabled: step.coolEnabled ?? undefined,
          coolTempSp: step.coolTempSp ?? undefined,
          agitatorEnabled: step.agitatorEnabled ?? undefined,
          agitatorSpdSp: step.agitatorSpdSp ?? undefined,
          promptMessage: step.promptMessage ?? undefined,
          recipeBomItem: (step.recipeBomItem || []).map((item) => ({
            id: item.id,
            quantity: item.quantity ?? undefined,
            item: item.item
              ? {
                  id: item.item.id,
                  itemName: item.item.itemName ?? undefined,
                  itemCode: undefined,
                  itemNumber: item.item.itemNumber ?? undefined,
                }
              : undefined,
            displayUnits: item.displayUnits
              ? {
                  id: item.displayUnits.id,
                  name: item.displayUnits.name ?? undefined,
                  abbreviation: item.displayUnits.abbreviation ?? undefined,
                }
              : undefined,
          })),
        })),
      })),
    };
  }
}
