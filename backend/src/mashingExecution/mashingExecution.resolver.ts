import {
  Resolver,
  Query,
  Mutation,
  Args,
  Field,
  InputType,
} from "@nestjs/graphql";
import { UseGuards, BadRequestException } from "@nestjs/common";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import { GqlACGuard } from "../auth/gqlAC.guard";
import { MashingExecutionService } from "./mashingExecution.service";
import { MashingStepActualsInput } from "./dto/mashing-step-actuals.input";
import { MashingStateResponse } from "./dto/mashing-state-response";
import {
  StepExecutionOutput,
  MashingStepCompletionResult,
} from "./dto/mashing-step-completion-result";

@InputType()
class PauseMashingStepInput {
  @Field()
  stepExecutionId!: string;

  @Field({ nullable: true })
  reason?: string;
}

@InputType()
class HoldMashingStepInput {
  @Field()
  stepExecutionId!: string;

  @Field()
  reason!: string;
}

@InputType()
class AbortMashingStepInput {
  @Field()
  stepExecutionId!: string;

  @Field()
  reason!: string;
}

@InputType()
class CompleteMashingStepInput {
  @Field()
  stepExecutionId!: string;

  @Field(() => MashingStepActualsInput)
  actuals!: MashingStepActualsInput;
}

@Resolver()
@UseGuards(GqlDefaultAuthGuard, GqlACGuard)
export class MashingExecutionResolver {
  constructor(private readonly service: MashingExecutionService) {}

  @Query(() => MashingStateResponse, { name: "mashingState" })
  async getMashingState(
    @Args("scheduleOrderId") scheduleOrderId: string
  ): Promise<any> {
    return this.service.getMashingState(scheduleOrderId);
  }

  @Query(() => StepExecutionOutput, {
    nullable: true,
    name: "mashingStepExecution",
  })
  async getMashingStepExecution(
    @Args("scheduleOrderId") scheduleOrderId: string,
    @Args("mashingProtocolStepId") mashingProtocolStepId: string
  ): Promise<StepExecutionOutput | null> {
    const result = await this.service.getMashingStepExecution(
      scheduleOrderId,
      mashingProtocolStepId
    );
    if (!result) return null;

    return {
      id: result.id,
      batchId: result.batchId,
      phase: result.phase,
      stepIndex: result.stepIndex,
      stepName: result.stepName,
      state: result.state,
      previousState: result.previousState || undefined,
      actualStartTime: result.actualStartTime || undefined,
      actualEndTime: result.actualEndTime || undefined,
      actualDuration: result.actualDuration || undefined,
      startedBy: result.startedBy || undefined,
      completedBy: result.completedBy || undefined,
      createdAt: result.createdAt,
    };
  }

  @Mutation(() => StepExecutionOutput, { name: "startMashingStep" })
  async startMashingStep(
    @Args("scheduleOrderId") scheduleOrderId: string,
    @Args("mashingProtocolStepId") mashingProtocolStepId: string
  ): Promise<StepExecutionOutput> {
    const result = await this.service.startMashingStep(
      scheduleOrderId,
      mashingProtocolStepId
    );
    return {
      id: result.id,
      batchId: result.batchId,
      phase: result.phase,
      stepIndex: result.stepIndex,
      stepName: result.stepName,
      state: result.state,
      previousState: result.previousState || undefined,
      actualStartTime: result.actualStartTime || undefined,
      actualEndTime: result.actualEndTime || undefined,
      actualDuration: result.actualDuration || undefined,
      startedBy: result.startedBy || undefined,
      completedBy: result.completedBy || undefined,
      createdAt: result.createdAt,
    };
  }

  @Mutation(() => MashingStepCompletionResult, {
    name: "completeMashingStep",
  })
  async completeMashingStep(
    @Args("input") input: CompleteMashingStepInput
  ): Promise<MashingStepCompletionResult> {
    return this.service.completeMashingStep(
      input.stepExecutionId,
      input.actuals
    );
  }

  @Mutation(() => StepExecutionOutput, { name: "pauseMashingStep" })
  async pauseMashingStep(
    @Args("input") input: PauseMashingStepInput
  ): Promise<StepExecutionOutput> {
    const result = await this.service.pauseMashingStep(
      input.stepExecutionId,
      input.reason
    );
    return {
      id: result.id,
      batchId: result.batchId,
      phase: result.phase,
      stepIndex: result.stepIndex,
      stepName: result.stepName,
      state: result.state,
      previousState: result.previousState || undefined,
      actualStartTime: result.actualStartTime || undefined,
      actualEndTime: result.actualEndTime || undefined,
      actualDuration: result.actualDuration || undefined,
      startedBy: result.startedBy || undefined,
      completedBy: result.completedBy || undefined,
      createdAt: result.createdAt,
    };
  }

  @Mutation(() => StepExecutionOutput, { name: "resumeMashingStep" })
  async resumeMashingStep(
    @Args("stepExecutionId") stepExecutionId: string
  ): Promise<StepExecutionOutput> {
    const result = await this.service.resumeMashingStep(stepExecutionId);
    return {
      id: result.id,
      batchId: result.batchId,
      phase: result.phase,
      stepIndex: result.stepIndex,
      stepName: result.stepName,
      state: result.state,
      previousState: result.previousState || undefined,
      actualStartTime: result.actualStartTime || undefined,
      actualEndTime: result.actualEndTime || undefined,
      actualDuration: result.actualDuration || undefined,
      startedBy: result.startedBy || undefined,
      completedBy: result.completedBy || undefined,
      createdAt: result.createdAt,
    };
  }

  @Mutation(() => StepExecutionOutput, { name: "holdMashingStep" })
  async holdMashingStep(
    @Args("input") input: HoldMashingStepInput
  ): Promise<StepExecutionOutput> {
    if (!input.reason) {
      throw new BadRequestException("Reason is required when holding a step");
    }
    const result = await this.service.holdMashingStep(
      input.stepExecutionId,
      input.reason
    );
    return {
      id: result.id,
      batchId: result.batchId,
      phase: result.phase,
      stepIndex: result.stepIndex,
      stepName: result.stepName,
      state: result.state,
      previousState: result.previousState || undefined,
      actualStartTime: result.actualStartTime || undefined,
      actualEndTime: result.actualEndTime || undefined,
      actualDuration: result.actualDuration || undefined,
      startedBy: result.startedBy || undefined,
      completedBy: result.completedBy || undefined,
      createdAt: result.createdAt,
    };
  }

  @Mutation(() => StepExecutionOutput, { name: "abortMashingStep" })
  async abortMashingStep(
    @Args("input") input: AbortMashingStepInput
  ): Promise<StepExecutionOutput> {
    if (!input.reason) {
      throw new BadRequestException("Reason is required when aborting a step");
    }
    const result = await this.service.abortMashingStep(
      input.stepExecutionId,
      input.reason
    );
    return {
      id: result.id,
      batchId: result.batchId,
      phase: result.phase,
      stepIndex: result.stepIndex,
      stepName: result.stepName,
      state: result.state,
      previousState: result.previousState || undefined,
      actualStartTime: result.actualStartTime || undefined,
      actualEndTime: result.actualEndTime || undefined,
      actualDuration: result.actualDuration || undefined,
      startedBy: result.startedBy || undefined,
      completedBy: result.completedBy || undefined,
      createdAt: result.createdAt,
    };
  }
}
