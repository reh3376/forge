'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import AssetManagementWithTree from '@/components/AssetManagementWithTree'

export default function TestAssetsPage() {
  return (
    <div className="min-h-screen">
      <AssetManagementWithTree />
    </div>
  )
} 