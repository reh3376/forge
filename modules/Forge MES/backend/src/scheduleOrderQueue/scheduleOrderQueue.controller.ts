import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import * as errors from "../errors";
import { AclValidateRequestInterceptor } from "../interceptors/aclValidateRequest.interceptor";
import { ScheduleOrderQueueService } from "./scheduleOrderQueue.service";
import { ScheduleOrderQueueControllerBase } from "./base/scheduleOrderQueue.controller.base";
import { ScheduleOrderQueueCreateInput } from "./base/ScheduleOrderQueueCreateInput";
import { ScheduleOrderQueue } from "./base/ScheduleOrderQueue";
import { isRecordNotFoundError } from "../prisma.util";
import { ScheduleOrderQueueWhereUniqueInput } from "./base/ScheduleOrderQueueWhereUniqueInput";
import { ScheduleOrderQueueUpdateInput } from "./base/ScheduleOrderQueueUpdateInput";
import { CreateAndQueueScheduleOrderDto } from "./CreateAndQueueScheduleOrderDto";
import { Request } from "express";
import { ScheduleOrderService } from "../scheduleOrder/scheduleOrder.service";
import { ScheduleOrder } from "../scheduleOrder/base/ScheduleOrder";

@swagger.ApiTags("scheduleOrderQueues")
@common.Controller("scheduleOrderQueues")
export class ScheduleOrderQueueController extends ScheduleOrderQueueControllerBase {
  constructor(
    protected readonly service: ScheduleOrderQueueService,
    private readonly scheduleOrderService: ScheduleOrderService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }

  @common.UseInterceptors(AclValidateRequestInterceptor)
  @common.Post("/add-to-pending-schedule-order-queue")
  @swagger.ApiOperation({ summary: "Add SO to pending schedule order queue" })
  @swagger.ApiCreatedResponse({ type: ScheduleOrderQueue })
  @UseRoles({
    resource: "ScheduleOrderQueue",
    action: "create",
    possession: "any",
  })
  @swagger.ApiForbiddenResponse({
    type: errors.ForbiddenException,
  })
  @swagger.ApiBody({
    type: ScheduleOrderQueueCreateInput,
  })
  async addToPendingScheduleOrderQueue(
    @common.Body() data: ScheduleOrderQueueCreateInput
  ): Promise<ScheduleOrderQueue> {
    return await this.service.addToPendingScheduleOrderQueue({
      data: {
        ...data,

        areas: data.areas
          ? {
              connect: data.areas.connect,
            }
          : undefined,

        scheduleOrder: data.scheduleOrder
          ? {
              connect: data.scheduleOrder,
            }
          : undefined,
      },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        createdBy: true,
        updatedBy: true,
        schemaVersion: true,
        queueIndex: true,
        globalId: true,

        areas: {
          select: {
            id: true,
          },
        },

        scheduleOrder: {
          select: {
            id: true,
          },
        },
      },
    });
  }

  @common.UseInterceptors(AclValidateRequestInterceptor)
  @common.Patch("/:id/update-schedule-order-queue-unit-procedure")
  @swagger.ApiOkResponse({ type: ScheduleOrderQueue })
  @swagger.ApiNotFoundResponse({ type: errors.NotFoundException })
  @UseRoles({
    resource: "ScheduleOrderQueue",
    action: "update",
    possession: "any",
  })
  @swagger.ApiForbiddenResponse({
    type: errors.ForbiddenException,
  })
  @swagger.ApiBody({
    type: ScheduleOrderQueueUpdateInput,
  })
  async updateScheduleOrderQueueUnitProcedure(
    @common.Param() params: ScheduleOrderQueueWhereUniqueInput,
    @common.Body() data: ScheduleOrderQueueUpdateInput
  ): Promise<ScheduleOrderQueue | null> {
    try {
      return await this.service.updateScheduleOrderQueueUnitProcedure({
        where: params,
        data: {
          ...data,

          areas: data.areas
            ? {
                connect: data.areas.connect,
              }
            : undefined,

          scheduleOrder: data.scheduleOrder
            ? {
                connect: data.scheduleOrder,
              }
            : undefined,
        },
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          createdBy: true,
          updatedBy: true,
          schemaVersion: true,
          queueIndex: true,
          globalId: true,

          areas: {
            select: {
              id: true,
            },
          },

          scheduleOrder: {
            select: {
              id: true,
            },
          },
        },
      });
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new errors.NotFoundException(
          `No resource was found for ${JSON.stringify(params)}`
        );
      }
      throw error;
    }
  }

  @common.UseInterceptors(AclValidateRequestInterceptor)
  @common.Patch("/activate-next-schedule-order-queue/:id")
  @swagger.ApiOkResponse({ type: ScheduleOrderQueue })
  @swagger.ApiNotFoundResponse({ type: errors.NotFoundException })
  @UseRoles({
    resource: "ScheduleOrderQueue",
    action: "update",
    possession: "any",
  })
  @swagger.ApiForbiddenResponse({
    type: errors.ForbiddenException,
  })
  @swagger.ApiBody({
    type: ScheduleOrderQueueUpdateInput,
  })
  async activateNextScheduleOrderQueue(
    @common.Param() params: ScheduleOrderQueueWhereUniqueInput,
    @common.Body() data: ScheduleOrderQueueUpdateInput
  ): Promise<ScheduleOrderQueue | null> {
    try {
      return await this.service.setActiveScheduleOrderQueue({
        where: params,
        data: {
          ...data,
          areas: data.areas
            ? {
                connect: data.areas.connect,
              }
            : undefined,

          scheduleOrder: data.scheduleOrder
            ? {
                connect: data.scheduleOrder,
              }
            : undefined,
        },
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          createdBy: true,
          updatedBy: true,
          schemaVersion: true,
          queueIndex: true,
          globalId: true,

          areas: {
            select: {
              id: true,
            },
          },

          scheduleOrder: {
            select: {
              id: true,
            },
          },
        },
      });
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new errors.NotFoundException(
          `No resource was found for ${JSON.stringify(params)}`
        );
      }
      throw error;
    }
  }

  @common.UseInterceptors(AclValidateRequestInterceptor)
  @common.Patch("/complete-schedule-order-queue/:id")
  @swagger.ApiOperation({ summary: "Complete schedule order queue item" })
  @swagger.ApiOkResponse({ type: ScheduleOrderQueue })
  @UseRoles({
    resource: "ScheduleOrderQueue",
    action: "update",
    possession: "any",
  })
  @swagger.ApiForbiddenResponse({
    type: errors.ForbiddenException,
  })
  @swagger.ApiNotFoundResponse({ type: errors.NotFoundException })
  async completeScheduleOrderQueue(
    @common.Param() params: ScheduleOrderQueueWhereUniqueInput,
    @common.Body() data: ScheduleOrderQueueUpdateInput
  ): Promise<ScheduleOrderQueue> {
    try {
      return await this.service.completeScheduleOrderQueue({
        where: params,
        data: {
          ...data,
          areas: data.areas
            ? {
                connect: data.areas.connect,
              }
            : undefined,

          scheduleOrder: data.scheduleOrder
            ? {
                connect: data.scheduleOrder,
              }
            : undefined,
        },
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          createdBy: true,
          updatedBy: true,
          schemaVersion: true,
          queueIndex: true,
          globalId: true,

          areas: {
            select: {
              id: true,
            },
          },

          scheduleOrder: {
            select: {
              id: true,
            },
          },
        },
      });
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new errors.NotFoundException(
          `No resource was found for ${JSON.stringify(params)}`
        );
      }
      throw error;
    }
  }

  @common.UseInterceptors(AclValidateRequestInterceptor)
  @common.Patch("/deactivate-schedule-order-queue/:id")
  @swagger.ApiOperation({ summary: "Deactivate schedule order queue item" })
  @swagger.ApiOkResponse({ type: ScheduleOrderQueue })
  @UseRoles({
    resource: "ScheduleOrderQueue",
    action: "update",
    possession: "any",
  })
  @swagger.ApiForbiddenResponse({
    type: errors.ForbiddenException,
  })
  @swagger.ApiNotFoundResponse({ type: errors.NotFoundException })
  async deactivateScheduleOrderQueue(
    @common.Param() params: ScheduleOrderQueueWhereUniqueInput,
    @common.Body() data: ScheduleOrderQueueUpdateInput
  ): Promise<ScheduleOrderQueue> {
    try {
      return await this.service.deactivateScheduleOrderQueue({
        where: params,
        data: {
          ...data,
          areas: data.areas
            ? {
                connect: data.areas.connect,
              }
            : undefined,

          scheduleOrder: data.scheduleOrder
            ? {
                connect: data.scheduleOrder,
              }
            : undefined,
        },
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          createdBy: true,
          updatedBy: true,
          schemaVersion: true,
          queueIndex: true,
          globalId: true,

          areas: {
            select: {
              id: true,
            },
          },

          scheduleOrder: {
            select: {
              id: true,
            },
          },
        },
      });
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new errors.NotFoundException(
          `No resource was found for ${JSON.stringify(params)}`
        );
      }
      throw error;
    }
  }

  @common.UseInterceptors(AclValidateRequestInterceptor)
  @common.Patch("/update-schedule-order-queue-index/:id")
  @swagger.ApiOperation({ summary: "Update schedule order queue index" })
  @swagger.ApiOkResponse({ type: ScheduleOrderQueue })
  @UseRoles({
    resource: "ScheduleOrderQueue",
    action: "update",
    possession: "any",
  })
  @swagger.ApiForbiddenResponse({
    type: errors.ForbiddenException,
  })
  @swagger.ApiNotFoundResponse({ type: errors.NotFoundException })
  @swagger.ApiBody({
    schema: {
      type: "object",
      properties: {
        newIndex: {
          type: "number",
          description: "New queue index position",
        },
      },
    },
  })
  async updateScheduleOrderQueueIndex(
    @common.Param() params: ScheduleOrderQueueWhereUniqueInput,
    @common.Body() body: { newIndex: number } & ScheduleOrderQueueUpdateInput,
    @common.Req() req: any
  ): Promise<ScheduleOrderQueue> {
    // Validate newIndex before proceeding
    if (body.newIndex === undefined || body.newIndex === null) {
      throw new common.BadRequestException(
        `Invalid queue index: newIndex is ${body.newIndex}. Expected a number.`
      );
    }

    const newIndexNumber = Number(body.newIndex);
    if (isNaN(newIndexNumber)) {
      throw new common.BadRequestException(
        `Invalid queue index: "${body.newIndex}" cannot be converted to a number.`
      );
    }

    if (newIndexNumber < 1) {
      throw new common.BadRequestException(
        `Queue index must be greater than 0. Received: ${newIndexNumber}`
      );
    }

    try {
      return await this.service.updateScheduleOrderQueueIndex(
        {
          where: params,
          data: {},
          select: {
            id: true,
          },
        },
        newIndexNumber
      );
    } catch (error) {
      // Log the error for debugging but don't expose internal details to the client
      console.error("Error updating schedule order queue index:", error);

      if (isRecordNotFoundError(error)) {
        throw new errors.NotFoundException(
          `No resource was found for ${JSON.stringify(params)}`
        );
      }

      // Handle specific error types with user-friendly messages
      if (error instanceof Error) {
        if (
          error.message.includes("concurrent changes") ||
          error.message.includes("interrupted")
        ) {
          throw new common.ConflictException(error.message);
        } else if (
          error.message.includes("constraint violation") ||
          error.message.includes("already exist")
        ) {
          throw new common.ConflictException(error.message);
        } else if (
          error.message.includes("not found") ||
          error.message.includes("deleted")
        ) {
          throw new errors.NotFoundException(error.message);
        } else if (error.message.includes("beyond the valid range")) {
          throw new common.BadRequestException(error.message);
        }
      }

      // For any other errors, throw a generic internal server error
      throw new common.InternalServerErrorException(
        "An error occurred while updating the queue index. Please try again."
      );
    }
  }

  @common.Post("create-and-queue-schedule-order")
  @swagger.ApiOperation({
    summary: "Create schedule order and add to queue from production order",
    description:
      "Creates a new schedule order from a production order and adds it to the queue with complete scheduling information. Gets estimation values from the production order.",
  })
  @swagger.ApiBody({
    type: CreateAndQueueScheduleOrderDto,
  })
  @swagger.ApiCreatedResponse({ type: ScheduleOrderQueue })
  @swagger.ApiNotFoundResponse({ type: errors.NotFoundException })
  @UseRoles({
    resource: "ScheduleOrderQueue",
    action: "create",
    possession: "any",
  })
  async createAndQueueScheduleOrder(
    @common.Body() data: CreateAndQueueScheduleOrderDto
  ): Promise<ScheduleOrderQueue> {
    try {
      return await this.service.createAndQueueScheduleOrder(
        data.productionOrderId,
        data.createdBy,
        data.startDate,
        data.endDate
      );
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new errors.NotFoundException(
          `No production order was found with ID ${data.productionOrderId}`
        );
      }
      if (error instanceof Error && error.message.includes("not found")) {
        throw new errors.NotFoundException(error.message);
      }
      throw new common.InternalServerErrorException(
        `Failed to create and queue schedule order: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  @common.Post("handle-position-1-queue-items")
  @swagger.ApiOperation({
    summary: "Handle queue items at position 1",
    description:
      "Detects schedule order queues at position 1 and automatically creates production order recipe instances",
  })
  @swagger.ApiOkResponse({
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
      },
    },
  })
  @UseRoles({
    resource: "ScheduleOrderQueue",
    action: "update",
    possession: "any",
  })
  async handlePosition1QueueItems(): Promise<{ success: boolean }> {
    try {
      await this.service.handlePosition1QueueItems();
      return { success: true };
    } catch (error) {
      throw new common.InternalServerErrorException(
        `Failed to handle position 1 queue items: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  @common.Post("monitor-queue-positions")
  @swagger.ApiOperation({
    summary: "Monitor queue positions",
    description:
      "Monitors queue position changes and triggers appropriate actions for position 1 items",
  })
  @swagger.ApiOkResponse({
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
      },
    },
  })
  @UseRoles({
    resource: "ScheduleOrderQueue",
    action: "update",
    possession: "any",
  })
  async monitorQueuePositions(): Promise<{ success: boolean }> {
    try {
      await this.service.monitorQueuePositions();
      return { success: true };
    } catch (error) {
      throw new common.InternalServerErrorException(
        `Failed to monitor queue positions: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  @common.UseInterceptors(AclValidateRequestInterceptor)
  @common.Delete("/deschedule-schedule-order/:id")
  @swagger.ApiOperation({
    summary: "Deschedule and delete a Schedule Order from the queue",
    description:
      "Validates queue index > 0, unlinks ProductionOrders, deletes ScheduleOrderRecipeInstance if exists, and resequences the queue",
  })
  @swagger.ApiOkResponse({ type: ScheduleOrder })
  @swagger.ApiNotFoundResponse({ type: errors.NotFoundException })
  @UseRoles({
    resource: "ScheduleOrderQueue",
    action: "delete",
    possession: "any",
  })
  @swagger.ApiForbiddenResponse({
    type: errors.ForbiddenException,
  })
  @swagger.ApiBody({
    schema: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "User ID performing the deschedule operation",
        },
      },
      required: ["userId"],
    },
  })
  async descheduleScheduleOrder(
    @common.Param() params: { id: string },
    @common.Body() body: { userId: string }
  ): Promise<ScheduleOrder> {
    try {
      return await this.scheduleOrderService.descheduleScheduleOrder(
        params.id,
        body.userId
      );
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new errors.NotFoundException(
          `Schedule Order with ID ${params.id} not found`
        );
      }
      if (error instanceof common.BadRequestException) {
        throw error;
      }
      throw new common.InternalServerErrorException(
        `Failed to deschedule schedule order: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  @common.UseInterceptors(AclValidateRequestInterceptor)
  @common.Post("/start-order/:id")
  @swagger.ApiOperation({
    summary: "Start an order at queue position 1",
    description:
      "Creates a production order recipe instance and updates the schedule order status to InProgress. Order must be at queue position 1.",
  })
  @swagger.ApiOkResponse({ type: ScheduleOrderQueue })
  @swagger.ApiNotFoundResponse({ type: errors.NotFoundException })
  @swagger.ApiBadRequestResponse({
    description: "Order is not at queue position 1",
  })
  @UseRoles({
    resource: "ScheduleOrderQueue",
    action: "update",
    possession: "any",
  })
  @swagger.ApiForbiddenResponse({
    type: errors.ForbiddenException,
  })
  @swagger.ApiBody({
    schema: {
      type: "object",
      properties: {
        updatedBy: {
          type: "string",
          description: "User ID starting the order",
        },
      },
      required: ["updatedBy"],
    },
  })
  async startOrder(
    @common.Param() params: { id: string },
    @common.Body() body: { updatedBy: string }
  ): Promise<ScheduleOrderQueue> {
    try {
      return await this.service.startOrder(params.id, body.updatedBy);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new errors.NotFoundException(
          `Schedule Order Queue with ID ${params.id} not found`
        );
      }
      if (
        error instanceof Error &&
        error.message.includes("must be at queue position 1")
      ) {
        throw new common.BadRequestException(error.message);
      }
      if (error instanceof common.BadRequestException) {
        throw error;
      }
      throw new common.InternalServerErrorException(
        `Failed to start order: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
