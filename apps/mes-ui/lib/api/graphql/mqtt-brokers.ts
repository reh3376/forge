import { gql } from '@apollo/client'

// Fragment for UnsBrokerConfiguration fields
export const UNS_BROKER_CONFIGURATION_FRAGMENT = gql`
  fragment UnsBrokerConfigurationFields on UnsBrokerConfiguration {
    id
    host
    port
    protocol
    username
    tls
    validateCertificate
    baseTopicPath
    subscriptions
    createdAt
    updatedAt
    createdBy
    updatedBy
  }
`

// Query to get all MQTT broker configurations
export const GET_UNS_BROKER_CONFIGURATIONS = gql`
  ${UNS_BROKER_CONFIGURATION_FRAGMENT}
  query GetUnsBrokerConfigurations {
    unsBrokerConfigurations {
      ...UnsBrokerConfigurationFields
    }
  }
`

// Query to get a single MQTT broker configuration
export const GET_UNS_BROKER_CONFIGURATION = gql`
  ${UNS_BROKER_CONFIGURATION_FRAGMENT}
  query GetUnsBrokerConfiguration($id: String!) {
    unsBrokerConfiguration(where: { id: $id }) {
      ...UnsBrokerConfigurationFields
    }
  }
`

// Mutation to create a new MQTT broker configuration
export const CREATE_UNS_BROKER_CONFIGURATION = gql`
  ${UNS_BROKER_CONFIGURATION_FRAGMENT}
  mutation CreateUnsBrokerConfiguration($data: UnsBrokerConfigurationCreateInput!) {
    createUnsBrokerConfiguration(data: $data) {
      ...UnsBrokerConfigurationFields
    }
  }
`

// Mutation to update an existing MQTT broker configuration
export const UPDATE_UNS_BROKER_CONFIGURATION = gql`
  ${UNS_BROKER_CONFIGURATION_FRAGMENT}
  mutation UpdateUnsBrokerConfiguration(
    $where: UnsBrokerConfigurationWhereUniqueInput!
    $data: UnsBrokerConfigurationUpdateInput!
  ) {
    updateUnsBrokerConfiguration(where: $where, data: $data) {
      ...UnsBrokerConfigurationFields
    }
  }
`

// Mutation to delete an MQTT broker configuration
export const DELETE_UNS_BROKER_CONFIGURATION = gql`
  mutation DeleteUnsBrokerConfiguration($where: UnsBrokerConfigurationWhereUniqueInput!) {
    deleteUnsBrokerConfiguration(where: $where) {
      id
    }
  }
`

// Types for TypeScript
export interface UnsBrokerConfiguration {
  id: string
  host: string
  port: number | null
  protocol: string | null
  username: string | null
  tls: boolean | null
  validateCertificate: boolean | null
  baseTopicPath: string | null
  subscriptions: string[] | Record<string, unknown> | null // JSON type for subscriptions
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string | null
}

export interface UnsBrokerConfigurationCreateInput {
  host: string
  port?: number | null
  protocol?: string | null
  username?: string | null
  password?: string | null
  tls?: boolean | null
  validateCertificate?: boolean | null
  baseTopicPath?: string | null
  subscriptions?: string[] | Record<string, unknown> | null // JSON type for subscriptions
  createdBy: string
  updatedBy?: string | null
}

export interface UnsBrokerConfigurationUpdateInput {
  host?: string | null
  port?: number | null
  protocol?: string | null
  username?: string | null
  password?: string | null
  tls?: boolean | null
  validateCertificate?: boolean | null
  baseTopicPath?: string | null
  subscriptions?: string[] | Record<string, unknown> | null // JSON type for subscriptions
  updatedBy?: string | null
}

export interface UnsBrokerConfigurationWhereUniqueInput {
  id: string
}

// Query result types
export interface GetUnsBrokerConfigurationsResult {
  unsBrokerConfigurations: UnsBrokerConfiguration[]
}

export interface GetUnsBrokerConfigurationResult {
  unsBrokerConfiguration: UnsBrokerConfiguration | null
}

export interface CreateUnsBrokerConfigurationResult {
  createUnsBrokerConfiguration: UnsBrokerConfiguration
}

export interface UpdateUnsBrokerConfigurationResult {
  updateUnsBrokerConfiguration: UnsBrokerConfiguration
}

export interface DeleteUnsBrokerConfigurationResult {
  deleteUnsBrokerConfiguration: {
    id: string
  }
} 