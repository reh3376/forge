import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from './inventory.service';
import { Lot, Asset, Inventory } from '@prisma/client';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

@Injectable()
export class InventorySiloTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
  ) {}
  async getItemIdFromAsset(assetId: string): Promise<string> {
    const inv = await this.prisma.inventory.findFirst({
      where: { assetId },
      orderBy: { fifoIndex: 'desc' },
      include: { item: true }
    });
    if (!inv) {
      throw new Error('Inventory not found');
    }
    return inv.item.id;
  }

  async addLotToAsset(lotId: string, assetId: string, quantity: number, itemId?: string, createdBy?: string, itemReceiptId?: string): Promise<Inventory | undefined> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });

    if (!lotId || !asset) {
      throw new Error('Lot or Asset not found');
    }
    if (!itemId) {
      itemId = await this.getItemIdFromAsset(assetId);
    }

    // Check for existing inventory in the asset for the lot
    const existingInventory = await this.prisma.inventory.findFirst({
      where: {
        lotNumber: lotId,
        assetId: assetId,
      },
    });

    if (existingInventory) {
      // If inventory already exists, update the quantity
      this.logger.warn(`Inventory already exists for lot ${lotId} and asset ${assetId}. Updating quantity to ${quantity}.`);
    } else {
      // Find the highest fifoIndex for the asset
      const highestIndexInventory = await this.prisma.inventory.findFirst({
        where: { assetId: assetId },
        orderBy: { fifoIndex: 'desc' },
      });

      const newFifoIndex = highestIndexInventory?.fifoIndex !== null && highestIndexInventory?.fifoIndex !== undefined ? highestIndexInventory.fifoIndex + 1 : 0;

      return await this.prisma.inventory.create({
        data: {
          lotNumber: lotId,
          asset: { connect: { id: assetId } },
          currentQuantity: quantity,
          originalQuantity: quantity,
          createdBy: createdBy || 'mes', // Adding createdBy field
          item: { connect: { id: itemId } }, // Connecting to the item through the lot
          itemReceipt: { connect: { id: itemReceiptId } },
          fifoIndex: newFifoIndex,
        },
      });
    }
  }

  async deductFromAsset(assetId: string, quantityToDeduct: number): Promise<void> {
    const inventoryItems = await this.prisma.inventory.findMany({
      where: { assetId },
      orderBy: { fifoIndex: 'asc' },
    });

    if (!inventoryItems || inventoryItems.length === 0) {
      throw new Error('No inventory items found for the asset');
    }

    let remainingQuantityToDeduct = quantityToDeduct;

    for (const item of inventoryItems) {
      if (remainingQuantityToDeduct <= 0) break;

      if (item.currentQuantity !== null && item.currentQuantity <= remainingQuantityToDeduct) {
        // Deduct entire inventory item
        await this.prisma.inventory.delete({ where: { id: item.id } });
        remainingQuantityToDeduct -= item.currentQuantity;
      } else {
        // Partially deduct from inventory item
        if (item.currentQuantity !== null) {
          await this.prisma.inventory.update({
            where: { id: item.id },
            data: { currentQuantity: item.currentQuantity - remainingQuantityToDeduct },
          });
          remainingQuantityToDeduct = 0;
        } else {
          throw new Error('Current quantity is null');
        }
      }
    }

    if (remainingQuantityToDeduct > 0) {
      throw new Error('Insufficient quantity in asset to deduct');
    }
  }

  async getAssetInventory(assetId: string): Promise<{inventory:Inventory[],totalInventory:number}> {
    const inventory= await this.prisma.inventory.findMany({
      where: { assetId: assetId },
      orderBy: { fifoIndex: 'asc' },
    });
    const totalInventory = inventory.reduce((acc, item) => acc + (item.currentQuantity ?? 0), 0);
    return {
      "inventory":inventory,
      "totalInventory":totalInventory,
    };
  }

  async transferBetweenAssets(sourceAssetId: string, destAssetId: string, quantity: number, itemId: string): Promise<void> {
    await this.deductFromAsset(sourceAssetId, quantity);
    
    const sourceInventoryItem = await this.prisma.inventory.findFirst({
      where: { assetId: sourceAssetId, itemId },
      orderBy: { fifoIndex: 'asc' },
    });

    if (!sourceInventoryItem || sourceInventoryItem.lotNumber === null) {
      throw new Error('No lot found to transfer or lot number is null');
    }

    const nextFifoIndex = await this.getNextFifoIndex(destAssetId);
    await this.prisma.inventory.create({
      data: {
        assetId: destAssetId,
        itemId,
        currentQuantity: quantity,
        lotNumber: sourceInventoryItem.lotNumber,
        createdBy: 'system', // Adding the required 'createdBy' field
        fifoIndex: nextFifoIndex,
      },
    });
  }
  
  async getNextFifoIndex(assetId: string): Promise<number> {
    const latestInventory = await this.prisma.inventory.findFirst({
      where: { assetId },
      orderBy: { fifoIndex: 'desc' },
    });

    if (!latestInventory) {
      return 1; // If no inventory exists for this asset, start with 1
    }

    return (latestInventory.fifoIndex ?? 0) + 1;
  }
}
