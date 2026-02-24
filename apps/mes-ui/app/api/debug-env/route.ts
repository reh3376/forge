import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const envDebug = {
    NODE_ENV: process.env.NODE_ENV,
    MES_USERNAME: process.env.MES_USERNAME ? '✓ Set' : '✗ Not set',
    MES_PASSWORD: process.env.MES_PASSWORD ? `✓ Set (${process.env.MES_PASSWORD?.length} chars)` : '✗ Not set',
    NEXT_PUBLIC_MES_GRAPHQL_URL: process.env.NEXT_PUBLIC_MES_GRAPHQL_URL || 'Not set',
    NEXT_PUBLIC_MES_API_URL: process.env.NEXT_PUBLIC_MES_API_URL || 'Not set',

    // Show what the graphql route would actually use
    resolvedUsername: process.env.MES_USERNAME || 'mes',
    resolvedPasswordLength: (process.env.MES_PASSWORD || 'password').length,
  }

  console.log('🔍 Environment Debug:', envDebug)

  return NextResponse.json(envDebug)
}
