import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { BatchService } from "./batch.service";
import { BatchControllerBase } from "./base/batch.controller.base";
import { BatchIdCreateInput } from "./BatchIdCreateInput";

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
  ): Promise<{ batchId: string }> {
    const batch = await this.service.GetBatchId(batchIdCreateInput);
    return { batchId: batch.batchId };
  }
}
