import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RecipeServiceBase } from "./base/recipe.service.base";
import { Prisma } from "@prisma/client";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import { WhMessageBrokerTopics } from "../rabbitmq/topics";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";

@Injectable()
export class RecipeService extends RecipeServiceBase {
  constructor(
    protected readonly prisma: PrismaService,
    private rabbitProducer: RabbitMQProducerService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger
  ) {
    super(prisma);
  }

  async createRecipe<T extends Prisma.RecipeCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.RecipeCreateArgs>
  ): Promise<import(".prisma/client").Recipe> {
    const recipe = await super.createRecipe({
      data: {
        ...args.data,
      },
      include: {
        ...args.include,
        item: true,
        customer: true,
        recipeGroup: true,
        recipeBoms: true,
        unitProcedures: true,
        productionOrders: true,
      },
    });
    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Recipe,
      {
        recordName: "Recipe",
        event_type: "create",
        data: recipe,
      }
    );
    this.logger.log(`Created Recipe: ${recipe.id} & pushed to topic`);
    return recipe;
  }

  async updateRecipe<T extends Prisma.RecipeUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.RecipeUpdateArgs>
  ): Promise<import(".prisma/client").Recipe> {
    const recipe = await super.updateRecipe({
      data: {
        ...args.data,
      },
      include: {
        ...args.include,
        item: true,
        customer: true,
        recipeGroup: true,
        recipeBoms: true,
        unitProcedures: true,
        productionOrders: true,
      },
      where: args.where,
    });
    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Recipe,
      {
        recordName: "Recipe",
        event_type: "update",
        data: recipe,
      }
    );
    this.logger.log(`Updated Recipe: ${recipe.id} & pushed to topic`);
    return recipe;
  }

  /**
   * Retrieves active recipes from the database.
   *
   * This method fetches recipes that are associated with active production orders.
   * It joins the Recipe table with ProductionOrder, ScheduleOrder, and ScheduleOrderQueue tables
   * to get the relevant information.
   *
   * @author: Patrick Mannion
   * @date: 2024-10-07
   * @returns {Promise<any[]>} A promise that resolves to an array of active recipe objects.
   * Each object contains recipe details along with the creation date from ScheduleOrderQueue.
   *
   * @throws {Error} If there's an issue with the database query or connection.
   */
  async getActiveRecipes() {
    const query = `
      SELECT
          soq."createdAt" as ScheduledAt,
          pro.name as ProductionOrderNumber,
          pro.id as ProductionOrderId,
          r. *,
          i."itemNumber"
      FROM "Recipe" r
      JOIN public."ProductionOrder" PO on r.id = PO."recipeId"
      JOIN public."ScheduleOrder" SO on PO."scheduleOrderId" = SO.id
      JOIN public."ScheduleOrderQueue" SOQ on SO."scheduleOrderQueueId" = SOQ.id
      JOIN public."ProductionOrder" pro on pro."scheduleOrderId" = so.id
      JOIN public."Item" i on pro."fgItemId" = i.id
      WHERE SoQ."queueIndex" <= 0
      ORDER BY SoQ."createdAt"`;
    const recipes = await this.prisma.$queryRaw<any>(Prisma.sql([query]));
    return recipes;
  }
}
