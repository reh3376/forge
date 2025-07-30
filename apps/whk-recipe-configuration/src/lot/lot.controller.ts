import * as common from "@nestjs/common";
import * as errors from "../errors";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { LotService } from "./lot.service";
import { LotControllerBase } from "./base/lot.controller.base";
// import { LotCreateInput } from "./base/LotCreateInput";
import { LotCreateInput } from "./LotCreateWithoutNumberInput";
import { Lot } from "./base/Lot";
import { LotWhereUniqueInput } from "./base/LotWhereUniqueInput";
import { LotUpdateInput } from "./base/LotUpdateInput";
import { isRecordNotFoundError } from "../prisma.util";

@swagger.ApiTags("lots")
@common.Controller("lots")
export class LotController extends LotControllerBase {
  constructor(
    protected readonly service: LotService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }

  @common.Post()
  @swagger.ApiCreatedResponse({ type: LotCreateInput })
  @swagger.ApiForbiddenResponse({ type: common.ForbiddenException })
  @UseRoles({
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
        lotNumber: data.lotNumber || "",
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
              connect: data.item,
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

  @common.Patch("/:id")
  @swagger.ApiOkResponse({ type: Lot })
  @swagger.ApiNotFoundResponse({ type: errors.NotFoundException })
  @swagger.ApiForbiddenResponse({
    type: errors.ForbiddenException,
  })
  async updateLot(
    @common.Param() params: LotWhereUniqueInput,
    @common.Body() data: LotUpdateInput
  ): Promise<Lot> {
    try {
      return await this.service.updateLot({
        where: params,
        data: {
          ...data,

          continerItem: data.continerItem
            ? {
                connect: data.continerItem,
              }
            : undefined,

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

          furnishingCustomer: data.furnishingCustomer
            ? {
                connect: data.furnishingCustomer,
              }
            : undefined,

          productionOrder: data.productionOrder
            ? {
                connect: data.productionOrder,
              }
            : undefined,

          proofingTank: data.proofingTank
            ? {
                connect: data.proofingTank,
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

          tankOfOrigin: data.tankOfOrigin
            ? {
                connect: data.tankOfOrigin,
              }
            : undefined,
        },
        select: {
          avgBblFillByPg: true,
          avgBblFillByWg: true,
          avgPGsFerm: true,
          bblEntryProof: true,
          bblOem: true,
          bblTotal: true,
          bblType: true,
          confirmed: true,

          continerItem: {
            select: {
              id: true,
            },
          },

          createdAt: true,
          createdBy: true,
          densityFinal: true,
          externalId: true,

          filledFrom: {
            select: {
              id: true,
            },
          },

          filledFromString: true,
          finalVolume: true,
          finalWeight: true,

          fromAsset: {
            select: {
              id: true,
            },
          },

          furnishingCustomer: {
            select: {
              id: true,
            },
          },

          globalId: true,
          grainLbsFerm: true,
          grainLbsPg: true,
          id: true,
          initialVolume: true,
          initialWeight: true,
          isRawMaterial: true,
          lotAlphaChar: true,
          lotCreatedAt: true,
          lotNumber: true,
          notes: true,
          pgLosses: true,

          productionOrder: {
            select: {
              id: true,
            },
          },

          proofInitial: true,

          proofingTank: {
            select: {
              id: true,
            },
          },

          purchaseOrderAcceptedLots: {
            select: {
              id: true,
            },
          },

          recipe: {
            select: {
              id: true,
            },
          },

          schemaVersion: true,
          standardYield: true,
          status: true,

          tankOfOrigin: {
            select: {
              id: true,
            },
          },

          totalFermenters: true,
          totalPGs: true,
          totalPGsByRecipe: true,
          totalVolumeWg: true,
          totalWGs: true,
          totalWeight: true,
          updatedAt: true,
          warehouseEntryNumber: true,
          whiskeyType: true,
        },
      });
    } catch (error: any) {
      if (isRecordNotFoundError(error)) {
        throw new errors.NotFoundException(
          `No resource was found for ${JSON.stringify(params)}`
        );
      }
      throw error;
    }
  }
}
