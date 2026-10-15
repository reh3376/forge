import { NextResponse } from 'next/server'

// Liveness probe - indicates if the application is alive and running
// This should be a simple check that doesn't depend on external services
export async function GET() {
  try {
    // Simple liveness check - if we can execute this code, we're alive
    const response = {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env['npm_package_version'] || '1.0.0'
    }
    
    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  } catch (error) {
    // If we can't even execute this simple check, something is very wrong
    return NextResponse.json(
      {
        status: 'dead',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
} 