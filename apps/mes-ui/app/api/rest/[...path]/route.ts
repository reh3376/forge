import { NextRequest, NextResponse } from 'next/server'

const REST_API_BASE = process.env['NEXT_PUBLIC_MES_API_URL'] || process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000/api'

// Service account credentials for MES backend
const MES_USERNAME = process.env['MES_BACKEND_USER'] || process.env['MES_USERNAME'] || 'mes'
const MES_PASSWORD = process.env['MES_BACKEND_PASSWORD'] || process.env['MES_PASSWORD'] || 'password'

// Cache for the service account JWT token
let serviceAccountToken: string | null = null
let tokenExpiry: number = 0

/**
 * Get or refresh the service account JWT token for MES backend
 */
async function getServiceAccountToken(): Promise<string | null> {
  // Check if we have a valid cached token
  const now = Math.floor(Date.now() / 1000)
  if (serviceAccountToken && tokenExpiry > now + 60) { // Refresh 1 minute before expiry
    return serviceAccountToken
  }

  try {
    console.log('🔐 Authenticating REST proxy as MES service account:', MES_USERNAME)
    
    const loginUrl = `${REST_API_BASE.replace('/api', '')}/api/login`
    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: MES_USERNAME,
        password: MES_PASSWORD,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`🔐 Service account login failed: ${response.status} ${response.statusText}`, errorText)
      return null
    }

    const authData = await response.json()
    serviceAccountToken = authData.accessToken
    
    // Decode token to get expiry (basic decode without verification)
    try {
      const payload = JSON.parse(atob(authData.accessToken.split('.')[1]))
      tokenExpiry = payload.exp || (now + 3600) // Default to 1 hour if no exp
    } catch {
      tokenExpiry = now + 3600 // Default to 1 hour
    }
    
    console.log('🔐 REST proxy service account authentication successful, token expires at:', new Date(tokenExpiry * 1000).toISOString())
    return serviceAccountToken
    
  } catch (error) {
    console.error('🔐 REST proxy service account authentication error:', error)
    serviceAccountToken = null
    tokenExpiry = 0
    return null
  }
}

export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  return handleRequest(request, params, 'GET')
}

export async function POST(request: NextRequest, { params }: { params: { path: string[] } }) {
  return handleRequest(request, params, 'POST')
}

export async function PUT(request: NextRequest, { params }: { params: { path: string[] } }) {
  return handleRequest(request, params, 'PUT')
}

export async function PATCH(request: NextRequest, { params }: { params: { path: string[] } }) {
  return handleRequest(request, params, 'PATCH')
}

export async function DELETE(request: NextRequest, { params }: { params: { path: string[] } }) {
  return handleRequest(request, params, 'DELETE')
}

async function handleRequest(
  request: NextRequest,
  params: { path: string[] },
  method: string
) {
  try {
    // Await params to fix Next.js 15 warning
    const { path: pathArray } = await params
    
    // Reconstruct the path
    const path = pathArray.join('/')
    const targetUrl = `${REST_API_BASE}/${path}`
    
    // Get query parameters from the original request
    const url = new URL(request.url)
    const searchParams = url.searchParams.toString()
    const finalUrl = searchParams ? `${targetUrl}?${searchParams}` : targetUrl
    
    // Get service account JWT token for MES backend
    const mesToken = await getServiceAccountToken()
    
    const authHeaders: Record<string, string> = {}
    
    if (mesToken) {
      // Use service account JWT token for backend authentication
      authHeaders['authorization'] = `Bearer ${mesToken}`
      console.log('🔐 Using service account JWT token for MES backend REST API')
    } else {
      // Fallback to development mode headers if service account auth fails
      if (process.env.NODE_ENV === 'development') {
        console.log('🔐 Service account auth failed, using development bypass headers')
        authHeaders['x-development-mode'] = 'true'
        authHeaders['x-demo-user'] = 'true'
        authHeaders['x-demo-user-id'] = 'demo-user-supervisor'
        authHeaders['x-demo-user-role'] = 'OPS_DISTILLERY_SUPERVISOR'
      } else {
        console.error('🔐 No authentication available for MES backend REST API')
        return NextResponse.json(
          { error: 'Backend authentication failed' },
          { status: 500 }
        )
      }
    }
    
    // Prepare request options
    const requestOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        // Forward relevant headers from the original request
        ...Object.fromEntries(
          ['accept', 'accept-language', 'user-agent'].map(header => [
            header,
            request.headers.get(header) || ''
          ]).filter(([, value]) => value)
        ),
        ...authHeaders,
      },
    }
    
    // Add body for methods that support it
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try {
        const body = await request.text()
        if (body) {
          requestOptions.body = body
        }
      } catch (error) {
        console.warn('Could not read request body:', error)
      }
    }
    
    console.log(`🔄 REST Proxy: ${method} ${finalUrl}`, {
      hasAuth: !!mesToken,
      authType: mesToken ? 'service-account-jwt' : 'development-bypass',
      path: `/${path}`
    })
    
    const response = await fetch(finalUrl, requestOptions)
    
    if (!response.ok) {
      // Log the error for debugging
      const errorText = await response.text()
      console.error(`REST API request failed: ${response.status} ${response.statusText}`, {
        url: finalUrl,
        method,
        errorText: errorText.slice(0, 500) // Limit error text length
      })
      
      // If it's an auth error, clear the cached token and retry once
      if (response.status === 401 && mesToken) {
        console.log('🔐 Auth error detected, clearing cached token and retrying...')
        serviceAccountToken = null
        tokenExpiry = 0
        
        // Retry with fresh token
        const freshToken = await getServiceAccountToken()
        if (freshToken) {
          const retryOptions = {
            ...requestOptions,
            headers: {
              ...requestOptions.headers,
              'authorization': `Bearer ${freshToken}`,
            },
          }
          
          const retryResponse = await fetch(finalUrl, retryOptions)
          
          if (retryResponse.ok) {
            const retryData = await retryResponse.text()
            return new NextResponse(retryData, {
              status: retryResponse.status,
              headers: {
                'Content-Type': retryResponse.headers.get('Content-Type') || 'application/json',
                // Forward relevant response headers
                ...Object.fromEntries(
                  ['cache-control', 'etag', 'last-modified'].map(header => [
                    header,
                    retryResponse.headers.get(header) || ''
                  ]).filter(([, value]) => value)
                ),
              },
            })
          }
        }
      }
      
      // Return the error response with the same status
      return new NextResponse(errorText, {
        status: response.status,
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'application/json',
        },
      })
    }
    
    // Get the response data
    const responseData = await response.text()
    
    // Return successful response
    return new NextResponse(responseData, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        // Forward relevant response headers
        ...Object.fromEntries(
          ['cache-control', 'etag', 'last-modified'].map(header => [
            header,
            response.headers.get(header) || ''
          ]).filter(([, value]) => value)
        ),
      },
    })
  } catch (error) {
    console.error('REST proxy error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-auth-token',
    },
  })
} 