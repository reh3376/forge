import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ItemReceiptServiceBase } from "./base/itemReceipt.service.base";
import { Prisma } from "@prisma/client";
import { WhMessageBrokerTopics } from "../rabbitmq/topics";
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import Decimal from "decimal.js";
import { InventorySiloTrackingService } from "../inventory/inventory.silotracking.service";

@Injectable()
export class ItemReceiptService extends ItemReceiptServiceBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly rabbitProducer: RabbitMQProducerService,
    protected readonly siloTrackingService: InventorySiloTrackingService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
  ) {
    super(prisma);
  }

  async createItemReceipt<T extends Prisma.ItemReceiptCreateArgs>(args: Prisma.SelectSubset<T, Prisma.ItemReceiptCreateArgs>): Promise<import(".prisma/client").ItemReceipt> {
    // get the grain tests statically for now. 
    const grainTests = await this.prisma.testParameter.findMany({
      where: {
        active: true,
        isClassDef: true,
      }
    });

    const itemReceipt = await this.prisma.$transaction(async (prisma) => {
      const createdItemReceipt = await super.createItemReceipt({
        data: args.data,
        include: {
          item: true,
          purchaseOrder: true,
        }
      });

      // create the grain test instances 
      for (const test of grainTests) {
        await prisma.testParameter.create({
          data: {
            testParamUnits: test.testParamUnits,
            name: test.name,
            description: test.description,
            createdBy: args.data.createdBy,
            testSetpointType: test.testSetpointType,
            testParamRevision: test.testParamRevision,
            testSetpointBooleanValue: test.testSetpointBooleanValue,
            testSetpointLowerLimit: test.testSetpointLowerLimit,
            testSetpointUpperLimit: test.testSetpointUpperLimit,
            testSetpointValue: test.testSetpointValue,
            active: true,
            isClassDef: false,
            classId: { connect: { id: test.id } },
            itemReceipt: { connect: { id: createdItemReceipt.id } },
            required: test.required,
          }
        });
      }
      return createdItemReceipt;
    });

    return itemReceipt;
  }

  async updateItemReceipt<T extends Prisma.ItemReceiptUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.ItemReceiptUpdateArgs>): Promise<import(".prisma/client").ItemReceipt> {


    const itemReceipt = await super.updateItemReceipt(args);

    // use the id from the update to get the record in the form we want for the message publishing
    const itemReceiptPayload = await this.prisma.itemReceipt.findUnique({
      where: { id: itemReceipt.id },
      include: {
        purchaseOrder: {
          include: {
            vendor: true,
            item: true,
          }
        },
        item: true,
      }
    });
    let quantityInPounds = args.data.quantity;
    this.logger.debug(`Quantity in the args: ${quantityInPounds}`);
    // Check if quantity is in the args and over 10k
    if (quantityInPounds && typeof quantityInPounds === 'number' && quantityInPounds > 10000) {
      // Convert quantity to pounds based on grain type
      this.logger.debug(`Purchase order for the itemReceipt: ${itemReceiptPayload?.purchaseOrder}`);

      /* 
      PATRICK MANNION - WHISKEY HOUSE OF KENTUCKY
      2024-07-17

      ERP BUDDIES PLACED LOGIC TO DO THIS CONVERSION. LEAVING THIS IN, IN CASE FUTURE NEED ARISES
      */
      // if (itemReceiptPayload?.purchaseOrder?.transactionGroup?.startsWith('RM-GR-')) {
      //   const item = itemReceiptPayload?.item;
      //   this.logger.debug(`Item for the itemReceipt: ${item}`);
      //   if (item) {
      //     // Map transaction group to unitLookup record name
      //     const transactionGroupToUnitMap = {
      //       'RM-GR-MLT': 'Barley Bushel',
      //       'RM-GR-WHT': 'Wheat Bushel',
      //       'RM-GR-COR': 'Corn Bushel',
      //       'RM-GR-RYE': 'Rye Bushel'
      //     };

      //     const transactionGroup = itemReceiptPayload?.purchaseOrder?.transactionGroup;
      //     if (transactionGroup && transactionGroup in transactionGroupToUnitMap) {
      //       const unitName = transactionGroupToUnitMap[transactionGroup as keyof typeof transactionGroupToUnitMap];
            
      //       // Fetch the unitLookup record based on the mapped name
      //       const unitLookup = await this.prisma.unitLookup.findUnique({
      //         where: { name: unitName }
      //       });

      //       if (unitLookup) {
      //         quantityInPounds = quantityInPounds / Number(unitLookup.conversionRate);
      //       } else {
      //         this.logger.warn(`Unit conversion not found for ${unitName}. Using original quantity.`);
      //       }
      //     } else {
      //       this.logger.warn(`Transaction group ${transactionGroup} not mapped. Using original quantity.`);
      //     }
      //   }
      //   // Update the quantity in the payload
      //   itemReceiptPayload.quantity = new Decimal(quantityInPounds);
      // }

      if (itemReceiptPayload?.purchaseOrder?.transactionGroup?.startsWith('RM-GR-')) {
        const item = itemReceiptPayload?.item;
        this.logger.debug(`Item for the itemReceipt: ${item}`);
        if (item) {
          // Map transaction group to unitLookup record name
          const toUnitMap = {
            'RM-GR-MLT': 'bsc-mlt',
            'RM-GR-WHT': 'bsc-wht',
            'RM-GR-COR': 'bsc-cor',
            'RM-GR-RYE': 'Rye Bushel'
          };
        }
      }


      await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Itemreceipt, {
        event_type: 'large_quantity_update',
        data: {
          ...itemReceiptPayload,
        },
        id: itemReceipt.id,
        quantity: new Decimal(quantityInPounds),
        item: itemReceiptPayload?.item,
        purchaseOrder: itemReceiptPayload?.purchaseOrder,
        recordName: 'ItemReceipt',
      });
      this.logger.log(`Emitted large quantity update for ItemReceipt: ${itemReceipt.id}`);

      this.logger.debug(`Updating inventory for itemReceipt: ${itemReceipt.id}`);
      const item = itemReceiptPayload?.item;
      if (!item) {
        throw new Error('Item not found');
      }

      // Map silo number to the silos and look up in the asset model
      if (itemReceiptPayload. siloNumber) {
        // Look up the asset based on the silo number
        const siloNumberAssetNameMapping = {
          1: 'SIL-025',
          2: 'SIL-030',
          3: 'SIL-035',
          4: 'SIL-040',
          5: 'SIL-045',
        }

        const asset = await this.prisma.asset.findFirst({
          where: {
            name: {
              contains: siloNumberAssetNameMapping[itemReceiptPayload.siloNumber as keyof typeof siloNumberAssetNameMapping],
              mode: 'insensitive'
            },
            assetType: 'UNIT'
          }
        });
        
        if (asset) {
          // If asset is found, use its ID for inventory tracking
          try {
            const currentInventory = await this.prisma.inventory.findFirst({
              where: {
                assetId: asset.id,
                itemId: item.id
              }
            });
            
            const inventory = await this.siloTrackingService.addLotToAsset(
              itemReceiptPayload.supplierLot as string,
              asset.id,
              itemReceiptPayload.quantity,
              item.id,
              itemReceipt.createdBy,
              itemReceipt.id,
            );
            this.logger.log(`Added lot ${itemReceiptPayload.supplierLot} to asset ${asset.id} (Silo ${itemReceiptPayload.siloNumber})`);
          } catch (error) {
            this.logger.error(`Error adding lot to asset: ${error}`);
          }
        } else {
          this.logger.warn(`Asset not found for Silo ${itemReceiptPayload.siloNumber}`);
        }
      } else {
        this.logger.warn('No silo number found for itemReceipt');
      }
    }

    return itemReceipt;
  }

  async deleteItemReceipt<T extends Prisma.ItemReceiptDeleteArgs>(args: Prisma.SelectSubset<T, Prisma.ItemReceiptDeleteArgs>): Promise<import(".prisma/client").ItemReceipt> {
    const itemReceipt = await super.deleteItemReceipt(args);

    await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Itemreceipt, {
      event_type: 'delete',
      data: itemReceipt,
      recordName: 'ItemReceipt',
    });
    this.logger.log(`Deleted ItemReceipt: ${itemReceipt.id} & pushed to topic`)

    return itemReceipt;
  }
}
