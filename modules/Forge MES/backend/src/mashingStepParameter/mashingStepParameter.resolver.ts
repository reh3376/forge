import { Resolver, Query, Mutation, Args } from "@nestjs/graphql";
import { MashingStepParameterService } from "./mashingStepParameter.service";
import { EnumMashingProtocolStepStepType } from "../mashingProtocolStep/base/EnumMashingProtocolStepStepType";
import {
  MashingStepParameterDefinition,
  MashingStepParameterActual,
  MashingStepParameterDefinitionWhereUniqueInput,
  CreateMashingStepParameterDefinitionInput,
  UpdateMashingStepParameterDefinitionInput,
  EnumMashingParameterType,
} from "./dto/parameter-definition.types";

@Resolver(() => MashingStepParameterDefinition)
export class MashingStepParameterResolver {
  constructor(private readonly service: MashingStepParameterService) {}

  @Query(() => [MashingStepParameterDefinition], {
    name: "mashingStepParameterDefinitions",
    description: "Get parameter definitions for a specific mashing step type",
  })
  async getDefinitions(
    @Args("stepType", { type: () => EnumMashingProtocolStepStepType })
    stepType: EnumMashingProtocolStepStepType
  ): Promise<MashingStepParameterDefinition[]> {
    const definitions = await this.service.getParameterDefinitions(
      stepType as any
    );
    return definitions as any;
  }

  @Query(() => [[MashingStepParameterDefinition]], {
    name: "allMashingStepParameterDefinitions",
    description: "Get all parameter definitions grouped by step type",
  })
  async getAllDefinitions(): Promise<MashingStepParameterDefinition[][]> {
    const grouped = await this.service.getAllParameterDefinitions();
    return Object.values(grouped) as any;
  }

  @Query(() => [MashingStepParameterActual], {
    name: "mashingStepParameterActuals",
    description: "Get parameter actuals for a specific step execution",
  })
  async getActuals(
    @Args("mashingProtocolStepActualId") mashingProtocolStepActualId: string
  ): Promise<MashingStepParameterActual[]> {
    return this.service.getParameterActualsForStep(
      mashingProtocolStepActualId
    ) as any;
  }

  @Query(() => [MashingStepParameterActual], {
    name: "mashingStepParameterActualsByExecution",
    description: "Get parameter actuals by step execution ID",
  })
  async getActualsByExecution(
    @Args("stepExecutionId") stepExecutionId: string
  ): Promise<MashingStepParameterActual[]> {
    return this.service.getParameterActualsByStepExecution(
      stepExecutionId
    ) as any;
  }

  @Mutation(() => MashingStepParameterDefinition, {
    name: "createMashingStepParameterDefinition",
    description: "Create a new parameter definition for a mashing step type",
  })
  async createDefinition(
    @Args("data") data: CreateMashingStepParameterDefinitionInput,
    @Args("createdBy", { nullable: true }) createdBy?: string
  ): Promise<MashingStepParameterDefinition> {
    const created = await this.service.createDefinition(
      {
        stepType: data.stepType as any,
        parameterName: data.parameterName,
        displayName: data.displayName,
        parameterType: data.parameterType as any,
        description: data.description ?? undefined,
        unit: data.unit ?? undefined,
        isRequired: data.isRequired,
        defaultValue: data.defaultValue ?? undefined,
        validationMin: data.validationMin ?? undefined,
        validationMax: data.validationMax ?? undefined,
        deviationThreshold: data.deviationThreshold ?? undefined,
        displayOrder: data.displayOrder ?? undefined,
        category: data.category ?? undefined,
        enumValues: data.enumValues ?? undefined,
      },
      createdBy
    );
    return created as any;
  }

  @Mutation(() => MashingStepParameterDefinition, {
    name: "updateMashingStepParameterDefinition",
    description: "Update an existing parameter definition",
  })
  async updateDefinition(
    @Args("where") where: MashingStepParameterDefinitionWhereUniqueInput,
    @Args("data") data: UpdateMashingStepParameterDefinitionInput,
    @Args("updatedBy", { nullable: true }) updatedBy?: string
  ): Promise<MashingStepParameterDefinition> {
    const updated = await this.service.updateDefinition(
      where.id,
      {
        displayName: data.displayName ?? undefined,
        description: data.description ?? undefined,
        unit: data.unit ?? undefined,
        isRequired: data.isRequired ?? undefined,
        defaultValue: data.defaultValue ?? undefined,
        validationMin: data.validationMin ?? undefined,
        validationMax: data.validationMax ?? undefined,
        deviationThreshold: data.deviationThreshold ?? undefined,
        displayOrder: data.displayOrder ?? undefined,
        category: data.category ?? undefined,
        enumValues: data.enumValues ?? undefined,
      },
      updatedBy
    );
    return updated as any;
  }

  @Mutation(() => MashingStepParameterDefinition, {
    name: "deleteMashingStepParameterDefinition",
    description: "Delete a parameter definition",
  })
  async deleteDefinition(
    @Args("where") where: MashingStepParameterDefinitionWhereUniqueInput
  ): Promise<MashingStepParameterDefinition> {
    const deleted = await this.service.deleteDefinition(where.id);
    return deleted as any;
  }
}
