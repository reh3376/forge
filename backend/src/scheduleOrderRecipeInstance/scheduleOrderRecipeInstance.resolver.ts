import { Resolver, Query, Mutation, Args, ID, Int } from "@nestjs/graphql";
import { UseGuards } from "@nestjs/common";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import { ScheduleOrderRecipeInstanceService } from "./scheduleOrderRecipeInstance.service";
import {
  ScheduleOrderRecipeInstanceType,
  ActualsSummaryType,
  EnumProductionPhase,
  SORecipeInstanceWithComponentsType,
  UpdateSORecipeComponentsInput,
  ComponentChangeHistoryEntryType,
} from "./dto/schedule-order-recipe-instance.types";

@Resolver(() => ScheduleOrderRecipeInstanceType)
@UseGuards(GqlDefaultAuthGuard)
export class ScheduleOrderRecipeInstanceResolver {
  constructor(private readonly service: ScheduleOrderRecipeInstanceService) {}

  @Mutation(() => ScheduleOrderRecipeInstanceType, {
    name: "createScheduleOrderRecipeInstance",
  })
  async createScheduleOrderRecipeInstance(
    @Args("scheduleOrderId") scheduleOrderId: string,
    @Args("createdBy", { nullable: true }) createdBy?: string
  ): Promise<ScheduleOrderRecipeInstanceType> {
    const instance = await this.service.createFromScheduleOrder(
      scheduleOrderId,
      createdBy || "system"
    );
    return this.mapToType(instance);
  }

  @Query(() => ScheduleOrderRecipeInstanceType, {
    name: "scheduleOrderRecipeInstance",
    nullable: true,
  })
  async scheduleOrderRecipeInstance(
    @Args("id", { type: () => ID }) id: string
  ): Promise<ScheduleOrderRecipeInstanceType | null> {
    const instance = await this.service.findByScheduleOrderId(id);
    if (!instance) {
      // Try by instance ID
      const byId = await this.service.getWithActuals(id);
      return byId ? this.mapToType(byId) : null;
    }
    return this.mapToType(instance);
  }

  @Query(() => ScheduleOrderRecipeInstanceType, {
    name: "scheduleOrderRecipeInstanceByScheduleOrder",
    nullable: true,
  })
  async scheduleOrderRecipeInstanceByScheduleOrder(
    @Args("scheduleOrderId") scheduleOrderId: string
  ): Promise<ScheduleOrderRecipeInstanceType | null> {
    const instance = await this.service.findByScheduleOrderId(scheduleOrderId);
    return instance ? this.mapToType(instance) : null;
  }

  @Query(() => ActualsSummaryType, { name: "actualsSummary", nullable: true })
  async actualsSummary(
    @Args("instanceId") instanceId: string
  ): Promise<ActualsSummaryType | null> {
    try {
      const summary = await this.service.getActualsSummary(instanceId);
      return {
        bomActuals: summary.bomActuals.map((b) => ({
          itemId: b.itemId ?? undefined,
          itemName: b.itemName,
          totalQuantityPlanned: b.totalQuantityPlanned,
          totalQuantityActual: b.totalQuantityActual,
          lots: b.lots,
        })),
        parameterActuals: summary.parameterActuals.map((p) => ({
          parameterName: p.parameterName,
          category: p.category ?? undefined,
          valuePlanned: p.valuePlanned ?? undefined,
          valueActual: p.valueActual ?? undefined,
        })),
        yields: {
          totalWineGallons: summary.yields.totalWineGallons,
          totalProofGallons: summary.yields.totalProofGallons,
        },
      };
    } catch {
      return null;
    }
  }

  @Mutation(() => ScheduleOrderRecipeInstanceType, {
    name: "transitionScheduleOrderRecipeInstancePhase",
  })
  async transitionPhase(
    @Args("instanceId") instanceId: string,
    @Args("phase", { type: () => String }) phase: string
  ): Promise<ScheduleOrderRecipeInstanceType> {
    const phaseEnum = phase as EnumProductionPhase;
    const instance = await this.service.transitionToPhase(
      instanceId,
      phaseEnum
    );
    return this.mapToType(instance);
  }

  @Mutation(() => ScheduleOrderRecipeInstanceType, {
    name: "markScheduleOrderRecipeInstanceCompleted",
  })
  async markCompleted(
    @Args("instanceId") instanceId: string
  ): Promise<ScheduleOrderRecipeInstanceType> {
    const instance = await this.service.markCompleted(instanceId);
    return this.mapToType(instance);
  }

  /**
   * Get SO recipe instance with all editable components (BOM, Parameters, MashingProtocol)
   * Used for the recipe editing modal
   */
  @Query(() => SORecipeInstanceWithComponentsType, {
    name: "scheduleOrderRecipeInstanceWithComponents",
    nullable: true,
  })
  async scheduleOrderRecipeInstanceWithComponents(
    @Args("scheduleOrderId") scheduleOrderId: string
  ): Promise<SORecipeInstanceWithComponentsType | null> {
    const instance = await this.service.getWithAllComponents(scheduleOrderId);
    if (!instance) {
      return null;
    }
    return this.mapToComponentsType(instance);
  }

  /**
   * Get change history for a schedule order's recipe instance components
   * Returns audit logs showing who changed what, when, with field-level detail
   */
  @Query(() => [ComponentChangeHistoryEntryType], {
    name: "scheduleOrderRecipeChangeHistory",
  })
  async scheduleOrderRecipeChangeHistory(
    @Args("scheduleOrderId") scheduleOrderId: string,
    @Args("limit", { type: () => Int, nullable: true }) limit?: number
  ): Promise<ComponentChangeHistoryEntryType[]> {
    const history = await this.service.getComponentChangeHistory(
      scheduleOrderId,
      { limit }
    );
    return history.map((entry) => ({
      id: entry.id,
      timestamp: entry.timestamp,
      userId: entry.userId,
      user: entry.user
        ? {
            username: entry.user.username,
            firstName: entry.user.firstName ?? undefined,
            lastName: entry.user.lastName ?? undefined,
          }
        : undefined,
      changesSummary: {
        bomItemsModified: entry.changesSummary.bomItemsModified,
        parametersModified: entry.changesSummary.parametersModified,
        mashingStepsModified: entry.changesSummary.mashingStepsModified,
      },
      changes: {
        bomItems: entry.changes.bomItems.map((item) => ({
          id: item.id,
          itemName: item.itemName,
          changes: item.changes,
        })),
        parameters: entry.changes.parameters.map((param) => ({
          id: param.id,
          parameterName: param.parameterName,
          changes: param.changes,
        })),
        mashingSteps: entry.changes.mashingSteps.map((step) => ({
          id: step.id,
          stepIndex: step.stepIndex ?? undefined,
          stepType: step.stepType ?? undefined,
          changes: step.changes,
        })),
      },
    }));
  }

  /**
   * Update SO-level recipe components (BOM items, parameters, mashing steps)
   */
  @Mutation(() => SORecipeInstanceWithComponentsType, {
    name: "updateScheduleOrderRecipeInstanceComponents",
  })
  async updateScheduleOrderRecipeInstanceComponents(
    @Args("instanceId") instanceId: string,
    @Args("input") input: UpdateSORecipeComponentsInput,
    @Args("updatedBy", { nullable: true }) updatedBy?: string
  ): Promise<SORecipeInstanceWithComponentsType> {
    const instance = await this.service.updateComponents(
      instanceId,
      {
        bomItems: input.bomItems?.map((item) => ({
          id: item.id,
          quantity: item.quantity ?? undefined,
        })),
        parameters: input.parameters?.map((param) => ({
          id: param.id,
          recipeNumericalSetpoint: param.recipeNumericalSetpoint ?? undefined,
          recipeSetpointBooleanValue:
            param.recipeSetpointBooleanValue ?? undefined,
          recipeSetpointUpperLimit: param.recipeSetpointUpperLimit ?? undefined,
          recipeSetpointLowerLimit: param.recipeSetpointLowerLimit ?? undefined,
        })),
        mashingSteps: input.mashingSteps?.map((step) => ({
          id: step.id,
          index: step.index ?? undefined,
          stepTime: step.stepTime ?? undefined,
          temperatureSetpoint: step.temperatureSetpoint ?? undefined,
          heatEnabled: step.heatEnabled ?? undefined,
          heatTempSp: step.heatTempSp ?? undefined,
          coolEnabled: step.coolEnabled ?? undefined,
          coolTempSp: step.coolTempSp ?? undefined,
          agitatorEnabled: step.agitatorEnabled ?? undefined,
          agitatorSpdSp: step.agitatorSpdSp ?? undefined,
          promptMessage: step.promptMessage ?? undefined,
        })),
      },
      updatedBy || "system"
    );

    // Fetch the full instance with components for return
    const fullInstance = await this.service.getWithAllComponents(
      instance.scheduleOrderId
    );
    return this.mapToComponentsType(fullInstance!);
  }

  private mapToType(instance: any): ScheduleOrderRecipeInstanceType {
    return {
      id: instance.id,
      scheduleOrderId: instance.scheduleOrderId,
      recipeId: instance.recipeId,
      status: instance.status,
      currentPhase: instance.currentPhase,
      separationStarted: instance.separationStarted,
      separationCompletedAt: instance.separationCompletedAt,
      createdBy: instance.createdBy,
      createdAt: instance.createdAt,
      updatedAt: instance.updatedAt,
    };
  }

  private mapToComponentsType(
    instance: any
  ): SORecipeInstanceWithComponentsType {
    return {
      id: instance.id,
      status: instance.status,
      scheduleOrder: instance.scheduleOrder
        ? {
            id: instance.scheduleOrder.id,
            status: instance.scheduleOrder.status,
            scheduleOrderNumber: instance.scheduleOrder.name, // ScheduleOrder.name maps to scheduleOrderNumber in UI
          }
        : undefined,
      recipe: instance.recipe
        ? {
            id: instance.recipe.id,
            name: instance.recipe.Recipe, // Recipe.Recipe is the name field
            revision: instance.recipe.revision,
          }
        : undefined,
      recipeBoms: (instance.recipeBoms || []).map((bom: any) => ({
        id: bom.id,
        recipeBomITem: (bom.recipeBomITem || []).map((item: any) => ({
          id: item.id,
          quantity: item.quantity,
          item: item.item
            ? {
                id: item.item.id,
                itemName: item.item.itemName,
                itemCode: item.item.itemCode,
                itemNumber: item.item.itemNumber,
              }
            : undefined,
          displayUnits: item.displayUnits
            ? {
                id: item.displayUnits.id,
                name: item.displayUnits.name,
                abbreviation: item.displayUnits.abbreviation,
              }
            : undefined,
        })),
      })),
      recipeParameters: (instance.recipeParameters || []).map((param: any) => ({
        id: param.id,
        recipeParamName: param.recipeParamName,
        recipeParamDescription: param.recipeParamDescription,
        recipeSetpointType: param.recipeSetpointType,
        recipeNumericalSetpoint: param.recipeNumericalSetpoint,
        recipeSetpointBooleanValue: param.recipeSetpointBooleanValue,
        recipeSetpointUpperLimit: param.recipeSetpointUpperLimit,
        recipeSetpointLowerLimit: param.recipeSetpointLowerLimit,
        parameterCategory: param.parameterCategory,
        units: param.units
          ? {
              id: param.units.id,
              name: param.units.name,
              abbreviation: param.units.abbreviation,
            }
          : undefined,
      })),
      mashingProtocols: (instance.mashingProtocols || []).map(
        (protocol: any) => ({
          id: protocol.id,
          name: protocol.name,
          steps: (protocol.steps || []).map((step: any) => ({
            id: step.id,
            index: step.index,
            stepType: step.stepType,
            holdType: step.holdType,
            stepTime: step.stepTime,
            temperatureSetpoint: step.temperatureSetpoint,
            heatEnabled: step.heatEnabled,
            heatTempSp: step.heatTempSp,
            coolEnabled: step.coolEnabled,
            coolTempSp: step.coolTempSp,
            agitatorEnabled: step.agitatorEnabled,
            agitatorSpdSp: step.agitatorSpdSp,
            promptMessage: step.promptMessage,
            recipeBomItem: (step.recipeBomItem || []).map((item: any) => ({
              id: item.id,
              quantity: item.quantity,
              item: item.item
                ? {
                    id: item.item.id,
                    itemName: item.item.itemName,
                    itemCode: item.item.itemCode,
                    itemNumber: item.item.itemNumber,
                  }
                : undefined,
              displayUnits: item.displayUnits
                ? {
                    id: item.displayUnits.id,
                    name: item.displayUnits.name,
                    abbreviation: item.displayUnits.abbreviation,
                  }
                : undefined,
            })),
          })),
        })
      ),
    };
  }
}
