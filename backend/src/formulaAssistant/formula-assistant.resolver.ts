import { Args, Mutation, Resolver } from "@nestjs/graphql";
import { UseGuards } from "@nestjs/common";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import { FormulaAssistantService } from "./formula-assistant.service";
import {
  FormulaAssistantChatInput,
  FormulaAssistantResponse,
} from "./dto/formula-assistant.dto";

@Resolver()
@UseGuards(GqlDefaultAuthGuard)
export class FormulaAssistantResolver {
  constructor(private readonly service: FormulaAssistantService) {}

  @Mutation(() => FormulaAssistantResponse)
  async formulaAssistantChat(
    @Args("input") input: FormulaAssistantChatInput
  ): Promise<FormulaAssistantResponse> {
    return this.service.chat(input.messages);
  }
}
