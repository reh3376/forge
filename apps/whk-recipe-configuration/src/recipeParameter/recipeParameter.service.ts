import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RecipeParameterServiceBase } from "./base/recipeParameter.service.base";

@Injectable()
export class RecipeParameterService extends RecipeParameterServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
