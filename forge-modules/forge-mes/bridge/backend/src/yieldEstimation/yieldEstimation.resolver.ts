import { Resolver, Query, Args } from "@nestjs/graphql";
import { YieldEstimationService } from "./yieldEstimation.service";
import {
  YieldEstimateResult,
  YieldEstimateInput,
} from "./dto/yield-estimation.types";

@Resolver()
export class YieldEstimationResolver {
  constructor(private readonly service: YieldEstimationService) {}

  @Query(() => YieldEstimateResult, {
    name: "previewYieldEstimate",
    description: "Preview yield calculation without persisting",
  })
  async previewYieldEstimate(
    @Args("input") input: YieldEstimateInput
  ): Promise<YieldEstimateResult> {
    return this.service.previewYieldEstimate({
      whiskeyType: input.whiskeyType as any,
      totalBarrels: input.totalBarrels,
      entryProof: input.entryProof,
      containerType: input.containerType,
      grainPerCook: input.grainPerCook,
      cooksPerFerm: input.cooksPerFerm,
      yieldRateOverride: input.yieldRateOverride,
    }) as unknown as YieldEstimateResult;
  }
}
