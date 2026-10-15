import { gql } from '@apollo/client'

// ============================================
// Formula Library Queries
// ============================================

export const GET_FORMULA_LIBRARIES = gql`
  query GetFormulaLibraries($filters: FormulaSearchFilters) {
    formulaLibraries(filters: $filters) {
      id
      globalId
      name
      description
      category
      tags
      expression
      version
      isActive
      documentation
      requiredVariables
      optionalVariables
      createdAt
      updatedAt
      createdBy
    }
  }
`

export const GET_FORMULA_LIBRARY = gql`
  query GetFormulaLibrary($id: String!) {
    formulaLibrary(id: $id) {
      id
      globalId
      name
      description
      category
      tags
      expression
      version
      isActive
      documentation
      exampleInputs
      expectedOutputs
      requiredVariables
      optionalVariables
      createdAt
      updatedAt
      createdBy
      updatedBy
      versions {
        id
        version
        expression
        description
        changeReason
        createdAt
        createdBy
      }
      testCases {
        id
        name
        inputs
        expectedOutput
        tolerance
        lastRunAt
        lastRunPassed
        lastRunOutput
        createdAt
      }
    }
  }
`

export const VALIDATE_EXPRESSION = gql`
  query ValidateExpression($expression: String!) {
    validateExpression(expression: $expression) {
      isValid
      errors
      warnings
      detectedVariables
      requiredVariables
    }
  }
`

export const GET_FORMULA_USAGE_STATS = gql`
  query GetFormulaUsageStats($formulaId: String!) {
    formulaUsageStats(formulaId: $formulaId) {
      usageCount
      lastUsed
      avgExecutionTime
    }
  }
`

// ============================================
// Formula Library Mutations
// ============================================

export const CREATE_FORMULA = gql`
  mutation CreateFormula($input: CreateFormulaInput!) {
    createFormula(input: $input) {
      id
      globalId
      name
      description
      category
      tags
      expression
      version
      isActive
      requiredVariables
      optionalVariables
      createdAt
      createdBy
    }
  }
`

export const UPDATE_FORMULA = gql`
  mutation UpdateFormula($id: String!, $input: UpdateFormulaInput!) {
    updateFormula(id: $id, input: $input) {
      id
      globalId
      name
      description
      category
      tags
      expression
      version
      isActive
      requiredVariables
      optionalVariables
      updatedAt
      updatedBy
    }
  }
`

export const DELETE_FORMULA = gql`
  mutation DeleteFormula($id: String!, $deletedBy: String!) {
    deleteFormula(id: $id, deletedBy: $deletedBy) {
      id
      isActive
    }
  }
`

export const EVALUATE_EXPRESSION = gql`
  mutation EvaluateExpression($input: EvaluateExpressionInput!) {
    evaluateExpression(input: $input) {
      success
      value
      error
      executionTimeMs
      variablesUsed
    }
  }
`

export const ADD_TEST_CASE = gql`
  mutation AddTestCase($formulaId: String!, $input: TestCaseInput!) {
    addTestCase(formulaId: $formulaId, input: $input) {
      id
      name
      inputs
      expectedOutput
      tolerance
      lastRunAt
      lastRunPassed
      lastRunOutput
      createdAt
      updatedAt
    }
  }
`

export const UPDATE_TEST_CASE = gql`
  mutation UpdateTestCase($testCaseId: String!, $input: UpdateTestCaseInput!) {
    updateTestCase(testCaseId: $testCaseId, input: $input) {
      id
      name
      inputs
      expectedOutput
      tolerance
      lastRunAt
      lastRunPassed
      lastRunOutput
      createdAt
      updatedAt
    }
  }
`

export const DELETE_TEST_CASE = gql`
  mutation DeleteTestCase($testCaseId: String!) {
    deleteTestCase(testCaseId: $testCaseId) {
      id
    }
  }
`

export const RUN_FORMULA_TESTS = gql`
  mutation RunFormulaTests($formulaId: String!) {
    runFormulaTests(formulaId: $formulaId) {
      passed
      failed
      total
    }
  }
`

// ============================================
// Types
// ============================================

export interface FormulaLibrary {
  id: string
  globalId: string
  name: string
  description?: string
  category?: string
  tags: string[]
  expression: string
  version: number
  isActive: boolean
  documentation?: string
  exampleInputs?: Record<string, any>
  expectedOutputs?: Record<string, number>
  requiredVariables: string[]
  optionalVariables: string[]
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy?: string
  versions?: FormulaVersion[]
  testCases?: FormulaTestCase[]
}

export interface FormulaVersion {
  id: string
  version: number
  expression: string
  description?: string
  changeReason?: string
  createdAt: string
  createdBy: string
}

export interface FormulaTestCase {
  id: string
  name: string
  inputs: Record<string, any>
  expectedOutput: number
  tolerance?: number
  lastRunAt?: string
  lastRunPassed?: boolean
  lastRunOutput?: number
  createdAt: string
}

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  detectedVariables: string[]
  requiredVariables: string[]
}

export interface ExpressionResult {
  success: boolean
  value?: number
  error?: string
  executionTimeMs: number
  variablesUsed: string[]
}

export interface TestResults {
  passed: number
  failed: number
  total: number
}

export interface UsageStats {
  usageCount: number
  lastUsed?: string
  avgExecutionTime?: number
}

/**
 * @deprecated Use `useFormulaVariables()` hook from `@/lib/hooks/use-formula-variables` instead.
 * Variables are now database-driven for configurability.
 */
export const FORMULA_VARIABLES = [
  { name: 'grainLoad', description: 'Total grain weight in lbs', type: 'number' },
  { name: 'waterLoad', description: 'Total water volume in gallons', type: 'number' },
  { name: 'corn', description: 'Corn percentage from mash bill (0-100)', type: 'number' },
  { name: 'rye', description: 'Rye percentage from mash bill (0-100)', type: 'number' },
  { name: 'wheat', description: 'Wheat percentage from mash bill (0-100)', type: 'number' },
  { name: 'malt', description: 'Malt percentage from mash bill (0-100)', type: 'number' },
  { name: 'mashBill', description: 'Mash bill code (e.g., "70-21-00-09")', type: 'string' },
  { name: 'lbsPerBushel', description: 'Pounds per bushel constant (56)', type: 'number' },
  { name: 'gallonsPerBushel', description: 'Default gallons per bushel (4.5)', type: 'number' },
]

/**
 * @deprecated Use `useFormulaFunctions()` hook from `@/lib/hooks/use-formula-functions` instead.
 * Functions are now database-driven for configurability.
 */
export const FORMULA_FUNCTIONS = [
  { name: 'IF', syntax: 'IF(condition, trueValue, falseValue)', description: 'Conditional evaluation' },
  { name: 'BUSHELS', syntax: 'BUSHELS(lbs)', description: 'Convert pounds to bushels (lbs / 56)' },
  { name: 'METRIC_TONS', syntax: 'METRIC_TONS(lbs)', description: 'Convert pounds to metric tons (lbs / 2205)' },
  { name: 'ROUND', syntax: 'ROUND(value)', description: 'Round to nearest integer' },
  { name: 'FLOOR', syntax: 'FLOOR(value)', description: 'Round down to integer' },
  { name: 'CEIL', syntax: 'CEIL(value)', description: 'Round up to integer' },
  { name: 'ABS', syntax: 'ABS(value)', description: 'Absolute value' },
  { name: 'MIN', syntax: 'MIN(a, b)', description: 'Minimum of two values' },
  { name: 'MAX', syntax: 'MAX(a, b)', description: 'Maximum of two values' },
  { name: 'SQRT', syntax: 'SQRT(value)', description: 'Square root' },
  { name: 'POW', syntax: 'POW(base, exponent)', description: 'Power/exponent' },
]

// Formula categories
export const FORMULA_CATEGORIES = [
  { value: 'Grain', label: 'Grain Calculations', description: 'Formulas for grain-based BOM items' },
  { value: 'Water', label: 'Water Calculations', description: 'Formulas for water and liquid volumes' },
  { value: 'Enzyme', label: 'Enzyme Dosing', description: 'Enzyme quantity calculations' },
  { value: 'Custom', label: 'Custom', description: 'Other custom formulas' },
]
