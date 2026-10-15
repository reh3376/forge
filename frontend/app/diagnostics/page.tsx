'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Activity,
  Database,
  Server,
  Shield,
  Users,
  Settings,
  CheckCircle,
  AlertTriangle,
  Clock,
  ExternalLink
} from 'lucide-react'
import Link from 'next/link'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

interface DiagnosticTool {
  id: string
  title: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  status: 'healthy' | 'warning' | 'error' | 'unknown'
  category: 'health' | 'auth' | 'api' | 'config' | 'database'
}

const diagnosticTools: DiagnosticTool[] = [
  {
    id: 'health-monitoring',
    title: 'Health Monitoring',
    description: 'Real-time system health monitoring with endpoint testing',
    href: '/diagnostics/health-monitoring',
    icon: Activity,
    status: 'healthy',
    category: 'health'
  },
  {
    id: 'auth-status',
    title: 'Authentication Status',
    description: 'Check authentication configuration and user status',
    href: '/diagnostics/auth-status',
    icon: Shield,
    status: 'unknown',
    category: 'auth'
  },
  {
    id: 'role-debug',
    title: 'Role & Permissions',
    description: 'Debug user roles and permission assignments',
    href: '/diagnostics/role-debug',
    icon: Users,
    status: 'unknown',
    category: 'auth'
  },
  {
    id: 'azure-config',
    title: 'Azure Configuration',
    description: 'Verify Azure AD and service configurations',
    href: '/diagnostics/azure-config-checker',
    icon: Settings,
    status: 'unknown',
    category: 'config'
  },
  {
    id: 'env-check',
    title: 'Environment Check',
    description: 'Validate environment variables and configuration',
    href: '/diagnostics/env-check',
    icon: Settings,
    status: 'unknown',
    category: 'config'
  },
  {
    id: 'schema-test',
    title: 'Database Schema',
    description: 'Test database connectivity and schema validation',
    href: '/diagnostics/schema-test',
    icon: Database,
    status: 'unknown',
    category: 'database'
  },
  {
    id: 'schedule-api',
    title: 'Schedule API Test',
    description: 'Test scheduling API endpoints and functionality',
    href: '/diagnostics/schedule-api-test',
    icon: Server,
    status: 'unknown',
    category: 'api'
  }
]

const getStatusIcon = (status: DiagnosticTool['status']) => {
  switch (status) {
    case 'healthy':
      return <CheckCircle className="h-4 w-4 text-green-500" />
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />
    case 'error':
      return <AlertTriangle className="h-4 w-4 text-red-500" />
    default:
      return <Clock className="h-4 w-4 text-gray-400" />
  }
}

const getStatusBadge = (status: DiagnosticTool['status']) => {
  switch (status) {
    case 'healthy':
      return <Badge variant="default" className="bg-green-100 text-green-800">Healthy</Badge>
    case 'warning':
      return <Badge variant="destructive" className="bg-yellow-100 text-yellow-800">Warning</Badge>
    case 'error':
      return <Badge variant="destructive">Error</Badge>
    default:
      return <Badge variant="secondary">Unknown</Badge>
  }
}

const getCategoryColor = (category: DiagnosticTool['category']) => {
  switch (category) {
    case 'health':
      return 'border-l-green-500'
    case 'auth':
      return 'border-l-blue-500'
    case 'api':
      return 'border-l-purple-500'
    case 'config':
      return 'border-l-orange-500'
    case 'database':
      return 'border-l-red-500'
    default:
      return 'border-l-gray-500'
  }
}

export default function DiagnosticsPage() {
  const categories = Array.from(new Set(diagnosticTools.map(tool => tool.category)))

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Diagnostics</h1>
          <p className="text-muted-foreground">
            Monitor system health, test configurations, and debug issues
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Activity className="h-5 w-5 text-green-500" />
          <span className="text-sm text-muted-foreground">System Status</span>
        </div>
      </div>

      {categories.map(category => {
        const categoryTools = diagnosticTools.filter(tool => tool.category === category)
        const categoryTitle = category.charAt(0).toUpperCase() + category.slice(1)
        
        return (
          <div key={category} className="space-y-4">
            <h2 className="text-xl font-semibold capitalize">{categoryTitle} Diagnostics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categoryTools.map(tool => {
                const Icon = tool.icon
                return (
                  <Card key={tool.id} className={`border-l-4 ${getCategoryColor(tool.category)} hover:shadow-md transition-shadow`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Icon className="h-5 w-5" />
                          <CardTitle className="text-lg">{tool.title}</CardTitle>
                        </div>
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(tool.status)}
                          {getStatusBadge(tool.status)}
                        </div>
                      </div>
                      <CardDescription>{tool.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Link href={tool.href}>
                        <Button className="w-full" variant="outline">
                          <span>Open Diagnostic</span>
                          <ExternalLink className="h-4 w-4 ml-2" />
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        )
      })}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Activity className="h-5 w-5" />
            <span>Quick Actions</span>
          </CardTitle>
          <CardDescription>
            Common diagnostic tasks and system checks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Button variant="outline" className="h-auto p-4 flex flex-col items-center space-y-2">
              <CheckCircle className="h-6 w-6 text-green-500" />
              <span className="text-sm">Run All Checks</span>
            </Button>
            <Button variant="outline" className="h-auto p-4 flex flex-col items-center space-y-2">
              <Activity className="h-6 w-6 text-blue-500" />
              <span className="text-sm">System Health</span>
            </Button>
            <Button variant="outline" className="h-auto p-4 flex flex-col items-center space-y-2">
              <Database className="h-6 w-6 text-purple-500" />
              <span className="text-sm">Database Status</span>
            </Button>
            <Button variant="outline" className="h-auto p-4 flex flex-col items-center space-y-2">
              <Server className="h-6 w-6 text-orange-500" />
              <span className="text-sm">API Health</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 