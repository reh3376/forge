import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BatchServiceBase } from "./base/batch.service.base";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { WhMessageBrokerTopics } from "../rabbitmq/topics";
import { Batch, Prisma } from "@prisma/client";
import { BatchIdCreateInput } from "./BatchIdCreateInput";
import { BatchCreateInput } from "./base/BatchCreateInput";

@Injectable()
export class BatchService extends BatchServiceBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly rabbitProducer: RabbitMQProducerService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger
  ) {
    super(prisma);
  }

  private operationsMapping: { [key: string]: string } = {
    Mashing01: "MAS",
    Fermentation01: "FER",
    Distillation01: "DIS",
    Processing01: "DPR",
    Granary01: "GRN",
  };

  private validateBatchId(batchId: string): void {
    const operationAcronymRegex = new RegExp(`^(\\w+)`);
    const dateCodeRegex = new RegExp(`^\\w+\\.\\d{2}[A-L][0-3][0-9]`);
    const indexRegex = new RegExp(`^\\w+\\.\\d{2}[A-L][0-3][0-9]\\d{3}$`);

    if (!operationAcronymRegex.test(batchId)) {
      throw new Error(`Invalid operation acronym in batchId: ${batchId}`);
    }

    const operationAcronymMatch = batchId.match(operationAcronymRegex);
    if (!operationAcronymMatch) {
      throw new Error(`Invalid operation acronym in batchId: ${batchId}`);
    }
    const operationAcronym = operationAcronymMatch[1];
    const operation = Object.values(this.operationsMapping).includes(
      operationAcronym
    );
    if (!operation) {
      throw new Error(`Invalid operation in batchId: ${batchId}`);
    }

    if (!dateCodeRegex.test(batchId)) {
      throw new Error(`Invalid date code in batchId: ${batchId}`);
    }

    if (!indexRegex.test(batchId)) {
      throw new Error(`Invalid index in batchId: ${batchId}`);
    }
  }

  async createRecipeBomItems(recipeName: string): Promise<void> {
    const recipe = await this.prisma.recipe.findFirst({
      where: {
        Recipe: recipeName,
      },
      include: {
        recipeBoms: {
          include: {
            recipeBomITem: true,
          },
        },
      },
    });

    if (!recipe || !recipe.recipeBoms.length) {
      throw new Error(`Recipe ${recipeName} not found or has no BOMs`);
    }
    for (const recipeBom of recipe.recipeBoms) {
      for (const recipeBomItem of recipeBom.recipeBomITem) {
        this.prisma.recipeBomItem.create({
          data: {
            createdBy: recipeBomItem.createdBy,
            globalId: recipeBomItem.globalId,
            id: recipeBomItem.id,
            isClassDefinition: false,
            itemId: recipeBomItem.itemId,
            operation: recipeBomItem.operation,
            quantity: recipeBomItem.quantity,
            // units: recipeBomItem.units,
            updatedBy: recipeBomItem.updatedBy,
          },
        });
      }
    }
  }

  async updateBatchRecipeBomItemQuantities(
    batchId: string,
    items: { [itemId: string]: number }
  ): Promise<Batch> {
    const batchData = await this.prisma.batch.findUnique({
      where: {
        id: batchId,
      },
    });

    if (!batchData) {
      throw new Error(`Batch not found for batchId: ${batchId}`);
    }

    for (const itemId of Object.keys(items)) {
      const recipeBomItem = await this.prisma.recipeBomItem.findFirst({
        where: {
          itemId: itemId,
        },
      });

      if (!recipeBomItem) {
        throw new Error(
          `RecipeBomItem not found for recipeBomItemId: ${itemId}`
        );
      }

      // Update the quantity
      await this.prisma.recipeBomItem.update({
        where: {
          id: recipeBomItem.id,
        },
        data: {
          quantity: items[itemId],
        },
      });
    }

    // find the batch and return
    return batchData;
  }

  async createBatch<T extends Prisma.BatchCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.BatchCreateArgs>
  ): Promise<Batch> {
    this.validateBatchId(args.data.batchId);
    const batch = await super.createBatch(args);
    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Batch,
      {
        event_type: "create",
        data: batch,
      }
    );

    this.logger.verbose({
      message: `Created Batch: ${batch.batchId} & pushed to topic`,
    });
    // this.logger.verbose({
    //   message: `Creating recipe bom items for recipe: ${args.data.recipeName}`,
    // });
    // if (args.data.recipeName) {
    //   this.createRecipeBomItems(args.data.recipeName);
    // }
    return batch;
  }

  async updateBatch<T extends Prisma.BatchUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.BatchUpdateArgs>
  ): Promise<Batch> {
    if (args.data && typeof args.data.batchId === "string") {
      this.validateBatchId(args.data.batchId);
    }
    const batch = await super.updateBatch(args);

    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Batch,
      {
        event_type: "update",
        data: batch,
      }
    );

    this.logger.verbose(
      `Updated Batch: ${args.data.batchId} & pushed to topic`
    );

    return batch;
  }
  async deleteBatch<T extends Prisma.BatchDeleteArgs>(
    args: Prisma.SelectSubset<T, Prisma.BatchDeleteArgs>
  ): Promise<Batch> {
    const batch = await super.deleteBatch(args);

    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Batch,
      {
        event_type: "delete",
        data: batch,
      }
    );

    this.logger.verbose(`Deleted Batch: ${batch} & pushed to topic`);
    return batch;
  }

  async GetBatchId(args: BatchIdCreateInput): Promise<Batch> {
    /* Generation function for batch entities and the batch field being of the form "WHK01.FER.24H15.0000"
    where 24 is the year
    H is the month, in this case August, which is the 8th letter in the alphabet
    28 is the day, in this case 28th of the month
    X is a sequential number, starting from one
     */

    const acronym = this.operationsMapping[args.operation];
    if (!acronym) {
      throw new Error(`Unknown operation: ${args.operation}`);
    }
    // const site = "WHK01";
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String.fromCharCode(64 + date.getMonth() + 1); // Convert month number to letter
    const day = date.getDate().toString().padStart(2, "0");

    // const batchIdPrefix = `${site}.${acronym}.${year}${month}${day}`;
    const batchIdPrefix = `${acronym}.${year}${month}${day}`;

    const lastBatch: Batch[] = await this.batches({
      where: {
        batchId: {
          startsWith: batchIdPrefix,
        },
      },
      orderBy: {
        batchId: "desc",
      },
      take: 1,
    });
    const lastBatchIdIndex =
      lastBatch.length > 0
        ? parseInt(lastBatch[0].batchId.split(".").pop()?.slice(-3) || "0")
        : -1;
    const newIndex = `${lastBatchIdIndex + 1}`.padStart(3, "0");
    const writeBatchData: BatchCreateInput = {
      batchId: `${batchIdPrefix}${newIndex}`,
      // operation: args.operation,
      batchData: args.batchData,
      asset: args.asset,
    };
    return await this.createBatch({
      data: {
        ...writeBatchData,
        ...(args.asset
          ? {
              asset: {
                connect: {
                  id: args.asset.id,
                },
              },
            }
          : { asset: undefined }),
        customer: undefined,
        productionOrderRecipeInstance: undefined,
        parent: undefined,
        lot: undefined,
      },
      include: {
        asset: true,
        parent: true,
        lot: true,
      },
    });
  }
}
