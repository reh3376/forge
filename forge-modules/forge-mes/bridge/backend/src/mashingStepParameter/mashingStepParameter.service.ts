import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  EnumMashingProtocolStepStepType,
  EnumMashingParameterType,
  MashingStepParameterDefinition,
  MashingStepParameterActual,
} from "@prisma/client";

export interface ParameterActualInput {
  parameterName: string;
  valuePlanned?: number | null;
  valueActual?: number | null;
  textValueActual?: string | null;
  booleanValueActual?: boolean | null;
  notes?: string | null;
}

export interface RecordParameterActualsResult {
  parameterActuals: MashingStepParameterActual[];
  deviations: ParameterDeviation[];
}

export interface ParameterDeviation {
  parameterName: string;
  deviationPercent: number;
  plannedValue: number;
  actualValue: number;
  threshold: number;
  unit?: string | null;
}

@Injectable()
export class MashingStepParameterService {
  private readonly logger = new Logger(MashingStepParameterService.name);

  /** In-memory cache: stepType -> definitions */
  private definitionCache = new Map<string, MashingStepParameterDefinition[]>();
  private cacheLoadedAt = 0;
  private readonly CACHE_TTL_MS = 30_000;

  constructor(private readonly prisma: PrismaService) {}

  private async ensureFreshCache(): Promise<void> {
    if (Date.now() - this.cacheLoadedAt > this.CACHE_TTL_MS) {
      await this.refreshCache();
    }
  }

  private async refreshCache(): Promise<void> {
    const definitions =
      await this.prisma.mashingStepParameterDefinition.findMany({
        orderBy: [{ stepType: "asc" }, { displayOrder: "asc" }],
      });

    this.definitionCache.clear();
    for (const def of definitions) {
      const key = def.stepType;
      if (!this.definitionCache.has(key)) {
        this.definitionCache.set(key, []);
      }
      this.definitionCache.get(key)!.push(def);
    }
    this.cacheLoadedAt = Date.now();
    this.logger.debug(
      `Refreshed parameter definition cache: ${definitions.length} definitions loaded`
    );
  }

  /**
   * Get parameter definitions for a specific step type.
   */
  async getParameterDefinitions(
    stepType: EnumMashingProtocolStepStepType
  ): Promise<MashingStepParameterDefinition[]> {
    await this.ensureFreshCache();
    return this.definitionCache.get(stepType) || [];
  }

  /**
   * Get all parameter definitions grouped by step type.
   */
  async getAllParameterDefinitions(): Promise<
    Record<string, MashingStepParameterDefinition[]>
  > {
    await this.ensureFreshCache();
    const result: Record<string, MashingStepParameterDefinition[]> = {};
    for (const [stepType, defs] of this.definitionCache.entries()) {
      result[stepType] = defs;
    }
    return result;
  }

  /**
   * Record parameter actuals with automatic deviation detection.
   * Returns the created actuals and any detected deviations.
   */
  async recordParameterActuals(
    mashingProtocolStepActualId: string,
    stepExecutionId: string | null,
    stepType: EnumMashingProtocolStepStepType,
    parameters: ParameterActualInput[],
    recordedBy: string
  ): Promise<RecordParameterActualsResult> {
    const definitions = await this.getParameterDefinitions(stepType);
    const parameterActuals: MashingStepParameterActual[] = [];
    const deviations: ParameterDeviation[] = [];

    for (const param of parameters) {
      const definition = definitions.find(
        (d) => d.parameterName === param.parameterName
      );

      // Calculate deviation for numeric parameters
      let deviationPercent: number | null = null;
      let isWithinTolerance: boolean | null = null;

      if (
        param.valuePlanned != null &&
        param.valueActual != null &&
        param.valuePlanned !== 0
      ) {
        deviationPercent =
          (Math.abs(param.valueActual - param.valuePlanned) /
            Math.abs(param.valuePlanned)) *
          100;

        if (definition?.deviationThreshold != null) {
          isWithinTolerance = deviationPercent <= definition.deviationThreshold;

          // Track out-of-tolerance deviations
          if (!isWithinTolerance) {
            deviations.push({
              parameterName: param.parameterName,
              deviationPercent,
              plannedValue: param.valuePlanned,
              actualValue: param.valueActual,
              threshold: definition.deviationThreshold,
              unit: definition.unit,
            });
          }
        }
      }

      const actual = await this.prisma.mashingStepParameterActual.create({
        data: {
          mashingProtocolStepActualId,
          stepExecutionId,
          parameterName: param.parameterName,
          valuePlanned: param.valuePlanned,
          valueActual: param.valueActual,
          textValueActual: param.textValueActual,
          booleanValueActual: param.booleanValueActual,
          deviationPercent,
          isWithinTolerance,
          recordedBy,
          notes: param.notes,
        },
      });

      parameterActuals.push(actual);
    }

    this.logger.debug(
      `Recorded ${parameterActuals.length} parameter actuals for step type ${stepType}, ` +
        `${deviations.length} deviation(s) detected`
    );

    return { parameterActuals, deviations };
  }

  /**
   * Get parameter actuals for a specific step execution.
   */
  async getParameterActualsForStep(
    mashingProtocolStepActualId: string
  ): Promise<MashingStepParameterActual[]> {
    return this.prisma.mashingStepParameterActual.findMany({
      where: { mashingProtocolStepActualId },
      orderBy: { parameterName: "asc" },
    });
  }

  /**
   * Get parameter actuals by step execution ID.
   */
  async getParameterActualsByStepExecution(
    stepExecutionId: string
  ): Promise<MashingStepParameterActual[]> {
    return this.prisma.mashingStepParameterActual.findMany({
      where: { stepExecutionId },
      orderBy: { parameterName: "asc" },
    });
  }

  // --- Definition CRUD (for admin/configuration) ---

  async createDefinition(
    data: {
      stepType: EnumMashingProtocolStepStepType;
      parameterName: string;
      displayName: string;
      parameterType: EnumMashingParameterType;
      description?: string;
      unit?: string;
      isRequired?: boolean;
      defaultValue?: string;
      validationMin?: number;
      validationMax?: number;
      deviationThreshold?: number;
      displayOrder?: number;
      category?: string;
      enumValues?: string[];
    },
    createdBy?: string
  ): Promise<MashingStepParameterDefinition> {
    const created = await this.prisma.mashingStepParameterDefinition.create({
      data: {
        stepType: data.stepType,
        parameterName: data.parameterName,
        displayName: data.displayName,
        parameterType: data.parameterType,
        description: data.description,
        unit: data.unit,
        isRequired: data.isRequired ?? true,
        defaultValue: data.defaultValue,
        validationMin: data.validationMin,
        validationMax: data.validationMax,
        deviationThreshold: data.deviationThreshold,
        displayOrder: data.displayOrder ?? 0,
        category: data.category,
        enumValues: data.enumValues || [],
        createdBy,
      },
    });

    // Invalidate cache
    this.cacheLoadedAt = 0;
    return created;
  }

  async updateDefinition(
    id: string,
    data: Partial<{
      displayName: string;
      description: string;
      unit: string;
      isRequired: boolean;
      defaultValue: string;
      validationMin: number;
      validationMax: number;
      deviationThreshold: number;
      displayOrder: number;
      category: string;
      enumValues: string[];
    }>,
    updatedBy?: string
  ): Promise<MashingStepParameterDefinition> {
    const updated = await this.prisma.mashingStepParameterDefinition.update({
      where: { id },
      data: {
        ...data,
        updatedBy,
      },
    });

    // Invalidate cache
    this.cacheLoadedAt = 0;
    return updated;
  }

  async deleteDefinition(id: string): Promise<MashingStepParameterDefinition> {
    const deleted = await this.prisma.mashingStepParameterDefinition.delete({
      where: { id },
    });

    // Invalidate cache
    this.cacheLoadedAt = 0;
    return deleted;
  }

  async findDefinitionById(
    id: string
  ): Promise<MashingStepParameterDefinition | null> {
    return this.prisma.mashingStepParameterDefinition.findUnique({
      where: { id },
    });
  }
}
