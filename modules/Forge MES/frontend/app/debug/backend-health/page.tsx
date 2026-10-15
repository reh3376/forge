'use client'

import { PageContainer } from '@/components/ui/layout'
import { BackendHealthCheck } from '@/components/debug/backend-health-check'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

export default function BackendHealthPage() {
  return (
    <PageContainer>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Backend Health Check</h1>
          <p className="text-muted-foreground">
            Monitor the health and connectivity of backend services
          </p>
        </div>
        
        <BackendHealthCheck />
      </div>
    </PageContainer>
  )
} 