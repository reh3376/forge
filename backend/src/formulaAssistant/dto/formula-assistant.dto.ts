import { Field, InputType, ObjectType } from "@nestjs/graphql";

@InputType()
export class FormulaAssistantMessage {
  @Field(() => String)
  role!: string;

  @Field(() => String)
  content!: string;
}

@InputType()
export class FormulaAssistantChatInput {
  @Field(() => [FormulaAssistantMessage])
  messages!: FormulaAssistantMessage[];
}

@ObjectType()
export class FormulaAssistantResponse {
  @Field(() => String)
  content!: string;

  @Field(() => String)
  role!: string;
}
