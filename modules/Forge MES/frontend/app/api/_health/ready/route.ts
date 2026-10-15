import { NextResponse } from 'next/server'

// Readiness probe - indicates if the application is ready to serve traffic
// This should check dependencies like database, external APIs, etc.
export async function GET() {
  try {
    // Check if all dependencies are ready
    // In a real app, you'd check database connectivity, external APIs, etc.
    
    // Simulate dependency checks
    const checks = await Promise.allSettled([
      // Simulate database check
      new Promise(resolve => setTimeout(resolve, Math.random() * 50)),
      // Simulate external API check
      new Promise(resolve => setTimeout(resolve, Math.random() * 30))
    ])
    
    // If any critical dependency is down, we're not ready
    const allReady = checks.every(check => check.status === 'fulfilled')
    
    const response = {
      status: allReady ? 'ready' : 'not ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: checks[0].status === 'fulfilled' ? 'ok' : 'failed',
        externalApi: checks[1].status === 'fulfilled' ? 'ok' : 'failed'
      }
    }
    
    return NextResponse.json(response, {
      status: allReady ? 200 : 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  } catch (error) {
    // If we can't check readiness, we're not ready
    return NextResponse.json(
      {
        status: 'not ready',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 503 }
    )
  }
} 