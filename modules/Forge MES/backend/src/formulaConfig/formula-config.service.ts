import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { FormulaVariable, FormulaFunction } from "@prisma/client";

export interface CreateVariableInput {
  name: string;
  displayName: string;
  description?: string;
  type?: string;
  defaultValue?: string;
  category?: string;
  sortOrder?: number;
}

export interface UpdateVariableInput {
  name?: string;
  displayName?: string;
  description?: string;
  type?: string;
  defaultValue?: string;
  category?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface CreateFunctionInput {
  name: string;
  syntax: string;
  description?: string;
  category?: string;
  exampleUsage?: string;
  sortOrder?: number;
  // Implementation configuration
  implementationType?: string;
  expression?: string;
  fromUnitId?: string;
  toUnitId?: string;
}

export interface UpdateFunctionInput {
  name?: string;
  syntax?: string;
  description?: string;
  category?: string;
  exampleUsage?: string;
  sortOrder?: number;
  isActive?: boolean;
  // Implementation configuration
  implementationType?: string;
  expression?: string;
  fromUnitId?: string;
  toUnitId?: string;
}

// Type for function with unit relations
export type FormulaFunctionWithUnits = FormulaFunction & {
  fromUnit?: { id: string; name: string; abbreviation: string } | null;
  toUnit?: { id: string; name: string; abbreviation: string } | null;
};

@Injectable()
export class FormulaConfigService {
  private readonly logger = new Logger(FormulaConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== Variables ====================

  /**
   * Get all active formula variables
   */
  async getActiveVariables(): Promise<FormulaVariable[]> {
    return this.prisma.formulaVariable.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
  }

  /**
   * Get all formula variables (including inactive)
   */
  async getAllVariables(): Promise<FormulaVariable[]> {
    return this.prisma.formulaVariable.findMany({
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
  }

  /**
   * Get a single variable by ID
   */
  async getVariableById(id: string): Promise<FormulaVariable> {
    const variable = await this.prisma.formulaVariable.findUnique({
      where: { id },
    });

    if (!variable) {
      throw new NotFoundException(`Formula variable not found: ${id}`);
    }

    return variable;
  }

  /**
   * Create a new formula variable
   */
  async createVariable(input: CreateVariableInput): Promise<FormulaVariable> {
    // Check for duplicate name
    const existing = await this.prisma.formulaVariable.findUnique({
      where: { name: input.name },
    });

    if (existing) {
      throw new ConflictException(
        `Variable with name "${input.name}" already exists`
      );
    }

    const variable = await this.prisma.formulaVariable.create({
      data: {
        name: input.name,
        displayName: input.displayName,
        description: input.description,
        type: input.type || "number",
        defaultValue: input.defaultValue,
        category: input.category || "General",
        sortOrder: input.sortOrder || 0,
        isSystem: false,
      },
    });

    this.logger.log(`Created formula variable: ${variable.name}`);
    return variable;
  }

  /**
   * Update a formula variable
   */
  async updateVariable(
    id: string,
    input: UpdateVariableInput
  ): Promise<FormulaVariable> {
    const existing = await this.getVariableById(id);

    // Check if name is being changed and conflicts
    if (input.name && input.name !== existing.name) {
      const nameConflict = await this.prisma.formulaVariable.findUnique({
        where: { name: input.name },
      });

      if (nameConflict) {
        throw new ConflictException(
          `Variable with name "${input.name}" already exists`
        );
      }
    }

    const updated = await this.prisma.formulaVariable.update({
      where: { id },
      data: {
        name: input.name,
        displayName: input.displayName,
        description: input.description,
        type: input.type,
        defaultValue: input.defaultValue,
        category: input.category,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      },
    });

    this.logger.log(`Updated formula variable: ${updated.name}`);
    return updated;
  }

  /**
   * Delete a formula variable (only if not system)
   */
  async deleteVariable(id: string): Promise<FormulaVariable> {
    const existing = await this.getVariableById(id);

    if (existing.isSystem) {
      throw new BadRequestException(
        `Cannot delete system variable: ${existing.name}`
      );
    }

    const deleted = await this.prisma.formulaVariable.delete({
      where: { id },
    });

    this.logger.log(`Deleted formula variable: ${deleted.name}`);
    return deleted;
  }

  // ==================== Functions ====================

  // Select fields for unit relations
  private readonly unitSelect = {
    id: true,
    name: true,
    abbreviation: true,
  };

  /**
   * Get all active formula functions
   */
  async getActiveFunctions(): Promise<FormulaFunctionWithUnits[]> {
    return this.prisma.formulaFunction.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: {
        fromUnit: { select: this.unitSelect },
        toUnit: { select: this.unitSelect },
      },
    });
  }

  /**
   * Get all formula functions (including inactive)
   */
  async getAllFunctions(): Promise<FormulaFunctionWithUnits[]> {
    return this.prisma.formulaFunction.findMany({
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: {
        fromUnit: { select: this.unitSelect },
        toUnit: { select: this.unitSelect },
      },
    });
  }

  /**
   * Get a single function by ID
   */
  async getFunctionById(id: string): Promise<FormulaFunctionWithUnits> {
    const func = await this.prisma.formulaFunction.findUnique({
      where: { id },
      include: {
        fromUnit: { select: this.unitSelect },
        toUnit: { select: this.unitSelect },
      },
    });

    if (!func) {
      throw new NotFoundException(`Formula function not found: ${id}`);
    }

    return func;
  }

  /**
   * Create a new formula function
   */
  async createFunction(
    input: CreateFunctionInput
  ): Promise<FormulaFunctionWithUnits> {
    // Check for duplicate name
    const existing = await this.prisma.formulaFunction.findUnique({
      where: { name: input.name },
    });

    if (existing) {
      throw new ConflictException(
        `Function with name "${input.name}" already exists`
      );
    }

    // Validate implementation configuration
    const implementationType = input.implementationType || "EXPRESSION";
    if (implementationType === "EXPRESSION" && !input.expression) {
      throw new BadRequestException(
        "Expression is required for EXPRESSION implementation type"
      );
    }
    if (
      implementationType === "UNIT_CONVERSION" &&
      (!input.fromUnitId || !input.toUnitId)
    ) {
      throw new BadRequestException(
        "fromUnitId and toUnitId are required for UNIT_CONVERSION implementation type"
      );
    }

    const func = await this.prisma.formulaFunction.create({
      data: {
        name: input.name,
        syntax: input.syntax,
        description: input.description,
        category: input.category || "Conversion",
        exampleUsage: input.exampleUsage,
        sortOrder: input.sortOrder || 0,
        isSystem: false,
        implementationType,
        expression: input.expression,
        fromUnitId: input.fromUnitId,
        toUnitId: input.toUnitId,
      },
      include: {
        fromUnit: { select: this.unitSelect },
        toUnit: { select: this.unitSelect },
      },
    });

    this.logger.log(
      `Created formula function: ${func.name} (type: ${implementationType})`
    );
    return func;
  }

  /**
   * Update a formula function
   */
  async updateFunction(
    id: string,
    input: UpdateFunctionInput
  ): Promise<FormulaFunctionWithUnits> {
    const existing = await this.getFunctionById(id);

    // Check if name is being changed and conflicts
    if (input.name && input.name !== existing.name) {
      const nameConflict = await this.prisma.formulaFunction.findUnique({
        where: { name: input.name },
      });

      if (nameConflict) {
        throw new ConflictException(
          `Function with name "${input.name}" already exists`
        );
      }
    }

    // Validate implementation configuration if changing type
    const implementationType =
      input.implementationType || existing.implementationType;
    if (
      input.implementationType === "EXPRESSION" &&
      !input.expression &&
      !existing.expression
    ) {
      throw new BadRequestException(
        "Expression is required for EXPRESSION implementation type"
      );
    }
    if (input.implementationType === "UNIT_CONVERSION") {
      const fromUnitId = input.fromUnitId ?? existing.fromUnitId;
      const toUnitId = input.toUnitId ?? existing.toUnitId;
      if (!fromUnitId || !toUnitId) {
        throw new BadRequestException(
          "fromUnitId and toUnitId are required for UNIT_CONVERSION implementation type"
        );
      }
    }

    const updated = await this.prisma.formulaFunction.update({
      where: { id },
      data: {
        name: input.name,
        syntax: input.syntax,
        description: input.description,
        category: input.category,
        exampleUsage: input.exampleUsage,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
        implementationType: input.implementationType,
        expression: input.expression,
        fromUnitId: input.fromUnitId,
        toUnitId: input.toUnitId,
      },
      include: {
        fromUnit: { select: this.unitSelect },
        toUnit: { select: this.unitSelect },
      },
    });

    this.logger.log(`Updated formula function: ${updated.name}`);
    return updated;
  }

  /**
   * Delete a formula function (only if not system)
   */
  async deleteFunction(id: string): Promise<FormulaFunction> {
    const existing = await this.getFunctionById(id);

    if (existing.isSystem) {
      throw new BadRequestException(
        `Cannot delete system function: ${existing.name}`
      );
    }

    const deleted = await this.prisma.formulaFunction.delete({
      where: { id },
    });

    this.logger.log(`Deleted formula function: ${deleted.name}`);
    return deleted;
  }
}
