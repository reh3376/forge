'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { PageContainer } from '@/components/ui/layout'
import { DirectGraphQLTest } from '@/components/debug/DirectGraphQLTest'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export default function GraphQLTestPage() {
  return (
    <PageContainer>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/debug">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Debug
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">GraphQL Connection Test</h1>
            <p className="text-muted-foreground">
              Test direct GraphQL connections bypassing the Next.js proxy
            </p>
          </div>
        </div>

        <div className="grid gap-6 max-w-2xl">
          <DirectGraphQLTest />
        </div>
      </div>
    </PageContainer>
  )
} 