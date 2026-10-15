import { gql } from '@apollo/client'

// ==================== Queries ====================

export const GET_FORMULA_VARIABLES = gql`
  query GetFormulaVariables {
    formulaVariables {
      id
      name
      displayName
      description
      type
      defaultValue
      category
      sortOrder
      isActive
      isSystem
      createdAt
      updatedAt
    }
  }
`

// Query for units (for unit conversion functions)
export const GET_UNITS_FOR_CONVERSION = gql`
  query GetUnitsForConversion {
    unitsItems {
      id
      name
      abbreviation
    }
  }
`

export const GET_ALL_FORMULA_VARIABLES = gql`
  query GetAllFormulaVariables {
    formulaVariablesAll {
      id
      name
      displayName
      description
      type
      defaultValue
      category
      sortOrder
      isActive
      isSystem
      createdAt
      updatedAt
    }
  }
`

export const GET_FORMULA_FUNCTIONS = gql`
  query GetFormulaFunctions {
    formulaFunctions {
      id
      name
      syntax
      description
      category
      exampleUsage
      sortOrder
      isActive
      isSystem
      implementationType
      expression
      fromUnitId
      toUnitId
      fromUnit {
        id
        name
        abbreviation
      }
      toUnit {
        id
        name
        abbreviation
      }
      createdAt
      updatedAt
    }
  }
`

export const GET_ALL_FORMULA_FUNCTIONS = gql`
  query GetAllFormulaFunctions {
    formulaFunctionsAll {
      id
      name
      syntax
      description
      category
      exampleUsage
      sortOrder
      isActive
      isSystem
      implementationType
      expression
      fromUnitId
      toUnitId
      fromUnit {
        id
        name
        abbreviation
      }
      toUnit {
        id
        name
        abbreviation
      }
      createdAt
      updatedAt
    }
  }
`

// ==================== Variable Mutations ====================

export const CREATE_FORMULA_VARIABLE = gql`
  mutation CreateFormulaVariable($input: CreateFormulaVariableInput!) {
    createFormulaVariable(input: $input) {
      id
      name
      displayName
      description
      type
      defaultValue
      category
      sortOrder
      isActive
      isSystem
    }
  }
`

export const UPDATE_FORMULA_VARIABLE = gql`
  mutation UpdateFormulaVariable($id: String!, $input: UpdateFormulaVariableInput!) {
    updateFormulaVariable(id: $id, input: $input) {
      id
      name
      displayName
      description
      type
      defaultValue
      category
      sortOrder
      isActive
      isSystem
    }
  }
`

export const DELETE_FORMULA_VARIABLE = gql`
  mutation DeleteFormulaVariable($id: String!) {
    deleteFormulaVariable(id: $id) {
      id
      name
    }
  }
`

// ==================== Function Mutations ====================

export const CREATE_FORMULA_FUNCTION = gql`
  mutation CreateFormulaFunction($input: CreateFormulaFunctionInput!) {
    createFormulaFunction(input: $input) {
      id
      name
      syntax
      description
      category
      exampleUsage
      sortOrder
      isActive
      isSystem
      implementationType
      expression
      fromUnitId
      toUnitId
      fromUnit {
        id
        name
        abbreviation
      }
      toUnit {
        id
        name
        abbreviation
      }
    }
  }
`

export const UPDATE_FORMULA_FUNCTION = gql`
  mutation UpdateFormulaFunction($id: String!, $input: UpdateFormulaFunctionInput!) {
    updateFormulaFunction(id: $id, input: $input) {
      id
      name
      syntax
      description
      category
      exampleUsage
      sortOrder
      isActive
      isSystem
      implementationType
      expression
      fromUnitId
      toUnitId
      fromUnit {
        id
        name
        abbreviation
      }
      toUnit {
        id
        name
        abbreviation
      }
    }
  }
`

export const DELETE_FORMULA_FUNCTION = gql`
  mutation DeleteFormulaFunction($id: String!) {
    deleteFormulaFunction(id: $id) {
      id
      name
    }
  }
`

// ==================== Types ====================

export interface FormulaVariable {
  id: string
  name: string
  displayName: string
  description?: string | null
  type: string
  defaultValue?: string | null
  category: string
  sortOrder: number
  isActive: boolean
  isSystem: boolean
  createdAt: string
  updatedAt: string
}

export type ImplementationType = 'SYSTEM' | 'EXPRESSION' | 'UNIT_CONVERSION'

export interface UnitReference {
  id: string
  name: string
  abbreviation: string
}

export interface FormulaFunction {
  id: string
  name: string
  syntax: string
  description?: string | null
  category: string
  exampleUsage?: string | null
  sortOrder: number
  isActive: boolean
  isSystem: boolean
  implementationType: ImplementationType
  expression?: string | null
  fromUnitId?: string | null
  toUnitId?: string | null
  fromUnit?: UnitReference | null
  toUnit?: UnitReference | null
  createdAt: string
  updatedAt: string
}
