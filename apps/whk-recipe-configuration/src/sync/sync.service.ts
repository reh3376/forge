import {Injectable, } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {PrismaService} from "../prisma/prisma.service";

@Injectable()
export class PrismaServiceExtended extends PrismaService {
    // Allow string index
    [key: string]: any
}

@Injectable()
export class SyncService {
    private token: string;
    private serviceRegistry: Map<string, any>;
    private prismaEntityMap: Record<string, any>;

    constructor(
        private configService: ConfigService,
        private readonly prisma: PrismaService,
    ) {
        this.token = ''
        this.serviceRegistry = new Map<string, any>();

        this.prismaEntityMap = {
            item: this.prisma.item,
            purchaseOrder: this.prisma.purchaseOrder,
            salesOrder: this.prisma.salesOrder,
            productionOrder: this.prisma.productionOrder,
            asset: this.prisma.asset,
            recipe: this.prisma.recipe,
            bom: this.prisma.bom,
            account: this.prisma.account,
        };
    }

    async upsertEntity(entityName: string, data: any): Promise<void> {
        // Convert the entityName to lowercase to match the Prisma model name
        const entity = entityName.toLowerCase();
        const payloadData = data.data;

        // Extract necessary information from data
        const globalId = payloadData.globalId; // replace with your actual logic

        // Find the entity in the database using the Prisma model
        let existingEntity = await this.prismaEntityMap[entity].findUnique({ where: { globalId: globalId } });

        // If the entity exists, update it with the new data
        // If the entity does not exist, create a new one with the data
        if (existingEntity) {
            // Update the entity with the new data
            await this.prismaEntityMap[entity].update({
                where: { globalId: globalId},
                payloadData,
            });
        } else {
            // Create a new entity with the data
            await this.prismaEntityMap[entity].create({ payloadData });
        }
    }
}