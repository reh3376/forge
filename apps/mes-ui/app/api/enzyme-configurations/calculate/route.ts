import { NextRequest, NextResponse } from 'next/server'

// Backend configuration
const GRAPHQL_ENDPOINT = process.env['NEXT_PUBLIC_MES_GRAPHQL_URL'] || 'http://localhost:3000/graphql'
const MES_API_BASE = process.env['NEXT_PUBLIC_MES_API_URL'] || 'http://localhost:3000/api'
const MES_USERNAME = process.env['MES_USERNAME'] || 'mes'
const MES_PASSWORD = process.env['MES_PASSWORD'] || 'password'

// Cache for service account token
let serviceAccountToken: string | null = null
let tokenExpiry: number = 0

async function getServiceAccountToken(): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000)
  if (serviceAccountToken && tokenExpiry > now + 60) {
    return serviceAccountToken
  }

  try {
    const loginUrl = `${MES_API_BASE.replace('/api', '')}/api/login`
    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: MES_USERNAME, password: MES_PASSWORD }),
    })

    if (!response.ok) {
      console.error('Service account login failed:', response.status)
      return null
    }

    const authData = await response.json()
    serviceAccountToken = authData.accessToken

    try {
      const payload = JSON.parse(atob(authData.accessToken.split('.')[1]))
      tokenExpiry = payload.exp || (now + 3600)
    } catch {
      tokenExpiry = now + 3600
    }

    return serviceAccountToken
  } catch (error) {
    console.error('Service account authentication error:', error)
    return null
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = await getServiceAccountToken()

  if (token) {
    headers['authorization'] = `Bearer ${token}`
  } else if (process.env.NODE_ENV === 'development') {
    headers['x-development-mode'] = 'true'
    headers['x-demo-user'] = 'true'
    headers['x-demo-user-id'] = 'demo-user-supervisor'
    headers['x-demo-user-role'] = 'OPS_DISTILLERY_SUPERVISOR'
  }

  return headers
}

// Types for the calculation request
interface EnzymeSelection {
  category: 'LIQUIFACTION' | 'SACCHARIFICATION' | 'VISCOSITY'
  enzymeId: string
}

interface CalculateRequest {
  totalGrainLoadLbs: number
  enzymeSelections: EnzymeSelection[]
  recipeId?: string
  mashBill?: string
}

// Types for enzyme configuration
interface EnzymeConfiguration {
  id: string
  category: 'LIQUIFACTION' | 'SACCHARIFICATION' | 'VISCOSITY'
  dosePerMetricTon: number
  instructions: string
  active: boolean
  item?: {
    id: string
    itemNumber: string
    itemName: string
  } | null
}

// Types for recipe
interface Recipe {
  id: string
  Recipe: string  // This is the actual field name in GraphQL
  mashBillString?: string
}

// Helper function to extract enzyme name from itemNumber (e.g., "Laminex C2K" from "ENZ-GUS01-Enzyme (Laminex C2K)")
function extractEnzymeName(itemNumber: string | undefined | null): string | null {
  if (!itemNumber) return null
  const match = itemNumber.match(/\(([^)]+)\)/)
  return match ? match[1] : null
}

// Convert pounds to metric tons and calculate dose
function calculateDoseLbs(dosePerMetricTon: number, totalGrainLoadLbs: number): number {
  // Convert lbs to metric tons: 1 metric ton = 2204.62 lbs
  const grainLoadMetricTons = totalGrainLoadLbs / 2204.62
  // Calculate dose in the same unit as dosePerMetricTon (assuming it's already in lbs)
  return dosePerMetricTon * grainLoadMetricTons
}

export async function POST(request: NextRequest) {
  try {
    const body: CalculateRequest = await request.json()
    console.log('🧮 Calculate request received:', body)
    
    const { totalGrainLoadLbs, enzymeSelections, recipeId, mashBill } = body

    // Validate request
    if (!totalGrainLoadLbs || totalGrainLoadLbs < 1000 || totalGrainLoadLbs > 50000) {
      return NextResponse.json(
        { error: 'Total grain load must be between 1,000 and 50,000 lbs' },
        { status: 400 }
      )
    }

    if (!enzymeSelections || enzymeSelections.length === 0) {
      return NextResponse.json(
        { error: 'At least one enzyme selection is required' },
        { status: 400 }
      )
    }

    console.log('🧮 Processing enzyme selections:', enzymeSelections)

    // Fetch enzyme configurations for selected enzymes
    const enzymePromises = enzymeSelections.map(async (selection) => {
      const graphqlQuery = `
        query GetEnzymeConfiguration($id: String!) {
          enzymeConfiguration(where: { id: $id }) {
            id
            category
            dosePerMetricTon
            instructions
            active
            item {
              id
              itemNumber
              itemName
            }
          }
        }
      `;

      const headers = await getAuthHeaders()
      const response = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: graphqlQuery,
          variables: { id: selection.enzymeId }
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch enzyme configuration for ${selection.enzymeId}`)
      }

      const data = await response.json()
      if (data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`)
      }

      if (!data.data.enzymeConfiguration) {
        throw new Error(`Enzyme configuration not found for ID: ${selection.enzymeId}`)
      }

      return data.data.enzymeConfiguration
    })

    const enzymeConfigurations = await Promise.all(enzymePromises)

    // Fetch recipe if recipeId is provided
    let recipe: Recipe | null = null
    if (recipeId) {
      const recipeQuery = `
        query GetRecipe($id: String!) {
          recipe(where: { id: $id }) {
            id
            Recipe
            mashBillString
          }
        }
      `;

      const recipeHeaders = await getAuthHeaders()
      const recipeResponse = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: recipeHeaders,
        body: JSON.stringify({
          query: recipeQuery,
          variables: { id: recipeId }
        }),
      });

      if (recipeResponse.ok) {
        const recipeData = await recipeResponse.json()
        if (!recipeData.errors) {
          recipe = recipeData.data.recipe
        }
      }
    }

    // Calculate enzyme dosing
    const calculations = enzymeConfigurations.map((enzyme: EnzymeConfiguration) => {
      const doseLbs = calculateDoseLbs(enzyme.dosePerMetricTon, totalGrainLoadLbs)

      // Extract enzyme name: priority is itemName > extracted from itemNumber > itemNumber > fallback
      const enzymeName = enzyme.item?.itemName?.trim()
        || extractEnzymeName(enzyme.item?.itemNumber)
        || enzyme.item?.itemNumber
        || `${enzyme.category} Enzyme`

      return {
        enzymeId: enzyme.id,
        enzymeName,
        category: enzyme.category,
        doseLbs: Math.round(doseLbs * 100) / 100, // Round to 2 decimal places
        dosePerMetricTon: enzyme.dosePerMetricTon,
        instructions: enzyme.instructions,
        isActive: enzyme.active
      }
    })

    // Generate calculation result
    const result = {
      calculationId: `calc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      totalGrainLoadLbs: totalGrainLoadLbs,
      mashBill: mashBill || recipe?.mashBillString,
      recipeId: recipeId,
      recipeName: recipe?.Recipe,
      calculations,
      calculatedAt: new Date().toISOString(),
      calculatedBy: 'system', // In a real app, this would be the authenticated user
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('Error calculating enzyme dosing:', error)
    
    return NextResponse.json(
      {
        error: 'Failed to calculate enzyme dosing',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
} 