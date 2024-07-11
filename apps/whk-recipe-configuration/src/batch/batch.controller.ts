import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { BatchService } from "./batch.service";
import { BatchControllerBase } from "./base/batch.controller.base";
import { BatchIdCreateInput } from "./BatchIdCreateInput";
import { Batch } from "@prisma/client";

@swagger.ApiTags("batches")
@common.Controller("batches")
export class BatchController extends BatchControllerBase {
  constructor(
    protected readonly service: BatchService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }

  @common.Post("/batch-id")
  @swagger.ApiOperation({ summary: "Get a new batch ID" })
  @swagger.ApiResponse({
    status: 201,
    description: "The batch ID has been successfully generated.",
    type: String,
  })
  async getBatchId(
    @common.Body() batchIdCreateInput: BatchIdCreateInput
  ): Promise<Batch> {
    return await this.service.GetBatchId(batchIdCreateInput);
  }
}
