'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { RouteGuard } from '@/components/auth/route-guard'
import { ManufacturingPermission } from '@/lib/auth-config'
import { PageContainer } from '@/components/ui/layout'
import BinConfigurationManagement from '@/components/configuration/bin-configuration-management'

export default function BinConfigurationPage() {
  return (
    <RouteGuard 
      config={{
        requiresAuth: true,
        requiredPermissions: [ManufacturingPermission.SYSTEM_SETTINGS],
        redirectTo: '/configuration'
      }}
    >
      <PageContainer>
        <BinConfigurationManagement />
      </PageContainer>
    </RouteGuard>
  )
} 