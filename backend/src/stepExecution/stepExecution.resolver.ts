import { Resolver, Query, Mutation, Args } from "@nestjs/graphql";
import { UseGuards, BadRequestException } from "@nestjs/common";
import { UseRoles } from "nest-access-control";
import { GqlACGuard } from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import { StepExecutionService } from "./stepExecution.service";
import { CreateStepExecutionInput } from "./dto/create-step-execution.input";
import {
  StepStateTransitionInput,
  AllocateEquipmentInput,
} from "./dto/step-state-transition.input";
import { SfcStateResponse } from "./dto/sfc-state-response";
import { GraphQLJSON } from "graphql-type-json";

@Resolver()
@UseGuards(GqlDefaultAuthGuard, GqlACGuard)
export class StepExecutionResolver {
  constructor(private readonly service: StepExecutionService) {}

  @Query(() => SfcStateResponse, { name: "sfcState" })
  @UseRoles({
    resource: "StepExecution",
    action: "read",
    possession: "any",
  })
  async getSfcState(
    @Args("batchId") batchId: string
  ): Promise<SfcStateResponse> {
    return this.service.getSfcState(batchId) as any;
  }

  @Query(() => GraphQLJSON, { name: "stepExecutions" })
  @UseRoles({
    resource: "StepExecution",
    action: "read",
    possession: "any",
  })
  async getStepExecutions(
    @Args("batchId") batchId: string,
    @Args("phase", { nullable: true }) phase?: string
  ) {
    return this.service.getStepExecutions(batchId, phase);
  }

  @Query(() => GraphQLJSON, { nullable: true, name: "currentStep" })
  @UseRoles({
    resource: "StepExecution",
    action: "read",
    possession: "any",
  })
  async getCurrentStep(@Args("batchId") batchId: string) {
    return this.service.getCurrentStep(batchId);
  }

  @Mutation(() => GraphQLJSON)
  @UseRoles({
    resource: "StepExecution",
    action: "create",
    possession: "any",
  })
  async createStepExecution(@Args("input") input: CreateStepExecutionInput) {
    return this.service.createStepExecution(input);
  }

  @Mutation(() => GraphQLJSON)
  @UseRoles({
    resource: "StepExecution",
    action: "update",
    possession: "any",
  })
  async startStep(@Args("stepExecutionId") stepExecutionId: string) {
    return this.service.startStep(stepExecutionId);
  }

  @Mutation(() => GraphQLJSON)
  @UseRoles({
    resource: "StepExecution",
    action: "update",
    possession: "any",
  })
  async completeStep(@Args("stepExecutionId") stepExecutionId: string) {
    return this.service.completeStep(stepExecutionId);
  }

  @Mutation(() => GraphQLJSON)
  @UseRoles({
    resource: "StepExecution",
    action: "update",
    possession: "any",
  })
  async pauseStep(@Args("input") input: StepStateTransitionInput) {
    return this.service.pauseStep(input.stepExecutionId, input.reason);
  }

  @Mutation(() => GraphQLJSON)
  @UseRoles({
    resource: "StepExecution",
    action: "update",
    possession: "any",
  })
  async resumeStep(@Args("stepExecutionId") stepExecutionId: string) {
    return this.service.resumeStep(stepExecutionId);
  }

  @Mutation(() => GraphQLJSON)
  @UseRoles({
    resource: "StepExecution",
    action: "update",
    possession: "any",
  })
  async holdStep(@Args("input") input: StepStateTransitionInput) {
    if (!input.reason) {
      throw new BadRequestException("Reason is required for hold action");
    }
    return this.service.holdStep(input.stepExecutionId, input.reason);
  }

  @Mutation(() => GraphQLJSON)
  @UseRoles({
    resource: "StepExecution",
    action: "update",
    possession: "any",
  })
  async abortStep(@Args("input") input: StepStateTransitionInput) {
    if (!input.reason) {
      throw new BadRequestException("Reason is required for abort action");
    }
    return this.service.abortStep(input.stepExecutionId, input.reason);
  }

  @Mutation(() => GraphQLJSON)
  @UseRoles({
    resource: "StepExecution",
    action: "update",
    possession: "any",
  })
  async allocateStepEquipment(@Args("input") input: AllocateEquipmentInput) {
    return this.service.allocateEquipment(
      input.stepExecutionId,
      input.assetId,
      input.equipmentMode
    );
  }
}
