import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import * as errors from "../errors";

import { ScheduleOrderQueueService } from "./scheduleOrderQueue.service";
import { ScheduleOrderQueueControllerBase } from "./base/scheduleOrderQueue.controller.base";
import { ScheduleOrderQueueCreateInput } from "./base/ScheduleOrderQueueCreateInput";
import { AclValidateRequestInterceptor } from "../interceptors/aclValidateRequest.interceptor";
import { ScheduleOrderQueue } from "./base/ScheduleOrderQueue";
import { isRecordNotFoundError } from "../prisma.util";
import { ScheduleOrderQueueWhereUniqueInput } from "./base/ScheduleOrderQueueWhereUniqueInput";
import { ScheduleOrderQueueUpdateInput } from "./base/ScheduleOrderQueueUpdateInput";

@swagger.ApiTags("scheduleOrderQueues")
@common.Controller("scheduleOrderQueues")
export class ScheduleOrderQueueController extends ScheduleOrderQueueControllerBase {
  constructor(
    protected readonly service: ScheduleOrderQueueService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }

  @common.UseInterceptors(AclValidateRequestInterceptor)
  @common.Post("/add-to-pending-schedule-order-queue")
  @swagger.ApiOperation({ summary: "Add SO to pending schedule order queue" })
  @swagger.ApiCreatedResponse({ type: ScheduleOrderQueue })
  @nestAccessControl.UseRoles({
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

        nextUnitProcedure: data.nextUnitProcedure
          ? {
            connect: data.nextUnitProcedure,
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

        nextUnitProcedure: {
          select: {
            id: true,
          },
        },

        nextUnitProcedureName: true,

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
  @nestAccessControl.UseRoles({
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

          nextUnitProcedure: data.nextUnitProcedure
            ? {
              connect: data.nextUnitProcedure,
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

          nextUnitProcedure: {
            select: {
              id: true,
            },
          },

          nextUnitProcedureName: true,

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
  @nestAccessControl.UseRoles({
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
          nextUnitProcedure: data.nextUnitProcedure
            ? {
              connect: data.nextUnitProcedure,
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

          nextUnitProcedure: {
            select: {
              id: true,
            },
          },

          nextUnitProcedureName: true,

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
  @nestAccessControl.UseRoles({
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
          nextUnitProcedure: data.nextUnitProcedure
            ? {
              connect: data.nextUnitProcedure,
            }
            : undefined,

          scheduleOrder: data.scheduleOrder
            ? {
              connect: data.scheduleOrder,
            }
            : undefined,
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
  @nestAccessControl.UseRoles({
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
          nextUnitProcedure: data.nextUnitProcedure
            ? {
              connect: data.nextUnitProcedure,
            }
            : undefined,

          scheduleOrder: data.scheduleOrder
            ? {
              connect: data.scheduleOrder,
            }
            : undefined,
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
  @nestAccessControl.UseRoles({
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
      type: 'object',
      properties: {
        newIndex: {
          type: 'number',
          description: 'New queue index position'
        }
      }
    }
  })
  async updateScheduleOrderQueueIndex(
    @common.Param() params: ScheduleOrderQueueWhereUniqueInput,
    @common.Body() body: { newIndex: number },
    @common.Body() data: ScheduleOrderQueueUpdateInput
  ): Promise<ScheduleOrderQueue> {
    console.log(body);
    try {
      return await this.service.updateScheduleOrderQueueIndex(
        {
          where: params,
          data: {
            ...data,
            nextUnitProcedure: data.nextUnitProcedure
              ? {
                connect: data.nextUnitProcedure,
              }
              : undefined,

            scheduleOrder: data.scheduleOrder
              ? {
                connect: data.scheduleOrder,
              }
              : undefined,
          },
        },
        Number(body.newIndex)
      );
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new errors.NotFoundException(
          `No resource was found for ${JSON.stringify(params)}`
        );
      }
      throw error;
    }
  }

  @common.Post('add-production-order-to-queue/:id')
  @swagger.ApiOperation({
    summary: 'Create schedule order and add to queue from production order',
    description: 'Creates a new schedule order from a production order and adds it to the queue'
  })
  @swagger.ApiParam({
    name: 'id',
    type: 'string',
    description: 'Production order ID'
  })
  @swagger.ApiCreatedResponse({ type: ScheduleOrderQueue })
  @swagger.ApiNotFoundResponse({ type: errors.NotFoundException })
  async createAndQueueScheduleOrder(
    @common.Param('id') id: string,
    @common.Body('startDate') startDate: Date,
    @common.Body('endDate') endDate: Date,
    @common.Body('bblPerFerm') bblPerFerm: number,
    @common.Body('yieldPgPerBsh') yieldPgPerBsh: number,
    @common.Body('pgsPerBbl') pgsPerBbl: number
  ): Promise<ScheduleOrderQueue> {
    try {
      return await this.service.createAndQueueScheduleOrder(id, startDate, endDate, bblPerFerm, yieldPgPerBsh, pgsPerBbl);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new errors.NotFoundException(
          `No production order was found with ID ${id}`
        );
      }
      throw error;
    }
  }
}
