import { Resolver, Query, Mutation, Args, Int } from "@nestjs/graphql";
import { GrainCharacterService } from "./grainCharacter.service";
import { GrainCharacter as GrainCharacterModel } from "@prisma/client";
import GraphQLJSON from "graphql-type-json";

@Resolver("GrainCharacter")
export class GrainCharacterResolver {
  constructor(private readonly service: GrainCharacterService) {}

  @Query(() => [GraphQLJSON])
  async grainCharacters(
    @Args("where", { nullable: true, type: () => GraphQLJSON }) where?: any,
    @Args("orderBy", { nullable: true, type: () => GraphQLJSON }) orderBy?: any,
    @Args("take", { nullable: true, type: () => Int }) take?: number,
    @Args("skip", { nullable: true, type: () => Int }) skip?: number
  ): Promise<GrainCharacterModel[]> {
    return this.service.findAll({
      where,
      orderBy,
      take,
      skip,
    });
  }

  @Query(() => [GraphQLJSON])
  async activeGrainCharacters(): Promise<GrainCharacterModel[]> {
    return this.service.findAllActive();
  }

  @Query(() => GraphQLJSON, { nullable: true })
  async grainCharacter(
    @Args("id") id: string
  ): Promise<GrainCharacterModel | null> {
    return this.service.findOne(id);
  }

  @Query(() => GraphQLJSON, { nullable: true })
  async grainCharacterByAbbreviation(
    @Args("abbreviation") abbreviation: string,
    @Args("varietyCode", { nullable: true }) varietyCode?: string
  ): Promise<GrainCharacterModel | null> {
    return this.service.findByAbbreviation(abbreviation, varietyCode);
  }

  @Query(() => [String])
  async grainAbbreviations(): Promise<string[]> {
    return this.service.getAbbreviations();
  }

  @Query(() => GraphQLJSON)
  async grainCharacterUsage(@Args("id") id: string): Promise<{
    recipeCount: number;
    activeRecipeCount: number;
    canDelete: boolean;
    canModify: boolean;
  }> {
    const [recipeCount, activeRecipes, itemGroupCount] = await Promise.all([
      this.service.getRecipeUsageCount(id),
      this.service.getActiveRecipeUsage(id),
      this.service.prisma.itemGroup.count({
        where: { grainCharacterId: id },
      }),
    ]);

    return {
      recipeCount,
      activeRecipeCount: activeRecipes.length,
      canDelete: recipeCount === 0 && itemGroupCount === 0,
      canModify: activeRecipes.length === 0,
    };
  }

  @Mutation(() => GraphQLJSON)
  async createGrainCharacter(
    @Args("data", { type: () => GraphQLJSON })
    data: {
      abbreviation: string;
      name: string;
      varietyCode?: string;
      description?: string;
      active?: boolean;
    }
  ): Promise<GrainCharacterModel> {
    return this.service.create(data);
  }

  @Mutation(() => GraphQLJSON)
  async updateGrainCharacter(
    @Args("id") id: string,
    @Args("data", { type: () => GraphQLJSON })
    data: {
      abbreviation?: string;
      name?: string;
      varietyCode?: string;
      description?: string;
      active?: boolean;
    }
  ): Promise<GrainCharacterModel> {
    return this.service.update(id, data);
  }

  @Mutation(() => GraphQLJSON)
  async deleteGrainCharacter(
    @Args("id") id: string
  ): Promise<GrainCharacterModel> {
    return this.service.delete(id);
  }

  @Mutation(() => GraphQLJSON)
  async setGrainCharacterActive(
    @Args("id") id: string,
    @Args("active") active: boolean
  ): Promise<GrainCharacterModel> {
    return this.service.setActive(id, active);
  }

  @Mutation(() => GraphQLJSON)
  async linkItemGroupsToGrainCharacter(
    @Args("grainCharacterId") grainCharacterId: string,
    @Args("itemGroupIds", { type: () => [String] }) itemGroupIds: string[]
  ): Promise<{ linked: number; unlinked: number }> {
    return this.service.linkItemGroups(grainCharacterId, itemGroupIds);
  }
}
