'use client'

import React, { useState, useEffect } from 'react'
import { useEnzymeDosing } from '../../hooks/useEnzymeDosing'
import type { EnzymeDosingResult, RecipeBomEnzymeItem } from '../../lib/utils/enzyme-dosing'

interface EnzymeDosingCalculatorProps {
  recipeId?: string
  totalGrainWeight?: number
  onEnzymeDosingCalculated?: (results: EnzymeDosingResult[]) => void
}

export function EnzymeDosingCalculator({
  recipeId,
  totalGrainWeight = 18000, // Default grain weight in pounds
  onEnzymeDosingCalculated
}: EnzymeDosingCalculatorProps) {
  const {
    loading,
    error,
    enzymeConfigurations,
    calculateSingleEnzymeDosing,
    fetchEnzymeConfigurations,
    generateRecommendations,
    clearError
  } = useEnzymeDosing()

  const [selectedEnzymeId, setSelectedEnzymeId] = useState<string>('')
  const [calculationResults, setCalculationResults] = useState<EnzymeDosingResult[]>([])
  const [recommendations, setRecommendations] = useState<RecipeBomEnzymeItem[]>([])

  // Load enzyme configurations on mount
  useEffect(() => {
    fetchEnzymeConfigurations()
  }, [fetchEnzymeConfigurations])

  const handleCalculateSingle = async () => {
    if (!recipeId || !selectedEnzymeId) {
      alert('Please provide a recipe ID and select an enzyme')
      return
    }

    const result = await calculateSingleEnzymeDosing({
      recipeId,
      enzymeItemId: selectedEnzymeId
    })

    if (result) {
      const newResults = [...calculationResults, result]
      setCalculationResults(newResults)
      onEnzymeDosingCalculated?.(newResults)
    }
  }

  const handleGenerateRecommendations = async () => {
    if (!recipeId) {
      alert('Please provide a recipe ID')
      return
    }

    const recs = await generateRecommendations(recipeId, totalGrainWeight)
    setRecommendations(recs)
  }

  const formatQuantity = (ratio: number, grainWeight: number) => {
    const quantity = ratio * grainWeight
    return `${quantity.toFixed(3)} lbs`
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Enzyme Dosing Calculator</h2>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <div className="flex justify-between items-center">
            <span>{error}</span>
            <button
              onClick={clearError}
              className="text-red-700 hover:text-red-900"
              aria-label="Close error message"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Single Calculation */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Single Enzyme Calculation</h3>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="recipe-id-input" className="block text-sm font-medium text-gray-700 mb-2">
                Recipe ID
              </label>
              <input
                id="recipe-id-input"
                type="text"
                value={recipeId || ''}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
                placeholder="Recipe ID will be provided by parent component"
              />
            </div>

            <div>
              <label htmlFor="enzyme-select" className="block text-sm font-medium text-gray-700 mb-2">
                Select Enzyme
              </label>
              <select
                id="enzyme-select"
                value={selectedEnzymeId}
                onChange={(e) => setSelectedEnzymeId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                disabled={loading}
                aria-label="Select enzyme for dosing calculation"
              >
                <option value="">Select an enzyme...</option>
                {enzymeConfigurations.map((config) => (
                  <option key={config.id} value={config.item.id}>
                    {config.item.itemName} ({config.category})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="grain-weight-input" className="block text-sm font-medium text-gray-700 mb-2">
                Total Grain Weight (lbs)
              </label>
              <input
                id="grain-weight-input"
                type="number"
                value={totalGrainWeight}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
                aria-label="Total grain weight in pounds"
              />
            </div>

            <button
              onClick={handleCalculateSingle}
              disabled={loading || !recipeId || !selectedEnzymeId}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Calculating...' : 'Calculate Enzyme Dosing'}
            </button>
          </div>
        </div>

        {/* Recommendations */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Enzyme Recommendations</h3>
          
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Generate automatic enzyme recommendations based on recipe composition
            </p>

            <button
              onClick={handleGenerateRecommendations}
              disabled={loading || !recipeId}
              className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Generating...' : 'Generate Recommendations'}
            </button>

            {recommendations.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium mb-2">Recommended Enzymes:</h4>
                <div className="space-y-2">
                  {recommendations.map((rec, index) => (
                    <div key={index} className="p-3 bg-gray-50 rounded border">
                      <div className="font-medium">{rec.itemName}</div>
                      <div className="text-sm text-gray-600">
                        Category: {rec.category} | Quantity: {rec.quantity} lbs
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {rec.instructions}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      {calculationResults.length > 0 && (
        <div className="mt-6 bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Calculation Results</h3>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Enzyme
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mash Bill
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dose Ratio
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Calculated Quantity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Instructions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {calculationResults.map((result, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {result.enzymeName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {result.enzymeCategory}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {result.mashBill}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {result.normalizedDoseRatio.toFixed(6)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatQuantity(result.normalizedDoseRatio, totalGrainWeight)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {result.instructions}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
} 