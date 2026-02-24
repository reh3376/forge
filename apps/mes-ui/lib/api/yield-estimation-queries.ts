import { gql } from '@apollo/client'

export const PREVIEW_YIELD_ESTIMATE = gql`
  query PreviewYieldEstimate($input: YieldEstimateInput!) {
    previewYieldEstimate(input: $input) {
      estimatedPGsPerBushel
      estimatedPGsPerBbl
      estimatedBarrelsPerFermenter
      totalProofGallons
      totalGrainWeight
      totalCooks
      totalFermenters
      grainUnitsPerFerm
      pgPerFerm
      totalBarrels
      plannedCooks
      plannedFermenters
      metricsUsed {
        name
        value
      }
    }
  }
`

export const GET_PRODUCTION_METRICS = gql`
  query GetProductionMetrics($category: String, $whiskeyType: EnumRecipeWhiskeyType) {
    productionMetrics(category: $category, whiskeyType: $whiskeyType) {
      id
      name
      displayName
      description
      valueNumeric
      valueString
      unit
      category
      whiskeyType
      sourceType
      isActive
      isSystem
      tags
      previousValue
      lastValueChange
    }
  }
`

export const UPDATE_PRODUCTION_METRIC_VALUE = gql`
  mutation UpdateProductionMetricValue($id: String!, $value: Float!, $updatedBy: String) {
    updateProductionMetricValue(id: $id, value: $value, updatedBy: $updatedBy) {
      id
      name
      valueNumeric
      previousValue
      lastValueChange
    }
  }
`
