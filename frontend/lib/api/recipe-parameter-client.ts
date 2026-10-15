import { unifiedGraphQLClient } from './unified-graphql-client'
import { gql } from '@apollo/client'

// Parameter Category enum type
export type ParameterCategory = 'Input' | 'Output' | 'Calculated' | 'MashingActual' | 'ProcessingActual'

// Types for Recipe Parameters
export interface RecipeParameter {
  id: string
  recipeParamName: string
  recipeParamDescription?: string
  description?: string
  className: string
  active: boolean
  required?: boolean
  recipeSetpointType?: string
  recipeNumericalSetpoint?: number
  recipeSetpointBooleanValue?: boolean
  recipeSetpointLowerLimit?: number
  recipeSetpointUpperLimit?: number
  parameterCategory?: ParameterCategory
  units?: Units
  operation?: Operation
  revision?: number
  isClassDefinition?: boolean
  createdAt: string
  updatedAt?: string
  createdBy: string
  updatedBy?: string
}

export interface Units {
  id: string
  name?: string
  abbreviation?: string
}

export interface Operation {
  id: string
  name?: string
}

export interface CreateRecipeParameterInput {
  recipeParamName: string
  recipeParamDescription?: string
  description?: string
  className: string
  active?: boolean
  required?: boolean
  recipeSetpointType?: string
  recipeNumericalSetpoint?: number
  recipeSetpointBooleanValue?: boolean
  recipeSetpointLowerLimit?: number
  recipeSetpointUpperLimit?: number
  parameterCategory?: ParameterCategory
  unitsId?: string
  operationId?: string
  isClassDefinition?: boolean
}

export interface UpdateRecipeParameterInput {
  recipeParamName?: string
  recipeParamDescription?: string
  description?: string
  className?: string
  active?: boolean
  required?: boolean
  recipeSetpointType?: string
  recipeNumericalSetpoint?: number
  recipeSetpointBooleanValue?: boolean
  recipeSetpointLowerLimit?: number
  recipeSetpointUpperLimit?: number
  parameterCategory?: ParameterCategory
  unitsId?: string
  operationId?: string
  isClassDefinition?: boolean
}

export interface RecipeParameterFilter {
  active?: boolean
  className?: string
  operationId?: string
  recipeParamName?: {
    contains?: string
    mode?: 'Insensitive'
  }
}

export interface PaginationParams {
  skip?: number
  take?: number
}

export interface PaginatedRecipeParametersResult {
  recipeParameters: RecipeParameter[]
  totalCount: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

// GraphQL Queries
const GET_RECIPE_PARAMETERS = gql`
  query GetRecipeParameters($where: RecipeParameterWhereInput, $orderBy: [RecipeParameterOrderByInput!], $take: Float, $skip: Float) {
    recipeParameters(where: $where, orderBy: $orderBy, take: $take, skip: $skip) {
      id
      recipeParamName
      recipeParamDescription
      description
      className
      active
      required
      recipeSetpointType
      recipeNumericalSetpoint
      recipeSetpointBooleanValue
      recipeSetpointLowerLimit
      recipeSetpointUpperLimit
      parameterCategory
      isClassDefinition
      units {
        id
        name
        abbreviation
      }
      operation {
        id
        name
      }
      revision
      createdAt
      updatedAt
      createdBy
      updatedBy
    }
  }
`

const GET_RECIPE_PARAMETER = gql`
  query GetRecipeParameter($id: String!) {
    recipeParameter(where: { id: $id }) {
      id
      recipeParamName
      recipeParamDescription
      description
      className
      active
      required
      recipeSetpointType
      recipeNumericalSetpoint
      recipeSetpointBooleanValue
      recipeSetpointLowerLimit
      recipeSetpointUpperLimit
      parameterCategory
      isClassDefinition
      revision
      createdAt
      updatedAt
      createdBy
      updatedBy
      units {
        id
        name
        abbreviation
      }
      operation {
        id
        name
      }
    }
  }
`

const CREATE_RECIPE_PARAMETER = gql`
  mutation CreateRecipeParameter($data: RecipeParameterCreateInput!) {
    createRecipeParameter(data: $data) {
      id
      recipeParamName
      recipeParamDescription
      description
      className
      active
      required
      recipeSetpointType
      recipeNumericalSetpoint
      recipeSetpointBooleanValue
      recipeSetpointLowerLimit
      recipeSetpointUpperLimit
      parameterCategory
      isClassDefinition
      units {
        id
        name
        abbreviation
      }
      operation {
        id
        name
      }
      revision
      createdAt
      updatedAt
      createdBy
      updatedBy
    }
  }
`

const UPDATE_RECIPE_PARAMETER = gql`
  mutation UpdateRecipeParameter($where: RecipeParameterWhereUniqueInput!, $data: RecipeParameterUpdateInput!) {
    updateRecipeParameter(where: $where, data: $data) {
      id
      recipeParamName
      recipeParamDescription
      description
      className
      active
      required
      recipeSetpointType
      recipeNumericalSetpoint
      recipeSetpointBooleanValue
      recipeSetpointLowerLimit
      recipeSetpointUpperLimit
      parameterCategory
      isClassDefinition
      units {
        id
        name
        abbreviation
      }
      operation {
        id
        name
      }
      revision
      createdAt
      updatedAt
      createdBy
      updatedBy
    }
  }
`

const DELETE_RECIPE_PARAMETER = gql`
  mutation DeleteRecipeParameter($where: RecipeParameterWhereUniqueInput!) {
    deleteRecipeParameter(where: $where) {
      id
      recipeParamName
    }
  }
`

const GET_OPERATIONS = gql`
  query GetOperations($where: OperationWhereInput) {
    operations(where: $where) {
      id
      name
    }
  }
`

const GET_UNITS = gql`
  query GetUnitsItems {
    unitsItems {
      id
      name
      abbreviation
    }
  }
`

const GET_RECIPE_PARAMETERS_COUNT = gql`
  query GetRecipeParametersMeta($where: RecipeParameterWhereInput) {
    _recipeParametersMeta(where: $where) {
      count
    }
  }
`

// Recipe Parameter API functions
export class RecipeParameterClient {
  async getRecipeParameters(
    pagination?: PaginationParams,
    filter?: RecipeParameterFilter
  ): Promise<PaginatedRecipeParametersResult> {
    try {
      const skip = pagination?.skip || 0
      const take = pagination?.take || 20

      // Default filter for master records (isClassDefinition: true)
      const masterFilter = {
        isClassDefinition: { equals: true },
        ...filter // Merge with any additional filters
      }

      console.log('🔍 Fetching recipe parameters with:', { skip, take, filter: masterFilter })

      // Get recipe parameters
      const result = await unifiedGraphQLClient.query<{ recipeParameters: RecipeParameter[] }>(GET_RECIPE_PARAMETERS, {
        variables: { 
          skip, 
          take, 
          where: masterFilter 
        },
        fetchPolicy: 'cache-first'
      })

      console.log('✅ Recipe parameters result:', result)

      // Get total count
      const countResult = await unifiedGraphQLClient.query<{ _recipeParametersMeta: { count: number } }>(GET_RECIPE_PARAMETERS_COUNT, {
        variables: { 
          where: masterFilter
        },
        fetchPolicy: 'cache-first'
      })

      const totalCount = countResult._recipeParametersMeta?.count || 0

      return {
        recipeParameters: result.recipeParameters || [],
        totalCount,
        hasNextPage: skip + take < totalCount,
        hasPreviousPage: skip > 0,
      }
    } catch (error) {
      console.error('❌ Error fetching recipe parameters:', error)
      throw error
    }
  }

  async getRecipeParameter(id: string): Promise<RecipeParameter> {
    try {
      console.log('🔍 Fetching recipe parameter:', id)
      const data = await unifiedGraphQLClient.query<{ recipeParameter: RecipeParameter }>(GET_RECIPE_PARAMETER, {
        variables: { id }
      })
      console.log('✅ Recipe parameter result:', data)
      return data.recipeParameter
    } catch (error) {
      console.error('❌ Error fetching recipe parameter:', error)
      throw error
    }
  }

  async createRecipeParameter(input: CreateRecipeParameterInput): Promise<RecipeParameter> {
    try {
      console.log('🔍 Creating recipe parameter:', input)
      const data = await unifiedGraphQLClient.mutate<{ createRecipeParameter: RecipeParameter }>(CREATE_RECIPE_PARAMETER, {
        variables: { data: input },
        refetchQueries: [{ query: GET_RECIPE_PARAMETERS, variables: {} }]
      })
      console.log('✅ Recipe parameter created:', data)
      return data.createRecipeParameter
    } catch (error) {
      console.error('❌ Error creating recipe parameter:', error)
      throw error
    }
  }

  async updateRecipeParameter(id: string, input: UpdateRecipeParameterInput): Promise<RecipeParameter> {
    try {
      console.log('🔍 Updating recipe parameter:', id, input)
      const data = await unifiedGraphQLClient.mutate<{ updateRecipeParameter: RecipeParameter }>(UPDATE_RECIPE_PARAMETER, {
        variables: { 
          where: { id },
          data: input 
        },
        refetchQueries: [
          { query: GET_RECIPE_PARAMETERS, variables: {} },
          { query: GET_RECIPE_PARAMETER, variables: { id } }
        ]
      })
      console.log('✅ Recipe parameter updated:', data)
      return data.updateRecipeParameter
    } catch (error) {
      console.error('❌ Error updating recipe parameter:', error)
      throw error
    }
  }

  async deleteRecipeParameter(id: string): Promise<RecipeParameter> {
    try {
      console.log('🔍 Deleting recipe parameter:', id)
      const data = await unifiedGraphQLClient.mutate<{ deleteRecipeParameter: RecipeParameter }>(DELETE_RECIPE_PARAMETER, {
        variables: { where: { id } },
        refetchQueries: [{ query: GET_RECIPE_PARAMETERS, variables: {} }]
      })
      console.log('✅ Recipe parameter deleted:', data)
      return data.deleteRecipeParameter
    } catch (error) {
      console.error('❌ Error deleting recipe parameter:', error)
      throw error
    }
  }

  async getOperations(): Promise<Operation[]> {
    try {
      console.log('🔍 Fetching operations')
      const data = await unifiedGraphQLClient.query<{ operations: Operation[] }>(GET_OPERATIONS, {
        variables: {},
        fetchPolicy: 'cache-first'
      })
      console.log('✅ Operations result:', data)
      return data.operations || []
    } catch (error) {
      console.error('❌ Error fetching operations:', error)
      throw error
    }
  }

  async getUnits(): Promise<Units[]> {
    try {
      console.log('🔍 Fetching units')
      const data = await unifiedGraphQLClient.query<{ unitsItems: Units[] }>(GET_UNITS, {
        variables: {},
        fetchPolicy: 'cache-first'
      })
      console.log('✅ Units result:', data)
      return data.unitsItems || []
    } catch (error) {
      console.error('❌ Error fetching units:', error)
      throw error
    }
  }
}

export const recipeParameterClient = new RecipeParameterClient() 