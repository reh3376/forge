'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import React from 'react'
import { AuditTrail } from '@/components/configuration/audit-trail'

export default function AuditTrailPage() {
  return (
    <div className="container mx-auto py-6">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Audit Trail</h1>
          <p className="text-muted-foreground">
            View and track all system changes and user activities
          </p>
        </div>
        
        <AuditTrail 
          showFilters={true}
          showExport={true}
          maxHeight="800px"
        />
      </div>
    </div>
  )
} 