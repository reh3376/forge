import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const envDebug = {
    NODE_ENV: process.env.NODE_ENV,
    MES_USERNAME: process.env.MES_USERNAME ? '✓ Set' : '✗ Not set',
    MES_PASSWORD: process.env.MES_PASSWORD ? '✓ Set' : '✗ Not set',
    MES_BACKEND_USER: process.env.MES_BACKEND_USER ? '✓ Set' : '✗ Not set',
    MES_BACKEND_PASSWORD: process.env.MES_BACKEND_PASSWORD ? '✓ Set' : '✗ Not set',
    NEXT_PUBLIC_MES_GRAPHQL_URL: process.env.NEXT_PUBLIC_MES_GRAPHQL_URL || 'Not set',
    NEXT_PUBLIC_MES_API_URL: process.env.NEXT_PUBLIC_MES_API_URL || 'Not set',

    resolvedUsername: (process.env.MES_BACKEND_USER || process.env.MES_USERNAME) ? 'Set' : 'Not set',
  }

  console.log('Environment Debug:', envDebug)

  return NextResponse.json(envDebug)
}
