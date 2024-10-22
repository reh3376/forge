import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from './inventory.service';
import { Lot, Asset, Inventory } from '@prisma/client';

@Injectable()
export class InventorySiloTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService
  ) {}

  async addLotToAsset(lotId: string, assetId: string, quantity: number, itemId: string,createdBy?: string): Promise<void> {
    const lot = await this.prisma.lot.findUnique({ where: { id: lotId } });
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });

    if (!lot || !asset) {
      throw new Error('Lot or Asset not found');
    }
    await this.prisma.inventory.create({
      data: {
        lotNumber: lot.lotNumber,
        asset: { connect: { id: assetId } },
        currentQuantity: quantity,
        createdBy: createdBy || 'mes', // Adding createdBy field
        item: { connect: { id: itemId } }, // Connecting to the item through the lot
      },
    });
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

  async getAssetInventory(assetId: string): Promise<Inventory[]> {
    return this.prisma.inventory.findMany({
      where: { assetId: assetId },
      orderBy: { fifoIndex: 'asc' },
    });
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
