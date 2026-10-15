import { gql } from '@apollo/client'

// Fragment for MqttEventPublishRule fields
export const MQTT_EVENT_PUBLISH_RULE_FRAGMENT = gql`
  fragment MqttEventPublishRuleFields on MqttEventPublishRule {
    id
    name
    description
    entityType
    eventType
    severityFilter
    phaseFilter
    assetFilter
    topicTemplate
    payloadMode
    includeRelations
    excludeFields
    payloadTransform
    qos
    retain
    enabled
    priority
    createdAt
    updatedAt
    createdBy
    updatedBy
    brokers {
      id
      host
      port
    }
  }
`

// Query to get all MQTT event publish rules
export const GET_MQTT_EVENT_PUBLISH_RULES = gql`
  ${MQTT_EVENT_PUBLISH_RULE_FRAGMENT}
  query GetMqttEventPublishRules {
    mqttEventPublishRules {
      ...MqttEventPublishRuleFields
    }
  }
`

// Query to get a single MQTT event publish rule
export const GET_MQTT_EVENT_PUBLISH_RULE = gql`
  ${MQTT_EVENT_PUBLISH_RULE_FRAGMENT}
  query GetMqttEventPublishRule($id: String!) {
    mqttEventPublishRule(where: { id: $id }) {
      ...MqttEventPublishRuleFields
    }
  }
`

// Mutation to create a new MQTT event publish rule
export const CREATE_MQTT_EVENT_PUBLISH_RULE = gql`
  ${MQTT_EVENT_PUBLISH_RULE_FRAGMENT}
  mutation CreateMqttEventPublishRule($data: MqttEventPublishRuleCreateInput!) {
    createMqttEventPublishRule(data: $data) {
      ...MqttEventPublishRuleFields
    }
  }
`

// Mutation to update an existing MQTT event publish rule
export const UPDATE_MQTT_EVENT_PUBLISH_RULE = gql`
  ${MQTT_EVENT_PUBLISH_RULE_FRAGMENT}
  mutation UpdateMqttEventPublishRule(
    $where: MqttEventPublishRuleWhereUniqueInput!
    $data: MqttEventPublishRuleUpdateInput!
  ) {
    updateMqttEventPublishRule(where: $where, data: $data) {
      ...MqttEventPublishRuleFields
    }
  }
`

// Mutation to delete an MQTT event publish rule
export const DELETE_MQTT_EVENT_PUBLISH_RULE = gql`
  mutation DeleteMqttEventPublishRule($where: MqttEventPublishRuleWhereUniqueInput!) {
    deleteMqttEventPublishRule(where: $where) {
      id
    }
  }
`

// Mutation to test a publish rule
export const TEST_MQTT_PUBLISH_RULE = gql`
  mutation TestMqttPublishRule($where: MqttEventPublishRuleWhereUniqueInput!) {
    testMqttPublishRule(where: $where) {
      success
      topic
      payload
      brokerResults {
        brokerId
        success
        error
      }
      error
    }
  }
`

// Payload mode enum values
export enum PayloadMode {
  Full = 'Full',
  EventOnly = 'EventOnly',
  Custom = 'Custom'
}

// Entity types available for publishing
export const ENTITY_TYPES = [
  'ScheduleOrder',
  'ProductionEvent',
  'BatchDeviation',
  'StepExecution',
  'ProductionOrder',
  'MashingExecution'
] as const

export type EntityType = typeof ENTITY_TYPES[number]

// Severity levels for filtering
export const SEVERITY_LEVELS = ['Critical', 'Major', 'Minor', 'Info'] as const
export type SeverityLevel = typeof SEVERITY_LEVELS[number]

// Production phases for filtering
export const PRODUCTION_PHASES = [
  'Mashing',
  'Fermentation',
  'Distillation',
  'Maturation',
  'Bottling',
  'Receiving',
  'Milling'
] as const
export type ProductionPhase = typeof PRODUCTION_PHASES[number]

// Types for TypeScript
export interface BrokerReference {
  id: string
  host: string
  port: number
}

export interface MqttEventPublishRule {
  id: string
  name: string
  description: string | null
  entityType: string
  eventType: string
  severityFilter: string[]
  phaseFilter: string[]
  assetFilter: string[]
  topicTemplate: string
  payloadMode: PayloadMode
  includeRelations: string[]
  excludeFields: string[]
  payloadTransform: Record<string, unknown> | null
  qos: number
  retain: boolean
  enabled: boolean
  priority: number
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string | null
  brokers: BrokerReference[]
}

export interface MqttEventPublishRuleCreateInput {
  name: string
  description?: string | null
  entityType: string
  eventType: string
  severityFilter?: string[]
  phaseFilter?: string[]
  assetFilter?: string[]
  topicTemplate: string
  payloadMode?: PayloadMode
  includeRelations?: string[]
  excludeFields?: string[]
  payloadTransform?: Record<string, unknown> | null
  qos?: number
  retain?: boolean
  enabled?: boolean
  priority?: number
  createdBy: string
  updatedBy?: string | null
  brokers?: { connect: { id: string }[] }
}

export interface MqttEventPublishRuleUpdateInput {
  name?: string
  description?: string | null
  entityType?: string
  eventType?: string
  severityFilter?: string[]
  phaseFilter?: string[]
  assetFilter?: string[]
  topicTemplate?: string
  payloadMode?: PayloadMode
  includeRelations?: string[]
  excludeFields?: string[]
  payloadTransform?: Record<string, unknown> | null
  qos?: number
  retain?: boolean
  enabled?: boolean
  priority?: number
  updatedBy?: string | null
  brokers?: { set: { id: string }[] }
}

export interface MqttEventPublishRuleWhereUniqueInput {
  id: string
}

// Query result types
export interface GetMqttEventPublishRulesResult {
  mqttEventPublishRules: MqttEventPublishRule[]
}

export interface GetMqttEventPublishRuleResult {
  mqttEventPublishRule: MqttEventPublishRule | null
}

export interface CreateMqttEventPublishRuleResult {
  createMqttEventPublishRule: MqttEventPublishRule
}

export interface UpdateMqttEventPublishRuleResult {
  updateMqttEventPublishRule: MqttEventPublishRule
}

export interface DeleteMqttEventPublishRuleResult {
  deleteMqttEventPublishRule: {
    id: string
  }
}

// Test result types
export interface BrokerTestResult {
  brokerId: string
  success: boolean
  error?: string | null
}

export interface TestPublishRuleResult {
  success: boolean
  topic: string | null
  payload: Record<string, unknown> | null
  brokerResults: BrokerTestResult[]
  error?: string | null
}

export interface TestMqttPublishRuleResult {
  testMqttPublishRule: TestPublishRuleResult
}
