import {Inject, Injectable, LoggerService, } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {ModuleRef} from "@nestjs/core";
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

    constructor(
        private configService: ConfigService,
        private logger: LoggerService,
        private readonly moduleRef: ModuleRef,
        @Inject() private readonly prisma: PrismaServiceExtended,
    ) {
        this.token = ''
        this.serviceRegistry = new Map<string, any>();
    }

    async upsertEntity(entityName: string, data: any): Promise<void> {
        // Convert the entityName to lowercase to match the Prisma model name
        const entity = entityName.toLowerCase();
        const payloadData = data.data;

        // Extract necessary information from data
        const globalId = payloadData.globalId; // replace with your actual logic

        // Find the entity in the database using the Prisma model
        let existingEntity = await this.prisma[entity].findUnique({ where: { globalId: globalId } });

        // If the entity exists, update it with the new data
        // If the entity does not exist, create a new one with the data
        if (existingEntity) {
            // Update the entity with the new data
            await this.prisma[entity].update({
                where: { globalId: globalId},
                payloadData,
            });
        } else {
            // Create a new entity with the data
            await this.prisma[entity].create({ payloadData });
        }
    }
}