import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ExpressionEngineService } from "../expressionEngine/expression-engine.service";
import {
  FormulaLibrary,
  FormulaLibraryVersion,
  FormulaTestCase,
} from "@prisma/client";

export interface CreateFormulaInput {
  name: string;
  expression: string;
  description?: string;
  category?: string;
  tags?: string[];
  documentation?: string;
  exampleInputs?: Record<string, any>;
  expectedOutputs?: Record<string, number>;
  createdBy: string;
}

export interface UpdateFormulaInput {
  name?: string;
  expression?: string;
  description?: string;
  category?: string;
  tags?: string[];
  documentation?: string;
  isActive?: boolean;
  changeReason?: string;
  updatedBy: string;
}

export interface TestCaseInput {
  name: string;
  inputs: Record<string, any>;
  expectedOutput: number;
  tolerance?: number;
}

@Injectable()
export class FormulaLibraryService {
  private readonly logger = new Logger(FormulaLibraryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly expressionEngine: ExpressionEngineService
  ) {}

  /**
   * Create new formula with validation
   */
  async create(input: CreateFormulaInput): Promise<FormulaLibrary> {
    // Validate expression
    const validation = this.expressionEngine.validate(input.expression);

    if (!validation.isValid) {
      throw new ConflictException(
        `Invalid expression: ${validation.errors.join(", ")}`
      );
    }

    // Check for duplicate name
    const existing = await this.prisma.formulaLibrary.findUnique({
      where: { name: input.name },
    });

    if (existing) {
      throw new ConflictException(
        `Formula with name "${input.name}" already exists`
      );
    }

    // Create formula
    const formula = await this.prisma.formulaLibrary.create({
      data: {
        name: input.name,
        expression: input.expression,
        description: input.description,
        category: input.category,
        tags: input.tags || [],
        documentation: input.documentation,
        exampleInputs: input.exampleInputs || {},
        expectedOutputs: input.expectedOutputs || {},
        createdBy: input.createdBy,
        requiredVariables: validation.requiredVariables,
        optionalVariables: validation.detectedVariables.filter(
          (v) => !validation.requiredVariables.includes(v)
        ),
        version: 1,
      },
    });

    // Create initial version record
    await this.createVersion(formula, "Initial version", input.createdBy);

    this.logger.log(`Created formula: ${formula.name} (ID: ${formula.id})`);
    return formula;
  }

  /**
   * Update formula (creates new version if expression changed)
   */
  async update(id: string, input: UpdateFormulaInput): Promise<FormulaLibrary> {
    const existing = await this.findById(id);

    // If expression changed, validate it
    if (input.expression && input.expression !== existing.expression) {
      const validation = this.expressionEngine.validate(input.expression);

      if (!validation.isValid) {
        throw new ConflictException(
          `Invalid expression: ${validation.errors.join(", ")}`
        );
      }
    }

    // Check if name changed and conflicts
    if (input.name && input.name !== existing.name) {
      const nameConflict = await this.prisma.formulaLibrary.findUnique({
        where: { name: input.name },
      });

      if (nameConflict) {
        throw new ConflictException(
          `Formula with name "${input.name}" already exists`
        );
      }
    }

    // Update formula
    const updated = await this.prisma.formulaLibrary.update({
      where: { id },
      data: {
        name: input.name,
        expression: input.expression,
        description: input.description,
        category: input.category,
        tags: input.tags,
        documentation: input.documentation,
        isActive: input.isActive,
        updatedBy: input.updatedBy,
        version:
          input.expression && input.expression !== existing.expression
            ? existing.version + 1
            : existing.version,
      },
    });

    // Create version record if expression changed
    if (input.expression && input.expression !== existing.expression) {
      await this.createVersion(
        updated,
        input.changeReason || "Expression updated",
        input.updatedBy
      );
      this.logger.log(
        `Updated formula: ${updated.name} to version ${updated.version}`
      );
    } else {
      this.logger.log(`Updated formula metadata: ${updated.name}`);
    }

    return updated;
  }

  /**
   * Create version record for audit trail
   */
  private async createVersion(
    formula: FormulaLibrary,
    changeReason: string,
    createdBy: string
  ): Promise<FormulaLibraryVersion> {
    return this.prisma.formulaLibraryVersion.create({
      data: {
        formulaId: formula.id,
        version: formula.version,
        expression: formula.expression,
        description: formula.description,
        changeReason,
        createdBy,
        snapshot: formula as any,
      },
    });
  }

  /**
   * Find formula by ID
   */
  async findById(id: string): Promise<
    FormulaLibrary & {
      versions?: FormulaLibraryVersion[];
      testCases?: FormulaTestCase[];
    }
  > {
    const formula = await this.prisma.formulaLibrary.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 5,
        },
        testCases: true,
      },
    });

    if (!formula) {
      throw new NotFoundException(`Formula not found: ${id}`);
    }

    return formula;
  }

  /**
   * Search formulas
   */
  async search(filters: {
    category?: string;
    tags?: string[];
    query?: string;
    isActive?: boolean;
  }): Promise<FormulaLibrary[]> {
    const where: any = {};

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.tags && filters.tags.length > 0) {
      where.tags = { hasSome: filters.tags };
    }

    if (filters.query) {
      where.OR = [
        { name: { contains: filters.query, mode: "insensitive" } },
        { description: { contains: filters.query, mode: "insensitive" } },
      ];
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    return this.prisma.formulaLibrary.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });
  }

  /**
   * Delete formula (soft delete by marking inactive)
   */
  async delete(id: string, userId: string): Promise<FormulaLibrary> {
    const formula = await this.findById(id);

    const updated = await this.prisma.formulaLibrary.update({
      where: { id },
      data: {
        isActive: false,
        updatedBy: userId,
      },
    });

    this.logger.log(`Deactivated formula: ${formula.name} (ID: ${id})`);
    return updated;
  }

  /**
   * Add test case to formula
   */
  async addTestCase(
    formulaId: string,
    input: TestCaseInput,
    createdBy: string
  ): Promise<FormulaTestCase> {
    const formula = await this.findById(formulaId);

    // Run test immediately
    const result = await this.expressionEngine.evaluate(
      formula.expression,
      input.inputs
    );

    const passed =
      result.success &&
      Math.abs((result.value || 0) - input.expectedOutput) <=
        (input.tolerance || 0.01);

    const testCase = await this.prisma.formulaTestCase.create({
      data: {
        formulaId,
        name: input.name,
        inputs: input.inputs,
        expectedOutput: input.expectedOutput,
        tolerance: input.tolerance,
        createdBy,
        lastRunAt: new Date(),
        lastRunPassed: passed,
        lastRunOutput: result.value,
      },
    });

    this.logger.log(
      `Added test case "${input.name}" to formula ${formula.name}: ${
        passed ? "PASSED" : "FAILED"
      }`
    );
    return testCase;
  }

  /**
   * Update an existing test case
   */
  async updateTestCase(
    testCaseId: string,
    input: Partial<TestCaseInput>,
    updatedBy: string
  ): Promise<FormulaTestCase> {
    const existing = await this.prisma.formulaTestCase.findUnique({
      where: { id: testCaseId },
      include: { formula: true },
    });

    if (!existing) {
      throw new NotFoundException(`Test case not found: ${testCaseId}`);
    }

    // Build update data
    const updateData: any = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.inputs !== undefined) updateData.inputs = input.inputs;
    if (input.expectedOutput !== undefined)
      updateData.expectedOutput = input.expectedOutput;
    if (input.tolerance !== undefined) updateData.tolerance = input.tolerance;

    // Re-run the test with updated inputs
    const testInputs = input.inputs ?? existing.inputs;
    const expectedOutput = input.expectedOutput ?? existing.expectedOutput;
    const tolerance = input.tolerance ?? existing.tolerance ?? 0.01;

    const result = await this.expressionEngine.evaluate(
      existing.formula.expression,
      testInputs as Record<string, any>
    );

    const passed =
      result.success &&
      Math.abs((result.value || 0) - expectedOutput) <= tolerance;

    const updated = await this.prisma.formulaTestCase.update({
      where: { id: testCaseId },
      data: {
        ...updateData,
        lastRunAt: new Date(),
        lastRunPassed: passed,
        lastRunOutput: result.value,
      },
    });

    this.logger.log(
      `Updated test case "${updated.name}": ${passed ? "PASSED" : "FAILED"}`
    );
    return updated;
  }

  /**
   * Delete a test case
   */
  async deleteTestCase(testCaseId: string): Promise<FormulaTestCase> {
    const existing = await this.prisma.formulaTestCase.findUnique({
      where: { id: testCaseId },
    });

    if (!existing) {
      throw new NotFoundException(`Test case not found: ${testCaseId}`);
    }

    const deleted = await this.prisma.formulaTestCase.delete({
      where: { id: testCaseId },
    });

    this.logger.log(`Deleted test case "${deleted.name}" (ID: ${testCaseId})`);
    return deleted;
  }

  /**
   * Run all test cases for a formula
   */
  async runTests(
    formulaId: string
  ): Promise<{ passed: number; failed: number; total: number }> {
    const formula = await this.findById(formulaId);
    const testCases = await this.prisma.formulaTestCase.findMany({
      where: { formulaId },
    });

    let passed = 0;
    let failed = 0;

    for (const testCase of testCases) {
      const result = await this.expressionEngine.evaluate(
        formula.expression,
        testCase.inputs as any
      );

      const testPassed =
        result.success &&
        Math.abs((result.value || 0) - testCase.expectedOutput) <=
          (testCase.tolerance || 0.01);

      if (testPassed) {
        passed++;
      } else {
        failed++;
      }

      // Update test case
      await this.prisma.formulaTestCase.update({
        where: { id: testCase.id },
        data: {
          lastRunAt: new Date(),
          lastRunPassed: testPassed,
          lastRunOutput: result.value,
        },
      });
    }

    this.logger.log(
      `Ran ${testCases.length} tests for formula ${formula.name}: ${passed} passed, ${failed} failed`
    );
    return { passed, failed, total: testCases.length };
  }

  /**
   * Get formula usage statistics
   */
  async getUsageStats(formulaId: string): Promise<{
    usageCount: number;
    lastUsed?: Date;
    avgExecutionTime?: number;
  }> {
    const executions = await this.prisma.formulaExecutionLog.findMany({
      where: { formulaId },
      orderBy: { executedAt: "desc" },
      take: 100,
    });

    const avgExecutionTime =
      executions.length > 0
        ? executions.reduce((sum, e) => sum + (e.executionTimeMs || 0), 0) /
          executions.length
        : undefined;

    return {
      usageCount: executions.length,
      lastUsed: executions[0]?.executedAt,
      avgExecutionTime,
    };
  }
}
