import { NextRequest, NextResponse } from 'next/server'

const MES_GRAPHQL_ENDPOINT = process.env['NEXT_PUBLIC_MES_GRAPHQL_URL'] || 'http://localhost:3000/graphql'
const MES_API_ENDPOINT = process.env['NEXT_PUBLIC_MES_API_URL'] || process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000/api'

// GraphQL introspection query
const INTROSPECTION_QUERY = `
  query IntrospectionQuery {
    __schema {
      queryType { name }
      mutationType { name }
      subscriptionType { name }
      types {
        ...FullType
      }
      directives {
        name
        description
        locations
        args {
          ...InputValue
        }
      }
    }
  }

  fragment FullType on __Type {
    kind
    name
    description
    fields(includeDeprecated: true) {
      name
      description
      args {
        ...InputValue
      }
      type {
        ...TypeRef
      }
      isDeprecated
      deprecationReason
    }
    inputFields {
      ...InputValue
    }
    interfaces {
      ...TypeRef
    }
    enumValues(includeDeprecated: true) {
      name
      description
      isDeprecated
      deprecationReason
    }
    possibleTypes {
      ...TypeRef
    }
  }

  fragment InputValue on __InputValue {
    name
    description
    type { ...TypeRef }
    defaultValue
  }

  fragment TypeRef on __Type {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                }
              }
            }
          }
        }
      }
    }
  }
`

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || 'graphql'

  try {
    if (type === 'graphql') {
      // Fetch GraphQL schema via introspection
      const response = await fetch(MES_GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: INTROSPECTION_QUERY,
        }),
      })

      if (!response.ok) {
        throw new Error(`GraphQL introspection failed: ${response.status} ${response.statusText}`)
      }

      const schema = await response.json()
      
      return NextResponse.json({
        type: 'graphql',
        endpoint: MES_GRAPHQL_ENDPOINT,
        schema: schema.data,
        timestamp: new Date().toISOString(),
      })
    } else if (type === 'openapi' || type === 'swagger') {
      // Try to fetch OpenAPI/Swagger spec from common endpoints
      const possibleEndpoints = [
        // Your specific backend endpoints using MES API base
        `${MES_API_ENDPOINT}/openapi/spec`,
        `${MES_API_ENDPOINT}/openapi/spec.json`,
        // Common endpoints based on configured API base
        `${MES_API_ENDPOINT}/docs/json`,
        `${MES_API_ENDPOINT}/swagger.json`,
        `${MES_API_ENDPOINT}/openapi.json`,
        `${MES_API_ENDPOINT}/api-docs`,
        `${MES_API_ENDPOINT}/swagger`,
        `${MES_API_ENDPOINT.replace('/api', '')}/docs/json`,
        `${MES_API_ENDPOINT.replace('/api', '')}/swagger.json`,
        `${MES_API_ENDPOINT.replace('/api', '')}/openapi.json`,
      ]

      let spec = null
      let successEndpoint = null

      for (const endpoint of possibleEndpoints) {
        try {
          const response = await fetch(endpoint)
          if (response.ok) {
            const data = await response.json()
            if (data.openapi || data.swagger || data.info) {
              spec = data
              successEndpoint = endpoint
              break
            }
          }
        } catch {
          // Continue to next endpoint
          continue
        }
      }

      if (spec) {
        return NextResponse.json({
          type: 'openapi',
          endpoint: successEndpoint,
          spec,
          timestamp: new Date().toISOString(),
        })
      } else {
        return NextResponse.json({
          type: 'openapi',
          error: 'No OpenAPI specification found',
          attemptedEndpoints: possibleEndpoints,
          timestamp: new Date().toISOString(),
        }, { status: 404 })
      }
    } else if (type === 'all') {
      // Try to fetch both GraphQL and OpenAPI specs
      const results = await Promise.allSettled([
        // GraphQL introspection
        fetch(MES_GRAPHQL_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: INTROSPECTION_QUERY }),
        }).then(res => res.json()),
        
        // OpenAPI spec attempts
        ...([
          `${MES_API_ENDPOINT}/openapi/spec`,
          `${MES_API_ENDPOINT}/openapi/spec.json`,
          `${MES_API_ENDPOINT}/docs/json`,
          `${MES_API_ENDPOINT}/swagger.json`,
          `${MES_API_ENDPOINT}/openapi.json`,
        ].map(endpoint => 
          fetch(endpoint).then(res => res.json()).catch(() => null)
        ))
      ])

      const response: {
        timestamp: string
        endpoints: { graphql: string; api: string }
        graphql?: { available: boolean; schema?: Record<string, unknown>; error?: string }
        openapi?: { available: boolean; spec?: Record<string, unknown>; error?: string }
      } = {
        timestamp: new Date().toISOString(),
        endpoints: {
          graphql: MES_GRAPHQL_ENDPOINT,
          api: MES_API_ENDPOINT,
        }
      }

      // Process GraphQL result
      if (results[0].status === 'fulfilled' && results[0].value?.data) {
        response.graphql = {
          available: true,
          schema: results[0].value.data,
        }
      } else {
        response.graphql = {
          available: false,
          error: results[0].status === 'rejected' ? results[0].reason?.message : 'No schema data',
        }
      }

      // Process OpenAPI results
      const openApiResult = results.slice(1).find(result => 
        result.status === 'fulfilled' && result.value && 
        (result.value.openapi || result.value.swagger || result.value.info)
      )

      if (openApiResult && openApiResult.status === 'fulfilled') {
        response.openapi = {
          available: true,
          spec: openApiResult.value,
        }
      } else {
        response.openapi = {
          available: false,
          error: 'No OpenAPI specification found',
        }
      }

      return NextResponse.json(response)
    } else {
      return NextResponse.json({
        error: 'Invalid type parameter. Use: graphql, openapi, swagger, or all',
        availableTypes: ['graphql', 'openapi', 'swagger', 'all'],
      }, { status: 400 })
    }
  } catch (error) {
    console.error('Schema fetch error:', error)
    return NextResponse.json({
      error: 'Failed to fetch schema',
      message: error instanceof Error ? error.message : 'Unknown error',
      type,
      timestamp: new Date().toISOString(),
    }, { status: 500 })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
} 