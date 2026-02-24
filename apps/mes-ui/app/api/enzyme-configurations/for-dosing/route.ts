import { NextResponse } from 'next/server'

// Force dynamic rendering - don't statically export this route
export const dynamic = 'force-dynamic'

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

// Types for enzyme configuration
interface EnzymeConfiguration {
  id: string
  category: 'LIQUIFACTION' | 'SACCHARIFICATION' | 'VISCOSITY'
  dosePerMetricTon: number
  instructions: string
  active: boolean
  item: {
    id: string
    itemNumber: string
    itemName: string
  }
}

export async function GET() {
  try {
    const graphqlQuery = `
      query GetEnzymeConfigurationsForDosing {
        enzymeConfigurations {
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

    // Get authentication token
    const token = await getServiceAccountToken()

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (token) {
      headers['authorization'] = `Bearer ${token}`
    } else if (process.env.NODE_ENV === 'development') {
      // Development fallback
      headers['x-development-mode'] = 'true'
      headers['x-demo-user'] = 'true'
      headers['x-demo-user-id'] = 'demo-user-supervisor'
      headers['x-demo-user-role'] = 'OPS_DISTILLERY_SUPERVISOR'
    }

    // Call backend GraphQL directly
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: graphqlQuery }),
    });

    let enzymeConfigurations: EnzymeConfiguration[] = []

    console.log('🧪 Enzyme dosing API - calling backend:', GRAPHQL_ENDPOINT)

    if (response.ok) {
      const data = await response.json()
      console.log('🧪 GraphQL response:', JSON.stringify(data, null, 2).slice(0, 500))

      if (data.data && data.data.enzymeConfigurations && !data.errors) {
        enzymeConfigurations = data.data.enzymeConfigurations
        console.log(`🧪 Found ${enzymeConfigurations.length} enzyme configurations`)
      } else if (data.errors) {
        console.error('🧪 GraphQL errors:', data.errors)
        return NextResponse.json(
          {
            success: false,
            error: 'GraphQL query failed',
            details: data.errors,
          },
          { status: 500 }
        )
      }
    } else {
      const errorText = await response.text()
      console.error('🧪 Failed to fetch from GraphQL:', response.status, response.statusText, errorText)
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch from GraphQL endpoint',
          status: response.status,
          details: errorText,
        },
        { status: 500 }
      )
    }

    // Filter for active configurations on the backend
    const activeConfigurations = enzymeConfigurations.filter((config: EnzymeConfiguration) => config.active);
    console.log(`🧪 Active configurations: ${activeConfigurations.length} of ${enzymeConfigurations.length}`);

    // Helper function to extract enzyme name from itemNumber (e.g., "Laminex C2K" from "ENZ-GUS01-Enzyme (Laminex C2K)")
    const extractEnzymeName = (itemNumber: string): string | null => {
      const match = itemNumber?.match(/\(([^)]+)\)/)
      return match ? match[1] : null
    }

    // Transform the data to use actual enzyme names from the database
    const configurations = activeConfigurations.map((config: EnzymeConfiguration) => {
      // Priority: itemName > extracted from itemNumber > itemNumber > category fallback
      const name = config.item?.itemName?.trim()
        || extractEnzymeName(config.item?.itemNumber || '')
        || config.item?.itemNumber
        || `${config.category} Enzyme`

      return {
        id: config.id,
        name,
        category: config.category,
        dosePerMetricTon: config.dosePerMetricTon,
        instructions: config.instructions || `Apply ${config.dosePerMetricTon} per metric ton`,
        isActive: config.active,
        itemNumber: config.item?.itemNumber,
        itemId: config.item?.id,
      }
    })

    // Group by category for easier frontend consumption
    const groupedByCategory = configurations.reduce((acc: Record<string, typeof configurations>, config: typeof configurations[0]) => {
      if (!acc[config.category]) {
        acc[config.category] = []
      }
      acc[config.category]?.push(config)
      return acc
    }, {})

    console.log(`🧪 Returning ${configurations.length} enzyme configurations:`, configurations.map(c => c.name))

    return NextResponse.json({
      success: true,
      configurations,
      groupedByCategory,
      totalCount: configurations.length,
      categories: Object.keys(groupedByCategory),
    })

  } catch (error) {
    console.error('Error fetching enzyme configurations for dosing:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch enzyme configurations',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
} 