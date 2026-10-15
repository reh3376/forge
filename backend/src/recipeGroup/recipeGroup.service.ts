import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RecipeGroupServiceBase } from "./base/recipeGroup.service.base";

@Injectable()
export class RecipeGroupService extends RecipeGroupServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
