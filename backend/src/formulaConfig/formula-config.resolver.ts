import { Resolver, Query, Mutation, Args } from "@nestjs/graphql";
import { UseGuards, Logger } from "@nestjs/common";
import { UseRoles } from "nest-access-control";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import { GqlACGuard } from "../auth/gqlAC.guard";
import { FormulaConfigService } from "./formula-config.service";
import {
  FormulaVariableGraphQL,
  FormulaFunctionGraphQL,
  CreateFormulaVariableInput,
  UpdateFormulaVariableInput,
  CreateFormulaFunctionInput,
  UpdateFormulaFunctionInput,
} from "./dto/formula-config.dto";

@Resolver()
@UseGuards(GqlDefaultAuthGuard, GqlACGuard)
export class FormulaConfigResolver {
  private readonly logger = new Logger(FormulaConfigResolver.name);

  constructor(private readonly formulaConfigService: FormulaConfigService) {}

  // ==================== Variables ====================

  /**
   * Get all active formula variables
   */
  @Query(() => [FormulaVariableGraphQL], {
    name: "formulaVariables",
    description: "Get all active formula variables",
  })
  @UseRoles({
    resource: "FormulaLibrary",
    action: "read",
    possession: "any",
  })
  async getActiveVariables(): Promise<FormulaVariableGraphQL[]> {
    this.logger.debug("Getting active formula variables");
    return this.formulaConfigService.getActiveVariables() as any;
  }

  /**
   * Get all formula variables (including inactive) - admin only
   */
  @Query(() => [FormulaVariableGraphQL], {
    name: "formulaVariablesAll",
    description: "Get all formula variables including inactive (admin)",
  })
  @UseRoles({
    resource: "FormulaLibrary",
    action: "read",
    possession: "any",
  })
  async getAllVariables(): Promise<FormulaVariableGraphQL[]> {
    this.logger.debug("Getting all formula variables");
    return this.formulaConfigService.getAllVariables() as any;
  }

  /**
   * Create a new formula variable
   */
  @Mutation(() => FormulaVariableGraphQL, {
    name: "createFormulaVariable",
    description: "Create a new formula variable",
  })
  @UseRoles({
    resource: "FormulaLibrary",
    action: "create",
    possession: "any",
  })
  async createVariable(
    @Args("input") input: CreateFormulaVariableInput
  ): Promise<FormulaVariableGraphQL> {
    this.logger.log(`Creating formula variable: ${input.name}`);
    return this.formulaConfigService.createVariable(input) as any;
  }

  /**
   * Update an existing formula variable
   */
  @Mutation(() => FormulaVariableGraphQL, {
    name: "updateFormulaVariable",
    description: "Update an existing formula variable",
  })
  @UseRoles({
    resource: "FormulaLibrary",
    action: "update",
    possession: "any",
  })
  async updateVariable(
    @Args("id") id: string,
    @Args("input") input: UpdateFormulaVariableInput
  ): Promise<FormulaVariableGraphQL> {
    this.logger.log(`Updating formula variable: ${id}`);
    return this.formulaConfigService.updateVariable(id, input) as any;
  }

  /**
   * Delete a formula variable (only non-system)
   */
  @Mutation(() => FormulaVariableGraphQL, {
    name: "deleteFormulaVariable",
    description: "Delete a formula variable (cannot delete system variables)",
  })
  @UseRoles({
    resource: "FormulaLibrary",
    action: "delete",
    possession: "any",
  })
  async deleteVariable(
    @Args("id") id: string
  ): Promise<FormulaVariableGraphQL> {
    this.logger.log(`Deleting formula variable: ${id}`);
    return this.formulaConfigService.deleteVariable(id) as any;
  }

  // ==================== Functions ====================

  /**
   * Get all active formula functions
   */
  @Query(() => [FormulaFunctionGraphQL], {
    name: "formulaFunctions",
    description: "Get all active formula functions",
  })
  @UseRoles({
    resource: "FormulaLibrary",
    action: "read",
    possession: "any",
  })
  async getActiveFunctions(): Promise<FormulaFunctionGraphQL[]> {
    this.logger.debug("Getting active formula functions");
    return this.formulaConfigService.getActiveFunctions() as any;
  }

  /**
   * Get all formula functions (including inactive) - admin only
   */
  @Query(() => [FormulaFunctionGraphQL], {
    name: "formulaFunctionsAll",
    description: "Get all formula functions including inactive (admin)",
  })
  @UseRoles({
    resource: "FormulaLibrary",
    action: "read",
    possession: "any",
  })
  async getAllFunctions(): Promise<FormulaFunctionGraphQL[]> {
    this.logger.debug("Getting all formula functions");
    return this.formulaConfigService.getAllFunctions() as any;
  }

  /**
   * Create a new formula function
   */
  @Mutation(() => FormulaFunctionGraphQL, {
    name: "createFormulaFunction",
    description: "Create a new formula function",
  })
  @UseRoles({
    resource: "FormulaLibrary",
    action: "create",
    possession: "any",
  })
  async createFunction(
    @Args("input") input: CreateFormulaFunctionInput
  ): Promise<FormulaFunctionGraphQL> {
    this.logger.log(`Creating formula function: ${input.name}`);
    return this.formulaConfigService.createFunction(input) as any;
  }

  /**
   * Update an existing formula function
   */
  @Mutation(() => FormulaFunctionGraphQL, {
    name: "updateFormulaFunction",
    description: "Update an existing formula function",
  })
  @UseRoles({
    resource: "FormulaLibrary",
    action: "update",
    possession: "any",
  })
  async updateFunction(
    @Args("id") id: string,
    @Args("input") input: UpdateFormulaFunctionInput
  ): Promise<FormulaFunctionGraphQL> {
    this.logger.log(`Updating formula function: ${id}`);
    return this.formulaConfigService.updateFunction(id, input) as any;
  }

  /**
   * Delete a formula function (only non-system)
   */
  @Mutation(() => FormulaFunctionGraphQL, {
    name: "deleteFormulaFunction",
    description: "Delete a formula function (cannot delete system functions)",
  })
  @UseRoles({
    resource: "FormulaLibrary",
    action: "delete",
    possession: "any",
  })
  async deleteFunction(
    @Args("id") id: string
  ): Promise<FormulaFunctionGraphQL> {
    this.logger.log(`Deleting formula function: ${id}`);
    return this.formulaConfigService.deleteFunction(id) as any;
  }
}
