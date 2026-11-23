import { gql } from '@apollo/client'

// Fragment for MillingBinConfiguration fields
export const MILLING_BIN_CONFIGURATION_FRAGMENT = gql`
  fragment MillingBinConfigurationFields on MillingBinConfiguration {
    id
    createdAt
    updatedAt
    bin {
      id
      name
      description
      assetType
    }
    itemGroup {
      id
      name
      description
    }
  }
`

// Query to get all milling bin configurations
export const GET_MILLING_BIN_CONFIGURATIONS = gql`
  ${MILLING_BIN_CONFIGURATION_FRAGMENT}
  query GetMillingBinConfigurations {
    millingBinConfigurations {
      ...MillingBinConfigurationFields
    }
  }
`

// Query to get a single milling bin configuration
export const GET_MILLING_BIN_CONFIGURATION = gql`
  ${MILLING_BIN_CONFIGURATION_FRAGMENT}
  query GetMillingBinConfiguration($id: String!) {
    millingBinConfiguration(where: { id: $id }) {
      ...MillingBinConfigurationFields
    }
  }
`

// Query to get available assets for bin configuration
export const GET_AVAILABLE_ASSETS = gql`
  query GetAvailableAssets {
    assets {
      id
      name
      description
      assetType
    }
  }
`

// Query to get available item groups
export const GET_AVAILABLE_ITEM_GROUPS = gql`
  query GetAvailableItemGroups {
    itemGroups {
      id
      name
      description
      createdAt
      updatedAt
    }
  }
`

// Mutation to create a new milling bin configuration
export const CREATE_MILLING_BIN_CONFIGURATION = gql`
  ${MILLING_BIN_CONFIGURATION_FRAGMENT}
  mutation CreateMillingBinConfiguration($data: MillingBinConfigurationCreateInput!) {
    createMillingBinConfiguration(data: $data) {
      ...MillingBinConfigurationFields
    }
  }
`

// Mutation to update an existing milling bin configuration
export const UPDATE_MILLING_BIN_CONFIGURATION = gql`
  ${MILLING_BIN_CONFIGURATION_FRAGMENT}
  mutation UpdateMillingBinConfiguration(
    $where: MillingBinConfigurationWhereUniqueInput!
    $data: MillingBinConfigurationUpdateInput!
  ) {
    updateMillingBinConfiguration(where: $where, data: $data) {
      ...MillingBinConfigurationFields
    }
  }
`

// Mutation to delete a milling bin configuration
export const DELETE_MILLING_BIN_CONFIGURATION = gql`
  mutation DeleteMillingBinConfiguration($where: MillingBinConfigurationWhereUniqueInput!) {
    deleteMillingBinConfiguration(where: $where) {
      id
    }
  }
`

// TypeScript interfaces for the GraphQL operations
export interface MillingBinConfiguration {
  id: string
  createdAt: string
  updatedAt: string
  bin: {
    id: string
    name: string
    description?: string
    assetType?: string
  }
  itemGroup: {
    id: string
    name: string
    description?: string
  }
}

export interface Asset {
  id: string
  name: string
  description?: string
  assetType?: string
}

export interface ItemGroup {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
}

export interface MillingBinConfigurationCreateInput {
  bin: {
    connect: {
      id: string
    }
  }
  itemGroup: {
    connect: {
      id: string
    }
  }
}

export interface MillingBinConfigurationUpdateInput {
  bin?: {
    connect: {
      id: string
    }
  }
  itemGroup?: {
    connect: {
      id: string
    }
  }
}

export interface MillingBinConfigurationWhereUniqueInput {
  id: string
}

// Query result types
export interface GetMillingBinConfigurationsResult {
  millingBinConfigurations: MillingBinConfiguration[]
}

export interface GetMillingBinConfigurationResult {
  millingBinConfiguration: MillingBinConfiguration
}

export interface GetAvailableAssetsResult {
  assets: Asset[]
}

export interface GetAvailableItemGroupsResult {
  itemGroups: ItemGroup[]
}

// Mutation result types
export interface CreateMillingBinConfigurationResult {
  createMillingBinConfiguration: MillingBinConfiguration
}

export interface UpdateMillingBinConfigurationResult {
  updateMillingBinConfiguration: MillingBinConfiguration
}

export interface DeleteMillingBinConfigurationResult {
  deleteMillingBinConfiguration: {
    id: string
  }
} 