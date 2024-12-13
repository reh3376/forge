import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { BatchService } from "./batch.service";
import { BatchControllerBase } from "./base/batch.controller.base";
import { BatchIdCreateInput } from "./BatchIdCreateInput";
import { Batch } from "./base/Batch";

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

  @common.Patch("/:id/recipe-bom-item-quantities")
  @swagger.ApiOperation({ summary: "Update recipe bom item quantities" })
  @swagger.ApiBody({
    schema: {
      type: "object",
      properties: {
        items: {
          type: "object",
          additionalProperties: {
            type: "number",
          },
        },
      },
      required: ["items"],
    },
  })
  @swagger.ApiResponse({
    status: 200,
    description: "The recipe bom item quantities have been successfully updated.",
    type: Batch,
  })
  async updateBatchRecipeBomItemQuantities(
    @common.Param("id") batchId: string,
    @common.Body() body: { items: { [itemId: string]: number } }
  ): Promise<Batch> {

    return await this.service.updateBatchRecipeBomItemQuantities(batchId, body.items);
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
