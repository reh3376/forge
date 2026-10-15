import { Resolver, Query, Mutation, Args } from "@nestjs/graphql";
import { UseGuards, Logger } from "@nestjs/common";
import { UseRoles } from "nest-access-control";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import { GqlACGuard } from "../auth/gqlAC.guard";
import { FormulaLibraryService } from "./formula-library.service";
import { ExpressionEngineService } from "../expressionEngine/expression-engine.service";
import {
  FormulaLibraryGraphQL,
  ValidationResultGraphQL,
  ExpressionResultGraphQL,
  TestResultsGraphQL,
  UsageStatsGraphQL,
  FormulaTestCaseGraphQL,
  CreateFormulaInput,
  UpdateFormulaInput,
  FormulaSearchFilters,
  TestCaseInput,
  UpdateTestCaseInput,
  EvaluateExpressionInput,
} from "./dto/formula-library.dto";

@Resolver(() => FormulaLibraryGraphQL)
@UseGuards(GqlDefaultAuthGuard, GqlACGuard)
export class FormulaLibraryResolver {
  private readonly logger = new Logger(FormulaLibraryResolver.name);

  constructor(
    private readonly formulaLibraryService: FormulaLibraryService,
    private readonly expressionEngine: ExpressionEngineService
  ) {}

  /**
   * Get a single formula by ID
   */
  @Query(() => FormulaLibraryGraphQL, {
    name: "formulaLibrary",
    description: "Get a formula by ID with versions and test cases",
  })
  @UseRoles({
    resource: "FormulaLibrary",
    action: "read",
    possession: "any",
  })
  async getFormula(@Args("id") id: string): Promise<FormulaLibraryGraphQL> {
    this.logger.debug(`Getting formula: ${id}`);
    return this.formulaLibraryService.findById(id) as any;
  }

  /**
   * Search formulas with filters
   */
  @Query(() => [FormulaLibraryGraphQL], {
    name: "formulaLibraries",
    description: "Search formulas with optional filters",
  })
  @UseRoles({
    resource: "FormulaLibrary",
    action: "read",
    possession: "any",
  })
  async searchFormulas(
    @Args({ name: "filters", nullable: true }) filters?: FormulaSearchFilters
  ): Promise<FormulaLibraryGraphQL[]> {
    this.logger.debug(
      `Searching formulas with filters: ${JSON.stringify(filters)}`
    );
    return this.formulaLibraryService.search(filters || {}) as any;
  }

  /**
   * Create a new formula
   */
  @Mutation(() => FormulaLibraryGraphQL, {
    name: "createFormula",
    description: "Create a new formula with validation",
  })
  @UseRoles({
    resource: "FormulaLibrary",
    action: "create",
    possession: "any",
  })
  async createFormula(
    @Args("input") input: CreateFormulaInput
  ): Promise<FormulaLibraryGraphQL> {
    this.logger.log(
      `Creating formula: ${input.name} by user: ${input.createdBy}`
    );
    return this.formulaLibraryService.create(input) as any;
  }

  /**
   * Update an existing formula
   */
  @Mutation(() => FormulaLibraryGraphQL, {
    name: "updateFormula",
    description: "Update a formula (creates new version if expression changed)",
  })
  @UseRoles({
    resource: "FormulaLibrary",
    action: "update",
    possession: "any",
  })
  async updateFormula(
    @Args("id") id: string,
    @Args("input") input: UpdateFormulaInput
  ): Promise<FormulaLibraryGraphQL> {
    this.logger.log(`Updating formula: ${id} by user: ${input.updatedBy}`);
    return this.formulaLibraryService.update(id, input) as any;
  }

  /**
   * Delete (deactivate) a formula
   */
  @Mutation(() => FormulaLibraryGraphQL, {
    name: "deleteFormula",
    description: "Soft delete a formula by marking it inactive",
  })
  @UseRoles({
    resource: "FormulaLibrary",
    action: "delete",
    possession: "any",
  })
  async deleteFormula(
    @Args("id") id: string,
    @Args("deletedBy") deletedBy: string
  ): Promise<FormulaLibraryGraphQL> {
    this.logger.log(`Deleting formula: ${id} by user: ${deletedBy}`);
    return this.formulaLibraryService.delete(id, deletedBy) as any;
  }

  /**
   * Validate an expression without saving it
   */
  @Query(() => ValidationResultGraphQL, {
    name: "validateExpression",
    description: "Validate expression syntax and detect variables",
  })
  @UseRoles({
    resource: "FormulaLibrary",
    action: "read",
    possession: "any",
  })
  async validateExpression(
    @Args("expression") expression: string
  ): Promise<ValidationResultGraphQL> {
    this.logger.debug(`Validating expression: ${expression}`);
    return this.expressionEngine.validate(expression);
  }

  /**
   * Evaluate an expression with context for preview
   */
  @Mutation(() => ExpressionResultGraphQL, {
    name: "evaluateExpression",
    description: "Evaluate an expression with provided context for preview",
  })
  @UseRoles({
    resource: "FormulaLibrary",
    action: "read",
    possession: "any",
  })
  async evaluateExpression(
    @Args("input") input: EvaluateExpressionInput
  ): Promise<ExpressionResultGraphQL> {
    this.logger.debug(`Evaluating expression: ${input.expression}`);
    return this.expressionEngine.evaluate(input.expression, input.context);
  }

  /**
   * Add a test case to a formula
   */
  @Mutation(() => FormulaTestCaseGraphQL, {
    name: "addTestCase",
    description: "Add a test case to a formula and run it immediately",
  })
  @UseRoles({
    resource: "FormulaLibrary",
    action: "update",
    possession: "any",
  })
  async addTestCase(
    @Args("formulaId") formulaId: string,
    @Args("input") input: TestCaseInput
  ): Promise<FormulaTestCaseGraphQL> {
    this.logger.log(
      `Adding test case "${input.name}" to formula: ${formulaId}`
    );
    return this.formulaLibraryService.addTestCase(
      formulaId,
      input,
      input.createdBy
    ) as any;
  }

  /**
   * Update an existing test case
   */
  @Mutation(() => FormulaTestCaseGraphQL, {
    name: "updateTestCase",
    description: "Update a test case and re-run it immediately",
  })
  @UseRoles({
    resource: "FormulaLibrary",
    action: "update",
    possession: "any",
  })
  async updateTestCase(
    @Args("testCaseId") testCaseId: string,
    @Args("input") input: UpdateTestCaseInput
  ): Promise<FormulaTestCaseGraphQL> {
    this.logger.log(`Updating test case: ${testCaseId}`);
    return this.formulaLibraryService.updateTestCase(
      testCaseId,
      input,
      input.updatedBy
    ) as any;
  }

  /**
   * Delete a test case
   */
  @Mutation(() => FormulaTestCaseGraphQL, {
    name: "deleteTestCase",
    description: "Delete a test case from a formula",
  })
  @UseRoles({
    resource: "FormulaLibrary",
    action: "delete",
    possession: "any",
  })
  async deleteTestCase(
    @Args("testCaseId") testCaseId: string
  ): Promise<FormulaTestCaseGraphQL> {
    this.logger.log(`Deleting test case: ${testCaseId}`);
    return this.formulaLibraryService.deleteTestCase(testCaseId) as any;
  }

  /**
   * Run all test cases for a formula
   */
  @Mutation(() => TestResultsGraphQL, {
    name: "runFormulaTests",
    description: "Run all test cases for a formula and return results",
  })
  @UseRoles({
    resource: "FormulaLibrary",
    action: "read",
    possession: "any",
  })
  async runFormulaTests(
    @Args("formulaId") formulaId: string
  ): Promise<TestResultsGraphQL> {
    this.logger.log(`Running tests for formula: ${formulaId}`);
    return this.formulaLibraryService.runTests(formulaId);
  }

  /**
   * Get usage statistics for a formula
   */
  @Query(() => UsageStatsGraphQL, {
    name: "formulaUsageStats",
    description: "Get usage statistics for a formula",
  })
  @UseRoles({
    resource: "FormulaLibrary",
    action: "read",
    possession: "any",
  })
  async getUsageStats(
    @Args("formulaId") formulaId: string
  ): Promise<UsageStatsGraphQL> {
    this.logger.debug(`Getting usage stats for formula: ${formulaId}`);
    return this.formulaLibraryService.getUsageStats(formulaId);
  }
}
