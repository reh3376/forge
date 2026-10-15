'use client'

export const dynamic = 'force-dynamic'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageContainer } from '@/components/ui/layout'
import { RouteGuard } from '@/components/auth/route-guard'
import { ManufacturingPermission } from '@/lib/auth-config'
import { useAuth } from '@/lib/auth-context'
import { UnifiedGraphQLClient } from '@/lib/api/unified-graphql-client'
import {
  GET_PRODUCTION_METRICS,
  UPDATE_PRODUCTION_METRIC_VALUE,
} from '@/lib/api/yield-estimation-queries'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Save,
  BarChart3,
  Beaker,
  Settings2,
  History,
} from 'lucide-react'

// Create the GraphQL client instance with JWT authentication
const graphqlClient = new UnifiedGraphQLClient({
  useJWTAuth: true,
  enableRetry: true,
})

interface ProductionMetric {
  id: string
  name: string
  displayName: string
  description?: string | null
  valueNumeric?: number | null
  valueString?: string | null
  unit?: string | null
  category: string
  whiskeyType?: string | null
  sourceType: string
  isActive: boolean
  isSystem: boolean
  tags: string[]
  previousValue?: number | null
  lastValueChange?: string | null
}

const CATEGORY_META: Record<string, { icon: React.ReactNode; color: string; description: string }> = {
  Yield: {
    icon: <Beaker className="h-4 w-4" />,
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    description: 'Yield rate parameters by whiskey type',
  },
  Constants: {
    icon: <Settings2 className="h-4 w-4" />,
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
    description: 'Global production constants',
  },
  Equipment: {
    icon: <BarChart3 className="h-4 w-4" />,
    color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
    description: 'Equipment capacity parameters',
  },
}

export default function ProductionMetricsPage() {
  const [metrics, setMetrics] = useState<ProductionMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const { user } = useAuth()

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true)
      const result = await graphqlClient.query<{ productionMetrics: ProductionMetric[] }>(
        GET_PRODUCTION_METRICS,
        { fetchPolicy: 'network-only' }
      )
      setMetrics(result.productionMetrics || [])
    } catch (err) {
      console.error('Failed to fetch production metrics:', err)
      toast.error('Failed to load production metrics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMetrics()
  }, [fetchMetrics])

  const startEditing = (metric: ProductionMetric) => {
    setEditingId(metric.id)
    setEditValue(metric.valueNumeric?.toString() || '')
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditValue('')
  }

  const saveMetricValue = async (metricId: string) => {
    const numericValue = parseFloat(editValue)
    if (isNaN(numericValue)) {
      toast.error('Please enter a valid number')
      return
    }

    try {
      setSaving(true)
      await graphqlClient.mutate(
        UPDATE_PRODUCTION_METRIC_VALUE,
        {
          variables: {
            id: metricId,
            value: numericValue,
            updatedBy: user?.email || 'unknown',
          },
        }
      )
      toast.success('Metric updated successfully')
      setEditingId(null)
      setEditValue('')
      await fetchMetrics()
    } catch (err) {
      console.error('Failed to update metric:', err)
      toast.error('Failed to update metric')
    } finally {
      setSaving(false)
    }
  }

  // Group metrics by category
  const grouped = metrics.reduce<Record<string, ProductionMetric[]>>((acc, m) => {
    if (!acc[m.category]) acc[m.category] = []
    acc[m.category].push(m)
    return acc
  }, {})

  const formatWhiskeyType = (wt: string | null | undefined): string => {
    if (!wt) return 'All Types'
    return wt.replace(/([A-Z])/g, ' $1').trim()
  }

  return (
    <RouteGuard config={{ requiresAuth: true, requiredPermissions: [ManufacturingPermission.SYSTEM_SETTINGS] }}>
      <PageContainer>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/configuration">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold">Production Metrics</h1>
                <p className="text-sm text-muted-foreground">
                  Yield rates, equipment parameters, and production constants used for scheduling calculations
                </p>
              </div>
            </div>
          </div>

          {loading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                Loading metrics...
              </CardContent>
            </Card>
          ) : (
            Object.entries(grouped).map(([category, categoryMetrics]) => {
              const meta = CATEGORY_META[category] || {
                icon: <Settings2 className="h-4 w-4" />,
                color: 'bg-gray-100 text-gray-800',
                description: category,
              }

              return (
                <Card key={category}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.color}`}>
                        {meta.icon}
                        {category}
                      </span>
                      <span className="text-lg">{meta.description}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Metric</TableHead>
                          <TableHead>Scope</TableHead>
                          <TableHead className="text-right">Value</TableHead>
                          <TableHead>Unit</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Previous</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {categoryMetrics.map((metric) => (
                          <TableRow key={metric.id}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{metric.displayName}</div>
                                {metric.description && (
                                  <div className="text-xs text-muted-foreground max-w-xs truncate">
                                    {metric.description}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {formatWhiskeyType(metric.whiskeyType)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {editingId === metric.id ? (
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveMetricValue(metric.id)
                                    if (e.key === 'Escape') cancelEditing()
                                  }}
                                  className="w-24 text-right"
                                  autoFocus
                                />
                              ) : (
                                <span className="font-mono font-semibold">
                                  {metric.valueNumeric ?? '—'}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground">{metric.unit || '—'}</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">
                                {metric.sourceType}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {metric.previousValue != null ? (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <History className="h-3 w-3" />
                                  {metric.previousValue}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {editingId === metric.id ? (
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={cancelEditing}
                                    disabled={saving}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => saveMetricValue(metric.id)}
                                    disabled={saving}
                                  >
                                    <Save className="h-3 w-3 mr-1" />
                                    Save
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => startEditing(metric)}
                                >
                                  Edit
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )
            })
          )}

          {/* Info Footer */}
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                These metrics drive yield estimation calculations throughout the system. Changes take effect within 30 seconds
                for all schedule order calculations. The system tracks previous values for audit purposes.
              </p>
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    </RouteGuard>
  )
}
