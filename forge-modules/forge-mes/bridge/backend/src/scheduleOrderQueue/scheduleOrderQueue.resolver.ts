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
import { ScheduleOrderQueueResolverBase } from "./base/scheduleOrderQueue.resolver.base";
import { ScheduleOrderQueue } from "./base/ScheduleOrderQueue";
import { ScheduleOrderQueueService } from "./scheduleOrderQueue.service";
import { CreateAndQueueScheduleOrderInput } from "./CreateAndQueueScheduleOrderInput";
import { ScheduleOrderQueueWhereUniqueInput } from "./base/ScheduleOrderQueueWhereUniqueInput";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => ScheduleOrderQueue)
export class ScheduleOrderQueueResolver extends ScheduleOrderQueueResolverBase {
  constructor(
    protected readonly service: ScheduleOrderQueueService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }

  @graphql.Mutation(() => ScheduleOrderQueue)
  @UseRoles({
    resource: "ScheduleOrderQueue",
    action: "create",
    possession: "any",
  })
  async createAndQueueScheduleOrder(
    @graphql.Args("data") data: CreateAndQueueScheduleOrderInput
  ): Promise<ScheduleOrderQueue> {
    try {
      return await this.service.createAndQueueScheduleOrder(
        data.productionOrderId,
        data.createdBy,
        data.startDate,
        data.endDate
      );
    } catch (error) {
      throw new Error(
        `Failed to create and queue schedule order: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  @graphql.Mutation(() => ScheduleOrderQueue)
  @UseRoles({
    resource: "ScheduleOrderQueue",
    action: "update",
    possession: "any",
  })
  async completeScheduleOrderQueue(
    @graphql.Args("where") where: ScheduleOrderQueueWhereUniqueInput
  ): Promise<ScheduleOrderQueue> {
    try {
      return await this.service.completeScheduleOrderQueue({
        where,
        data: {}, // Empty data object since the method only uses where clause
      });
    } catch (error) {
      throw new Error(
        `Failed to complete schedule order queue: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  @graphql.Mutation(() => Boolean)
  @UseRoles({
    resource: "ScheduleOrderQueue",
    action: "update",
    possession: "any",
  })
  async handlePosition1QueueItems(): Promise<boolean> {
    try {
      await this.service.handlePosition1QueueItems();
      return true;
    } catch (error) {
      throw new Error(
        `Failed to handle position 1 queue items: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  @graphql.Mutation(() => Boolean)
  @UseRoles({
    resource: "ScheduleOrderQueue",
    action: "update",
    possession: "any",
  })
  async monitorQueuePositions(): Promise<boolean> {
    try {
      await this.service.monitorQueuePositions();
      return true;
    } catch (error) {
      throw new Error(
        `Failed to monitor queue positions: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
