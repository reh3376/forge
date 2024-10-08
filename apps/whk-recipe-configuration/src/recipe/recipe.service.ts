import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RecipeServiceBase } from "./base/recipe.service.base";
import { Prisma } from "@prisma/client";

@Injectable()
export class RecipeService extends RecipeServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
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
          r. *
      FROM "Recipe" r
      JOIN public."ProductionOrder" PO on r.id = PO."recipeId"
      JOIN public."ScheduleOrder" SO on PO."scheduleOrderId" = SO.id
      JOIN public."ScheduleOrderQueue" SOQ on SO."scheduleOrderQueueId" = SOQ.id
      JOIN public."ProductionOrder" pro on pro."scheduleOrderId" = so.id
      WHERE SoQ."queueIndex" <= 0
      ORDER BY SoQ."createdAt"`;
    const recipes = await this.prisma.$queryRaw<any>(Prisma.sql([query]));
    return recipes;
  }
}
