/**
 * Direct GraphQL client for testing proxy authentication
 */

export async function testDirectConnection() {
  try {
    const response = await fetch('/api/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query TestQuery {
            __typename
          }
        `,
      }),
    })

    const result = await response.json()
    
    return {
      success: response.ok,
      status: response.status,
      data: result,
      error: response.ok ? null : result.error || 'Request failed'
    }
  } catch (error) {
    return {
      success: false,
      status: 0,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

export async function testGraphQLQuery(query: string, variables?: Record<string, unknown>) {
  try {
    const response = await fetch('/api/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    })

    const result = await response.json()
    
    return {
      success: response.ok,
      status: response.status,
      data: result,
      error: response.ok ? null : result.error || 'Request failed'
    }
  } catch (error) {
    return {
      success: false,
      status: 0,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
} 