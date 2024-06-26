import {Injectable, OnModuleInit, } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {PrismaService} from "../prisma/prisma.service";
import { AccountCreateInput } from '../account/base/AccountCreateInput';
import { ItemCreateInput } from '../item/base/ItemCreateInput';
import { SalesOrderCreateInput } from '../salesOrder/base/SalesOrderCreateInput';
import { PurchaseOrderCreateInput } from '../purchaseOrder/base/PurchaseOrderCreateInput';
import { ItemReceiptCreateInput } from '../itemReceipt/base/ItemReceiptCreateInput';
import { ItemReceiptUpdateInput } from '../itemReceipt/base/ItemReceiptUpdateInput';
import { PurchaseOrderUpdateInput } from '../purchaseOrder/base/PurchaseOrderUpdateInput';
import { SalesOrderUpdateInput } from '../salesOrder/base/SalesOrderUpdateInput';
import { ItemUpdateInput } from '../item/base/ItemUpdateInput';
import { AccountUpdateInput } from '../account/base/AccountUpdateInput';
import { PinoLogger } from 'nestjs-pino';

import * as path from "path";
import * as fs from "fs";
import { Expose, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

@Injectable()
export class SyncService implements OnModuleInit {
    private readonly token: string;
    private prismaEntityMap: Record<string, any>;
    private entityCreateInputMap: Record<string, any>;
    private entityUpdateInputMap: Record<string, any>;

    constructor(
        private configService: ConfigService,
        private readonly logger: PinoLogger,
        // private readonly moduleRef: ModuleRef,
        private readonly prisma: PrismaService,
    ) {
        this.token = ''

        this.prismaEntityMap = {
            item: this.prisma.item,
            itemreceipt: this.prisma.itemReceipt,
            purchaseorder: this.prisma.purchaseOrder,
            salesorder: this.prisma.salesOrder,
            customer: this.prisma.account,
            // vendor: this.prisma.vendor,
        };

        this.entityUpdateInputMap = {
            itemreceipt: ItemReceiptUpdateInput,
            purchaseorder: PurchaseOrderUpdateInput,
            salesorder: SalesOrderUpdateInput,
            item: ItemUpdateInput,
            customer: AccountUpdateInput,
            // vendor: VendorUpdateInput,
        }

        this.entityCreateInputMap = {
            itemreceipt: ItemReceiptCreateInput,
            purchaseorder: PurchaseOrderCreateInput,
            salesorder: SalesOrderCreateInput,
            item: ItemCreateInput,
            customer: AccountCreateInput,
            // vendor: VendorCreateInput,
        }
    }

    onModuleInit() { }

    private parseModelRelations(schemaPath: string, modelName: string) {
        const schema = fs.readFileSync(schemaPath, { encoding: 'utf-8' });
        const lines = schema.split('\n');
        const models: Record<string, { name: string, fields: unknown, relations: { field: string, relation: Record<string, string>, type: string }[] } | any> = {};
        let inModelBlock = false;

        // Initialize the model
        models[modelName] = { name: modelName, fields: {}, relations: [] };

        lines.forEach(line => {
            if (line.startsWith(`model ${modelName} {`)) {
                inModelBlock = true;
            } else if (line.startsWith('model ') && inModelBlock) {
                inModelBlock = false;  // Stop parsing when a new model starts
            }

            if (inModelBlock) {
                if (line.includes('@relation')) {
                    const relationLine: string = line.trim() || '';
                    const fieldName: string = relationLine.split(' ')[0];
                    const match: RegExpMatchArray | null = relationLine.match(/@relation\(([^)]+)\)/);
                    const details: string = match ? match[1] : '';
                    const relationArgs: Record<string, string> = details.split(',').reduce((acc: Record<string, string>, curr) => {
                        const [key, value] = curr.trim().split(':');
                        acc[key.trim()] = value.trim().replace(/["']/g, '');
                        return acc;
                    }, {});

                    models[modelName].relations.push({
                        field: fieldName,
                        relation: relationArgs,
                        type: "one"
                    });
                } else if (line.includes("[]")) {
                    const relationLine: string = line.trim() || '';
                    const fieldName: string = relationLine.split(' ')[0];
                    const match: RegExpMatchArray | null = relationLine.match(/ (\S+)\[\]/);
                    let relation: string = '';
                    if (match) {
                        relation = match[1];
                    }
                    models[modelName].relations.push({
                        field: fieldName,
                        relation: relation,
                        type: "many"
                    });
                }
            }
        });
        return models[modelName];
    }

    private async loadAndParseSchema(entityName: string) {
        const schemaPath: string = path.resolve('./prisma/schema.prisma');
        try {
            return this.parseModelRelations(schemaPath, entityName);  // Implement parsing logic as shown previously
        } catch (err) {
            console.error('Error reading schema file:', err);
        }
    }


    public extendWithExpose<T extends { new(...args: any[]): any }>(Base: T) {
        return class extends Base {
            constructor(...args: any[]) {
                super(...args);

                // Get the properties of the base class
                const baseProperties: string[] = Object.getOwnPropertyNames(new Base());

                // Iterate over each property and add the @Expose() decorator
                baseProperties.forEach((property) => {
                    Expose()(this, property);
                });
            }
        };
    }

    private async handleNestedRelations(entityName: string, payloadData: Record<string, any>): Promise<Record<string, any>> {
        // For each nested relation, convert it to the Prisma format and replace the original one in the payload data
        const modelRelations = await this.loadAndParseSchema(entityName);
        if (modelRelations.relations.length > 0) {
            // // first "best effort" attempt to convert the nested relations to the Prisma format
            // for (const nestedRelation of modelRelations.relations) {
            //     try {
            //         // check nestedRelation for data in the field
            //         if (payloadData[nestedRelation.field]) {
            //             await this.upsertEntity(nestedRelation.field, payloadData[nestedRelation.field]);
            //         }
            //     } catch (error: unknown) {
            //         this.logger.warn(`Error upserting nested entity: ${error}`);
            //     }
            // }
            // convert the payload data to the Prisma format requried for the outer entity
            modelRelations.relations.forEach((relation: { field: string, type: string; }) => {
                if (payloadData[relation.field]) {
                    try {
                        if (relation.type === 'one') {
                            // "one" transform, use unique class
                            // if the field is not found, remove the field from the payload
                            const convertedFieldPayload = this.convertToWhereUniquePrismaFormat(relation.field, payloadData[relation.field]);
                            if (Object.keys(convertedFieldPayload).length > 0) {
                                payloadData[relation.field] = convertedFieldPayload;
                            } else {
                                delete payloadData[relation.field];
                            }
                            this.logger.debug(`Nested relation one payload: ${payloadData[relation.field]}`);
                        } else if (relation.type === 'many') {
                            // "many" transform, use connect class
                            payloadData[relation.field] = this.convertToConnectPrismaFormat(relation.field, payloadData[relation.field]);
                            this.logger.debug(`Nested relation many payload: ${payloadData[relation.field]}`);
                        }
                    } catch (error: unknown) {
                        this.logger.warn(`Error handling nested entity ${relation.field} - ${error}`)
                    }
                }
            });

        }
        return { modelRelations: modelRelations, payloadData: payloadData };
    }

    private async validatePayload(entity: string, payload: Record<string, any>): Promise<any> {
        const ExposedClass = this.extendWithExpose(this.entityUpdateInputMap[entity.toLowerCase()]);
        const testExposedClassInstance = new ExposedClass();
        this.logger.debug(`Exposed class instance: ${JSON.stringify(testExposedClassInstance)}`);
        // Use the new class with the plainToInstance function
        const instance: any = plainToInstance(ExposedClass, payload, {
            enableImplicitConversion: true,
            excludeExtraneousValues: true  // Ensures only defined fields are included
        });

        const errors = await validate(instance);
        if (errors.length > 0) {
            throw new Error("Validation failed. Errors: " + errors);
        }

        // Loop through the fields, if the field value is null or an empty list, omit
        const filteredInstance = Object.fromEntries(
            Object.entries(instance).filter(([_, value]) => value !== null && !(Array.isArray(value) && value.length === 0) && value !== undefined)
        );

        // const replacedJsonFields = Object.fromEntries(
        //     Object.entries(filteredInstance).filter(([key, value]) => {
        //         if (value === null || (Array.isArray(value) && value.length === 0)) {
        //             return false;
        //         }
        //         // Check the original payload for JSON fields and replace the instance field with it if present
        //         if (typeof instance[key] === 'object' && instance[key] !== null) {

        //         // if (typeof payload[key] === 'object' && payload[key] !== null) {
        //             filteredInstance[key] = payload[key];
        //         }
        //         return true;
        //     })
        // );
        return filteredInstance;
    }


    async upsertEntity(entityName: string, data: any): Promise<void> {
        // Convert the entityName to lowercase to match the Prisma model name
        this.logger.debug(`Upserting ${entityName} with data: ${JSON.stringify(data)}`);
        const entity = entityName.toLowerCase();
        let payloadData: any;
        try {
            payloadData = data.data.data;
        } catch (error: unknown) {
            payloadData = data;
        }

        // Loop through the fields, if the field value is null or an empty list, omit
        const filteredPayloadData = Object.fromEntries(
            Object.entries(payloadData).filter(([_, value]) => value !== null && !(Array.isArray(value) && value.length === 0) && value !== undefined)
        );

        // Handle nested relations
        const nestedHandlerData = await this.handleNestedRelations(entityName, filteredPayloadData);
        payloadData = nestedHandlerData.payloadData;

        // Extract necessary information from data
        const globalId = payloadData.globalId; // replace with your actual logic

        // Find the entity in the database using the Prisma model
        const existingEntity = await this.prismaEntityMap[entity].findMany({ where: { globalId: globalId } });
        this.logger.debug(`Existing entity: ${JSON.stringify(existingEntity)}`);

        // If the entity exists, update it with the new data.
        // If the entity does not exist, create a new one with the data
        if (existingEntity && existingEntity.length > 0) {
            const payload = {
                ...payloadData,
            };
            this.logger.debug(`Updating ${entity} with data: ${JSON.stringify(payload)}`);

            // Validate the payload
            const validatedInstance = await this.validatePayload(entity, payload);

            await this.prismaEntityMap[entity].update(
                {
                    where: { globalId: globalId },
                    data: validatedInstance
                });
        } else {
            const payload = {
                ...payloadData,
            };
            this.logger.debug(`Creating ${entity} with data: ${JSON.stringify(payload)}`);

            // Validate the payload
            const validatedInstance = await this.validatePayload(entity, payload);

            this.logger.debug(`Finally creating ${entity} with data: ${JSON.stringify(validatedInstance)}`);

            // Create a new entity with the data
            await this.prismaEntityMap[entity].create({ data: validatedInstance });
        }
    }

    async deleteEntity(entityName: string, data: any): Promise<void> {
        // Convert the entityName to lowercase to match the Prisma model name
        const entity = entityName.toLowerCase();
        let payloadData: any;
        try {
            payloadData = data.data.data;
        } catch (error: unknown) {
            payloadData = data;
        }

        // Extract necessary information from data
        const globalId = payloadData.globalId; // replace with your actual logic

        // Find the entity in the database using the Prisma model
        const existingEntity = await this.prismaEntityMap[entity].findMany({ where: { globalId: globalId } });
        this.logger.debug(`Existing entity: ${JSON.stringify(existingEntity)}`);

        // If the entity exists, delete it
        if (existingEntity && existingEntity.length > 0) {
            this.logger.debug(`Deleting ${entity} with globalId: ${globalId}`);
            await this.prismaEntityMap[entity].delete({ where: { globalId: globalId } });
        }
    }

    private convertToConnectPrismaFormat(nestedEntityName: string, nestedEntity: Record<string, unknown>): Record<string, unknown> {
        // get the id from the nested entity via the globalId field
        const globalId = nestedEntity.globalId;
        const id = this.prismaEntityMap[nestedEntityName.toLowerCase()].findUnique({ where: { globalId: globalId } }).id;
        // Convert the entity to the "{connect: {id: ...}}" format
        return { connect: { id: id } };
    }

    private convertToWhereUniquePrismaFormat(nestedEntityName: string, nestedEntity: Record<string, unknown>): Record<string, unknown> {
        // get the id from the nested entity via the globalId field
        this.logger.debug(`Nested entity ${nestedEntity}`)
        const globalId = nestedEntity.globalId;
        const id = this.prismaEntityMap[nestedEntityName.toLowerCase()].findUnique({ where: { globalId: globalId } }).id;
        // Convert the entity to the "{where: {id:...}}" format
        // if the id is not found, return an empty object
        if (!id) {
            return {};
        } else {
            return { where: { id: id } };
        }
    }
}