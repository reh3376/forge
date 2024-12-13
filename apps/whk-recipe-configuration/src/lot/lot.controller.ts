import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { LotService } from "./lot.service";
import { LotControllerBase } from "./base/lot.controller.base";
// import { LotCreateInput } from "./base/LotCreateInput";
import { LotCreateInput } from "./LotCreateWithoutNumberInput";

@swagger.ApiTags("lots")
@common.Controller("lots")
export class LotController extends LotControllerBase {
  constructor(
    protected readonly service: LotService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }

  @common.Post()
  @swagger.ApiCreatedResponse({ type: LotCreateInput })
  @swagger.ApiForbiddenResponse({ type: common.ForbiddenException })
  @nestAccessControl.UseRoles({
    resource: "Lot",
    action: "create",
    possession: "any",
  })
  @swagger.ApiBody({
    type: LotCreateInput,
  })
  async create(@common.Body() data: LotCreateInput): Promise<LotCreateInput> {
    const sanitizedLotNumber = data.lotNumber?.replace(/\n|\r/g, "") ?? "";
    console.log(`LotNumber: ${sanitizedLotNumber}`);
    
    return this.service.createLot({
      data: {
        ...data,
        lotNumber: data.lotNumber || '',
        filledFrom: data.filledFrom
          ? {
              connect: data.filledFrom,
            }
          : undefined,

        fromAsset: data.fromAsset
          ? {
              connect: data.fromAsset,
            }
          : undefined,

        item: data.item
          ? {
              connect: data.item ,
            }
          : undefined,

        productionOrder: data.productionOrder
          ? {
              connect: data.productionOrder,
            }
          : undefined,

        purchaseOrderAcceptedLots: data.purchaseOrderAcceptedLots
          ? {
              connect: data.purchaseOrderAcceptedLots,
            }
          : undefined,

        recipe: data.recipe
          ? {
              connect: data.recipe,
            }
          : undefined,
      },
      select: {
        id: true,
        lotNumber: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
