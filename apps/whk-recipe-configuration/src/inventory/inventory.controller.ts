import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { InventoryService } from "./inventory.service";
import { InventoryControllerBase } from "./base/inventory.controller.base";
import { InventorySiloTrackingService } from "./inventory.silotracking.service";

@swagger.ApiTags("inventories")
@common.Controller("inventories")
export class InventoryController extends InventoryControllerBase {
  constructor(
    protected readonly service: InventoryService,
    protected readonly siloTrackingService: InventorySiloTrackingService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }

  @common.Post("silo/add")
  @swagger.ApiOperation({ summary: "Add lot to asset (silo)" })
  @swagger.ApiBody({
    schema: {
      type: "object",
      properties: {
        lotId: { type: "string" },
        assetId: { type: "string" },
        quantity: { type: "number" },
        itemId: { type: "string" },
      },
      required: ["lotId", "assetId", "quantity", "itemId"],
    },
  })
  @nestAccessControl.UseRoles({
    resource: "Inventory",
    action: "create",
    possession: "any",
  })
  async addLotToAsset(
    @common.Body() body: { lotId: string; assetId: string; quantity: number; itemId: string }
  ): Promise<void> {
    return this.siloTrackingService.addLotToAsset(body.lotId, body.assetId, body.quantity, body.itemId);
  }

  @common.Post("silo/deduct")
  @swagger.ApiOperation({ summary: "Deduct from asset (silo)" })
  @swagger.ApiBody({
    schema: {
      type: "object",
      properties: {
        assetId: { type: "string" },
        quantity: { type: "number" },
      },
      required: ["assetId", "quantity"],
    },
  })
  @nestAccessControl.UseRoles({
    resource: "Inventory",
    action: "update",
    possession: "any",
  })
  async deductFromAsset(
    @common.Body() body: { assetId: string; quantity: number }
  ): Promise<void> {
    return this.siloTrackingService.deductFromAsset(body.assetId, body.quantity);
  }

  @common.Get("silo/:assetId")
  @swagger.ApiOperation({ summary: "Get asset (silo) inventory" })
  @swagger.ApiParam({ name: "assetId", type: "string" })
  @nestAccessControl.UseRoles({
    resource: "Inventory",
    action: "read",
    possession: "any",
  })
  async getAssetInventory(@common.Param("assetId") assetId: string): Promise<any[]> {
    return this.siloTrackingService.getAssetInventory(assetId);
  }

  @common.Post("silo/transfer")
  @swagger.ApiOperation({ summary: "Transfer between assets (silos)" })
  @swagger.ApiBody({
    schema: {
      type: "object",
      properties: {
        sourceAssetId: { type: "string" },
        destAssetId: { type: "string" },
        quantity: { type: "number" },
        itemId: { type: "string" },
      },
      required: ["sourceAssetId", "destAssetId", "quantity", "itemId"],
    },
  })
  @nestAccessControl.UseRoles({
    resource: "Inventory",
    action: "update",
    possession: "any",
  })
  async transferBetweenAssets(
    @common.Body() body: { sourceAssetId: string; destAssetId: string; quantity: number; itemId: string }
  ): Promise<void> {
    return this.siloTrackingService.transferBetweenAssets(body.sourceAssetId, body.destAssetId, body.quantity, body.itemId);
  }
}
