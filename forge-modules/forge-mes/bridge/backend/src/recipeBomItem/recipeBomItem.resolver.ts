import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { GraphQLError } from "graphql";
import { isRecordNotFoundError } from "../prisma.util";
import { RecipeBomItemResolverBase } from "./base/recipeBomItem.resolver.base";
import { RecipeBomItem } from "./base/RecipeBomItem";
import { RecipeBomItemService } from "./recipeBomItem.service";
import { InjectRolesBuilder, UseRoles } from "nest-access-control";
import { AclFilterResponseInterceptor } from "../interceptors/aclFilterResponse.interceptor";
import { AclValidateRequestInterceptor } from "../interceptors/aclValidateRequest.interceptor";
import { Units } from "../units/base/Units";
import { GraphQLJSON } from "graphql-type-json";
import {
  EnumBomCalculationMode,
  EnumBomFormulaType,
} from "./dto/bom-formula-config.dto";
import {
  RecipeBomItemCreateInputExtended,
  CreateRecipeBomItemArgsExtended,
} from "./dto/RecipeBomItemCreateInputExtended";
import {
  RecipeBomItemUpdateInputExtended,
  UpdateRecipeBomItemArgsExtended,
} from "./dto/RecipeBomItemUpdateInputExtended";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => RecipeBomItem)
export class RecipeBomItemResolver extends RecipeBomItemResolverBase {
  private readonly logger = new common.Logger(RecipeBomItemResolver.name);

  constructor(
    protected readonly service: RecipeBomItemService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }

  /**
   * Override getDisplayUnits to add debugging for the missing units issue
   */
  @common.UseInterceptors(AclFilterResponseInterceptor)
  @graphql.ResolveField(() => Units, {
    nullable: true,
    name: "displayUnits",
  })
  @UseRoles({
    resource: "Units",
    action: "read",
    possession: "any",
  })
  async getDisplayUnits(
    @graphql.Parent() parent: RecipeBomItem,
    @graphql.Context() context?: any
  ): Promise<Units | null> {
    // Log context information
    const user = context?.req?.user;
    this.logger.log(
      `🔍 getDisplayUnits called for RecipeBomItem: ${parent.id}`
    );
    this.logger.log(
      `🔍 User: ${user?.username || "UNKNOWN"}, Roles: ${JSON.stringify(
        user?.roles || "NONE"
      )}`
    );

    const result = await this.service.getDisplayUnits(parent.id);

    this.logger.log(
      `🔍 getDisplayUnits result for ${parent.id}: ${
        result
          ? `${result.id} (${result.name}, ${result.abbreviation})`
          : "NULL"
      }`
    );

    if (!result) {
      this.logger.warn(
        `⚠️  No displayUnits found for RecipeBomItem ${parent.id}`
      );
    }

    return result;
  }

  // ==================== Formula Configuration Fields ====================

  @graphql.ResolveField(() => EnumBomCalculationMode, {
    nullable: true,
    name: "calculationMode",
    description: "BOM item calculation mode for quantity derivation",
  })
  @UseRoles({
    resource: "RecipeBomItem",
    action: "read",
    possession: "any",
  })
  async getCalculationMode(
    @graphql.Parent() parent: RecipeBomItem
  ): Promise<EnumBomCalculationMode | null> {
    const result = await this.service.recipeBomItem({
      where: { id: parent.id },
    });
    if (!result || !result.calculationMode) return null;
    return result.calculationMode as EnumBomCalculationMode;
  }

  @graphql.ResolveField(() => EnumBomFormulaType, {
    nullable: true,
    name: "formulaType",
    description: "Type of formula calculation",
  })
  @UseRoles({
    resource: "RecipeBomItem",
    action: "read",
    possession: "any",
  })
  async getFormulaType(
    @graphql.Parent() parent: RecipeBomItem
  ): Promise<EnumBomFormulaType | null> {
    const result = await this.service.recipeBomItem({
      where: { id: parent.id },
    });
    if (!result || !result.formulaType) return null;
    return result.formulaType as EnumBomFormulaType;
  }

  @graphql.ResolveField(() => Number, {
    nullable: true,
    name: "formulaMultiplier",
    description: "Multiplier for formula calculation (e.g., 0.70 for 70%)",
  })
  @UseRoles({
    resource: "RecipeBomItem",
    action: "read",
    possession: "any",
  })
  async getFormulaMultiplier(
    @graphql.Parent() parent: RecipeBomItem
  ): Promise<number | null> {
    const result = await this.service.recipeBomItem({
      where: { id: parent.id },
    });
    return result?.formulaMultiplier ?? null;
  }

  @graphql.ResolveField(() => String, {
    nullable: true,
    name: "customExpression",
    description: "Custom expression for EXPRESSION calculation mode",
  })
  @UseRoles({
    resource: "RecipeBomItem",
    action: "read",
    possession: "any",
  })
  async getCustomExpression(
    @graphql.Parent() parent: RecipeBomItem
  ): Promise<string | null> {
    const result = await this.service.recipeBomItem({
      where: { id: parent.id },
    });
    return result?.customExpression ?? null;
  }

  @graphql.ResolveField(() => String, {
    nullable: true,
    name: "formulaLibraryId",
    description: "Link to a FormulaLibrary entry",
  })
  @UseRoles({
    resource: "RecipeBomItem",
    action: "read",
    possession: "any",
  })
  async getFormulaLibraryId(
    @graphql.Parent() parent: RecipeBomItem
  ): Promise<string | null> {
    const result = await this.service.recipeBomItem({
      where: { id: parent.id },
    });
    return result?.formulaLibraryId ?? null;
  }

  @graphql.ResolveField(() => GraphQLJSON, {
    nullable: true,
    name: "expressionVariables",
    description: "Variables for expression evaluation",
  })
  @UseRoles({
    resource: "RecipeBomItem",
    action: "read",
    possession: "any",
  })
  async getExpressionVariables(
    @graphql.Parent() parent: RecipeBomItem
  ): Promise<Record<string, any> | null> {
    const result = await this.service.recipeBomItem({
      where: { id: parent.id },
    });
    return result?.expressionVariables as Record<string, any> | null;
  }

  @graphql.ResolveField(() => Boolean, {
    nullable: true,
    name: "expressionValidated",
    description: "Whether the expression has been validated",
  })
  @UseRoles({
    resource: "RecipeBomItem",
    action: "read",
    possession: "any",
  })
  async getExpressionValidated(
    @graphql.Parent() parent: RecipeBomItem
  ): Promise<boolean | null> {
    const result = await this.service.recipeBomItem({
      where: { id: parent.id },
    });
    return result?.expressionValidated ?? null;
  }

  // ==================== Extended Mutations with Formula Fields ====================

  /**
   * Create a RecipeBomItem with formula configuration fields.
   * This mutation extends the base create mutation to include formula fields.
   */
  @common.UseInterceptors(AclValidateRequestInterceptor)
  @graphql.Mutation(() => RecipeBomItem, {
    name: "createRecipeBomItemWithFormula",
    description: "Create a RecipeBomItem with formula configuration fields",
  })
  @UseRoles({
    resource: "RecipeBomItem",
    action: "create",
    possession: "any",
  })
  async createRecipeBomItemWithFormula(
    @graphql.Args() args: CreateRecipeBomItemArgsExtended
  ): Promise<RecipeBomItem> {
    const { data } = args;

    // Extract formula fields from the extended input
    const {
      calculationMode,
      formulaType,
      formulaMultiplier,
      customExpression,
      formulaLibraryId,
      expressionVariables,
      expressionValidated,
      activeInstance,
      classId,
      displayUnits,
      item,
      recipeBoms,
      ...restData
    } = data;

    // Build the Prisma create input with formula fields
    const prismaData: any = {
      ...restData,
      // Formula fields (passed directly to Prisma)
      calculationMode,
      formulaType,
      formulaMultiplier,
      customExpression,
      formulaLibraryId,
      expressionVariables,
      expressionValidated,
      // Relations (use connect pattern)
      activeInstance: activeInstance ? { connect: activeInstance } : undefined,
      classId: classId ? { connect: classId } : undefined,
      displayUnits: displayUnits ? { connect: displayUnits } : undefined,
      item: item ? { connect: item } : undefined,
      recipeBoms: recipeBoms ? { connect: recipeBoms } : undefined,
    };

    this.logger.log(
      `Creating RecipeBomItem with formula config: mode=${calculationMode}, type=${formulaType}, multiplier=${formulaMultiplier}`
    );

    return await this.service.createRecipeBomItem({ data: prismaData });
  }

  /**
   * Update a RecipeBomItem with formula configuration fields.
   * This mutation extends the base update mutation to include formula fields.
   */
  @common.UseInterceptors(AclValidateRequestInterceptor)
  @graphql.Mutation(() => RecipeBomItem, {
    name: "updateRecipeBomItemWithFormula",
    description: "Update a RecipeBomItem with formula configuration fields",
  })
  @UseRoles({
    resource: "RecipeBomItem",
    action: "update",
    possession: "any",
  })
  async updateRecipeBomItemWithFormula(
    @graphql.Args() args: UpdateRecipeBomItemArgsExtended
  ): Promise<RecipeBomItem | null> {
    const { where, data } = args;

    // Extract formula fields from the extended input
    const {
      calculationMode,
      formulaType,
      formulaMultiplier,
      customExpression,
      formulaLibraryId,
      expressionVariables,
      expressionValidated,
      activeInstance,
      classId,
      displayUnits,
      item,
      recipeBoms,
      ...restData
    } = data;

    // Build the Prisma update input with formula fields
    const prismaData: any = {
      ...restData,
      // Formula fields (passed directly to Prisma)
      calculationMode,
      formulaType,
      formulaMultiplier,
      customExpression,
      formulaLibraryId,
      expressionVariables,
      expressionValidated,
      // Relations (use connect pattern)
      activeInstance: activeInstance ? { connect: activeInstance } : undefined,
      classId: classId ? { connect: classId } : undefined,
      displayUnits: displayUnits ? { connect: displayUnits } : undefined,
      item: item ? { connect: item } : undefined,
      recipeBoms: recipeBoms ? { connect: recipeBoms } : undefined,
    };

    this.logger.log(
      `Updating RecipeBomItem ${where.id} with formula config: mode=${calculationMode}, type=${formulaType}, multiplier=${formulaMultiplier}`
    );

    try {
      return await this.service.updateRecipeBomItem({
        where,
        data: prismaData,
      });
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new GraphQLError(
          `No resource was found for ${JSON.stringify(where)}`
        );
      }
      throw error;
    }
  }
}
