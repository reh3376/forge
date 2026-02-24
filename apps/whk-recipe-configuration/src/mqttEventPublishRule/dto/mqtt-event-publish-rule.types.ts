import {
  ObjectType,
  Field,
  Int,
  InputType,
  registerEnumType,
} from "@nestjs/graphql";
import { EnumPayloadMode } from "@prisma/client";
import { GraphQLJSON } from "graphql-type-json";

// Register the PayloadMode enum for GraphQL
registerEnumType(EnumPayloadMode, {
  name: "EnumPayloadMode",
  description: "Payload mode for MQTT event publishing",
});

// Simplified broker reference for the rule
@ObjectType()
export class MqttEventPublishRuleBroker {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  host!: string;

  @Field(() => Int, { nullable: true })
  port?: number | null;
}

@ObjectType()
export class MqttEventPublishRule {
  @Field(() => String)
  id!: string;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String)
  createdBy!: string;

  @Field(() => String, { nullable: true })
  updatedBy?: string | null;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String)
  entityType!: string;

  @Field(() => String)
  eventType!: string;

  @Field(() => [String])
  severityFilter!: string[];

  @Field(() => [String])
  phaseFilter!: string[];

  @Field(() => [String])
  assetFilter!: string[];

  @Field(() => String)
  topicTemplate!: string;

  @Field(() => EnumPayloadMode)
  payloadMode!: keyof typeof EnumPayloadMode;

  @Field(() => [String])
  includeRelations!: string[];

  @Field(() => [String])
  excludeFields!: string[];

  @Field(() => GraphQLJSON, { nullable: true })
  payloadTransform?: Record<string, unknown> | null;

  @Field(() => Int)
  qos!: number;

  @Field(() => Boolean)
  retain!: boolean;

  @Field(() => Boolean)
  enabled!: boolean;

  @Field(() => Int)
  priority!: number;

  @Field(() => [MqttEventPublishRuleBroker], { nullable: true })
  brokers?: MqttEventPublishRuleBroker[];
}

// Input for connecting brokers
@InputType()
export class BrokerConnectInput {
  @Field(() => String)
  id!: string;
}

@InputType()
export class BrokerConnectListInput {
  @Field(() => [BrokerConnectInput], { nullable: true })
  connect?: BrokerConnectInput[];
}

@InputType()
export class BrokerSetListInput {
  @Field(() => [BrokerConnectInput], { nullable: true })
  set?: BrokerConnectInput[];
}

@InputType()
export class MqttEventPublishRuleCreateInput {
  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String)
  entityType!: string;

  @Field(() => String)
  eventType!: string;

  @Field(() => [String], { nullable: true })
  severityFilter?: string[];

  @Field(() => [String], { nullable: true })
  phaseFilter?: string[];

  @Field(() => [String], { nullable: true })
  assetFilter?: string[];

  @Field(() => String)
  topicTemplate!: string;

  @Field(() => EnumPayloadMode, { nullable: true })
  payloadMode?: keyof typeof EnumPayloadMode;

  @Field(() => [String], { nullable: true })
  includeRelations?: string[];

  @Field(() => [String], { nullable: true })
  excludeFields?: string[];

  @Field(() => GraphQLJSON, { nullable: true })
  payloadTransform?: Record<string, unknown> | null;

  @Field(() => Int, { nullable: true })
  qos?: number;

  @Field(() => Boolean, { nullable: true })
  retain?: boolean;

  @Field(() => Boolean, { nullable: true })
  enabled?: boolean;

  @Field(() => Int, { nullable: true })
  priority?: number;

  @Field(() => String)
  createdBy!: string;

  @Field(() => String, { nullable: true })
  updatedBy?: string | null;

  @Field(() => BrokerConnectListInput, { nullable: true })
  brokers?: BrokerConnectListInput;
}

@InputType()
export class MqttEventPublishRuleUpdateInput {
  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String, { nullable: true })
  entityType?: string;

  @Field(() => String, { nullable: true })
  eventType?: string;

  @Field(() => [String], { nullable: true })
  severityFilter?: string[];

  @Field(() => [String], { nullable: true })
  phaseFilter?: string[];

  @Field(() => [String], { nullable: true })
  assetFilter?: string[];

  @Field(() => String, { nullable: true })
  topicTemplate?: string;

  @Field(() => EnumPayloadMode, { nullable: true })
  payloadMode?: keyof typeof EnumPayloadMode;

  @Field(() => [String], { nullable: true })
  includeRelations?: string[];

  @Field(() => [String], { nullable: true })
  excludeFields?: string[];

  @Field(() => GraphQLJSON, { nullable: true })
  payloadTransform?: Record<string, unknown> | null;

  @Field(() => Int, { nullable: true })
  qos?: number;

  @Field(() => Boolean, { nullable: true })
  retain?: boolean;

  @Field(() => Boolean, { nullable: true })
  enabled?: boolean;

  @Field(() => Int, { nullable: true })
  priority?: number;

  @Field(() => String, { nullable: true })
  updatedBy?: string | null;

  @Field(() => BrokerSetListInput, { nullable: true })
  brokers?: BrokerSetListInput;
}

@InputType()
export class MqttEventPublishRuleWhereUniqueInput {
  @Field(() => String)
  id!: string;
}

// Test result types
@ObjectType()
export class BrokerTestResult {
  @Field(() => String)
  brokerId!: string;

  @Field(() => Boolean)
  success!: boolean;

  @Field(() => String, { nullable: true })
  error?: string;
}

@ObjectType()
export class TestPublishRuleResult {
  @Field(() => Boolean)
  success!: boolean;

  @Field(() => String, { nullable: true })
  topic?: string | null;

  @Field(() => GraphQLJSON, { nullable: true })
  payload?: Record<string, unknown> | null;

  @Field(() => [BrokerTestResult])
  brokerResults!: BrokerTestResult[];

  @Field(() => String, { nullable: true })
  error?: string;
}
