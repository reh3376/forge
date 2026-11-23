import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    NEXT_PUBLIC_DISABLE_DEV_MODE: process.env['NEXT_PUBLIC_DISABLE_DEV_MODE'],
    NEXT_PUBLIC_AZURE_AD_CLIENT_ID: process.env['NEXT_PUBLIC_AZURE_AD_CLIENT_ID'],
    NEXT_PUBLIC_AZURE_AD_TENANT_ID: process.env['NEXT_PUBLIC_AZURE_AD_TENANT_ID'],
    NEXT_PUBLIC_ENABLE_DEMO_USER: process.env['NEXT_PUBLIC_ENABLE_DEMO_USER'],
    NODE_ENV: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  })
} 