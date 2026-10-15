'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { Activity, Filter, Download, RefreshCw, ChevronDown, ChevronRight, Eye } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'

// Import the new GraphQL hook and types
import { 
  useAuditLogs, 
  AuditLogEntry, 
  AuditLogUser, 
  AuditFilters
} from '@/lib/api/graphql/audit-logs'

interface AuditTrailProps {
  className?: string
  entityType?: string
  entityId?: string
  showFilters?: boolean
  showExport?: boolean
  maxHeight?: string
}

export function AuditTrail({
  className,
  entityType: defaultEntityType,
  entityId: defaultEntityId,
  showFilters = true,
  showExport = true,
  maxHeight = '600px'
}: AuditTrailProps) {
  // State management
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  
  // Filter state
  const [filters, setFilters] = useState<AuditFilters>(() => {
    const initialFilters: AuditFilters = {}
    if (defaultEntityType) initialFilters.entityType = defaultEntityType
    if (defaultEntityId) initialFilters.entityId = defaultEntityId
    return initialFilters
  })
  const [showFilterPanel, setShowFilterPanel] = useState(false)

  // Use the new GraphQL hook
  const { fetchAuditLogs } = useAuditLogs()

  // Fetch audit logs using GraphQL
  const loadAuditLogs = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await fetchAuditLogs(
        currentPage + 1, // GraphQL uses 1-based pagination
        pageSize,
        'createdAt',
        'desc',
        filters
      )
      
      if (result) {
        setAuditLogs(result.data)
        setTotalItems(result.total)
        setTotalPages(result.totalPages)
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch audit logs')
    } finally {
      setLoading(false)
    }
  }, [currentPage, pageSize, filters, fetchAuditLogs])

  // Effect to fetch data when dependencies change
  useEffect(() => {
    loadAuditLogs()
  }, [loadAuditLogs])

  // Handle filter changes
  const handleFilterChange = (key: keyof AuditFilters, value: string | undefined) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setCurrentPage(0) // Reset to first page when filters change
  }

  // Clear all filters
  const clearFilters = () => {
    const clearedFilters: AuditFilters = {}
    if (defaultEntityType) clearedFilters.entityType = defaultEntityType
    if (defaultEntityId) clearedFilters.entityId = defaultEntityId
    setFilters(clearedFilters)
    setCurrentPage(0)
  }

  // Toggle row expansion
  const toggleRowExpansion = (logId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev)
      if (newSet.has(logId)) {
        newSet.delete(logId)
      } else {
        newSet.add(logId)
      }
      return newSet
    })
  }

  // Format user display name
  const formatUserName = (user: AuditLogUser) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName} (${user.username})`
    }
    return user.username
  }

  // Format action badge
  const getActionBadge = (action: string) => {
    const variants = {
      CREATE: 'default',
      UPDATE: 'secondary',
      DELETE: 'destructive',
    } as const

    return (
      <Badge variant={variants[action as keyof typeof variants] || 'outline'}>
        {action}
      </Badge>
    )
  }

  // Format changes display
  const formatChanges = (oldValues?: Record<string, unknown> | null, newValues?: Record<string, unknown> | null) => {
    if (!oldValues && !newValues) return 'No changes recorded'
    
    if (!oldValues) {
      // CREATE operation
      return Object.entries(newValues || {})
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join(', ')
    }
    
    if (!newValues) {
      // DELETE operation
      return 'Entity deleted'
    }
    
    // UPDATE operation - show changes
    const changes: string[] = []
    const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)])
    
    allKeys.forEach(key => {
      const oldVal = oldValues[key]
      const newVal = newValues[key]
      
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push(`${key}: ${JSON.stringify(oldVal)} → ${JSON.stringify(newVal)}`)
      }
    })
    
    return changes.length > 0 ? changes.join(', ') : 'No changes detected'
  }

  // Export functionality
  const handleExport = async () => {
    try {
      // For now, export current page data as CSV
      const csvContent = [
        // Header
        ['Timestamp', 'Action', 'Entity Type', 'Entity ID', 'User', 'Changes'].join(','),
        // Data rows
        ...auditLogs.map(log => [
          format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm:ss'),
          log.action,
          log.entityType,
          log.entityId,
          formatUserName(log.user),
          `"${formatChanges(log.oldValues, log.newValues).replace(/"/g, '""')}"`
        ].join(','))
      ].join('\n')

      const blob = new Blob([csvContent], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-trail-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export audit trail:', err)
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Audit Trail
            </CardTitle>
            <CardDescription>
              Track all configuration changes and user activities
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {showFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilterPanel(!showFilterPanel)}
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadAuditLogs()}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {showExport && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={loading || auditLogs.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            )}
          </div>
        </div>

        {/* Filter Panel */}
        {showFilters && showFilterPanel && (
          <div className="space-y-4 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 border rounded-lg bg-muted/50">
              <div className="space-y-2">
                <Label htmlFor="entity-type">Entity Type</Label>
                <Input
                  id="entity-type"
                  placeholder="e.g., Recipe, User"
                  value={filters.entityType || ''}
                  onChange={(e) => handleFilterChange('entityType', e.target.value || undefined)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="entity-id">Entity ID</Label>
                <Input
                  id="entity-id"
                  placeholder="Entity identifier"
                  value={filters.entityId || ''}
                  onChange={(e) => handleFilterChange('entityId', e.target.value || undefined)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="action">Action</Label>
                <Select
                  value={filters.action || ''}
                  onValueChange={(value) => handleFilterChange('action', value || undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Actions</SelectItem>
                    <SelectItem value="CREATE">Create</SelectItem>
                    <SelectItem value="UPDATE">Update</SelectItem>
                    <SelectItem value="DELETE">Delete</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="user-id">User ID</Label>
                <Input
                  id="user-id"
                  placeholder="User identifier"
                  value={filters.userId || ''}
                  onChange={(e) => handleFilterChange('userId', e.target.value || undefined)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="datetime-local"
                  value={filters.startDate || ''}
                  onChange={(e) => handleFilterChange('startDate', e.target.value || undefined)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="datetime-local"
                  value={filters.endDate || ''}
                  onChange={(e) => handleFilterChange('endDate', e.target.value || undefined)}
                />
              </div>
              
              <div className="flex items-end">
                <Button variant="outline" onClick={clearFilters}>
                  Clear Filters
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {/* Error Display */}
        {error && (
          <Alert className="mb-4">
            <AlertDescription>
              {error}
            </AlertDescription>
          </Alert>
        )}

        {/* Loading State */}
        {loading && auditLogs.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            Loading audit trail...
          </div>
        ) : auditLogs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No audit trail entries found.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Results Summary */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {auditLogs.length} of {totalItems} entries
              </span>
              <span>
                Page {currentPage + 1} of {totalPages}
              </span>
            </div>

            {/* Audit Logs Table */}
            <div style={{ maxHeight, overflowY: 'auto' }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]"></TableHead>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Changes</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((log) => (
                    <>
                      <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleRowExpansion(log.id)}
                          >
                            {expandedRows.has(log.id) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {format(new Date(log.createdAt), 'MMM dd, yyyy')}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(log.createdAt), 'HH:mm:ss')}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getActionBadge(log.action)}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{log.entityType}</div>
                          <div className="text-xs text-muted-foreground">{log.entityId}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{formatUserName(log.user)}</div>
                          {log.ipAddress && (
                            <div className="text-xs text-muted-foreground">{log.ipAddress}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm max-w-[300px] truncate">
                            {formatChanges(log.oldValues, log.newValues)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle>Audit Log Details</DialogTitle>
                                <DialogDescription>
                                  Detailed view of audit log entry
                                </DialogDescription>
                              </DialogHeader>
                              {selectedLog && (
                                <div className="space-y-4">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <Label className="text-sm font-medium">Timestamp</Label>
                                      <p className="text-sm">{format(new Date(selectedLog.createdAt), 'PPpp')}</p>
                                    </div>
                                    <div>
                                      <Label className="text-sm font-medium">Action</Label>
                                      <p className="text-sm">{getActionBadge(selectedLog.action)}</p>
                                    </div>
                                    <div>
                                      <Label className="text-sm font-medium">Entity Type</Label>
                                      <p className="text-sm">{selectedLog.entityType}</p>
                                    </div>
                                    <div>
                                      <Label className="text-sm font-medium">Entity ID</Label>
                                      <p className="text-sm font-mono">{selectedLog.entityId}</p>
                                    </div>
                                    <div>
                                      <Label className="text-sm font-medium">User</Label>
                                      <p className="text-sm">{formatUserName(selectedLog.user)}</p>
                                    </div>
                                    <div>
                                      <Label className="text-sm font-medium">Global ID</Label>
                                      <p className="text-sm font-mono">{selectedLog.globalId}</p>
                                    </div>
                                  </div>
                                  
                                  {selectedLog.ipAddress && (
                                    <div>
                                      <Label className="text-sm font-medium">IP Address</Label>
                                      <p className="text-sm">{selectedLog.ipAddress}</p>
                                    </div>
                                  )}
                                  
                                  {selectedLog.userAgent && (
                                    <div>
                                      <Label className="text-sm font-medium">User Agent</Label>
                                      <p className="text-sm">{selectedLog.userAgent}</p>
                                    </div>
                                  )}
                                  
                                  <hr className="my-4" />
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {selectedLog.oldValues && (
                                      <div>
                                        <Label className="text-sm font-medium">Old Values</Label>
                                        <div className="h-[200px] w-full border rounded p-2 overflow-auto">
                                          <pre className="text-xs">
                                            {JSON.stringify(selectedLog.oldValues, null, 2)}
                                          </pre>
                                        </div>
                                      </div>
                                    )}
                                    
                                    {selectedLog.newValues && (
                                      <div>
                                        <Label className="text-sm font-medium">New Values</Label>
                                        <div className="h-[200px] w-full border rounded p-2 overflow-auto">
                                          <pre className="text-xs">
                                            {JSON.stringify(selectedLog.newValues, null, 2)}
                                          </pre>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                      
                      {/* Expanded Row Content */}
                      {expandedRows.has(log.id) && (
                        <TableRow>
                          <TableCell colSpan={7} className="bg-muted/30">
                            <div className="p-4 space-y-3">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                <div>
                                  <Label className="font-medium">Global ID</Label>
                                  <p className="font-mono">{log.globalId}</p>
                                </div>
                                {log.ipAddress && (
                                  <div>
                                    <Label className="font-medium">IP Address</Label>
                                    <p>{log.ipAddress}</p>
                                  </div>
                                )}
                                {log.userAgent && (
                                  <div className="md:col-span-2">
                                    <Label className="font-medium">User Agent</Label>
                                    <p className="text-xs">{log.userAgent}</p>
                                  </div>
                                )}
                              </div>
                              
                              <hr className="my-2" />
                              
                              <div>
                                <Label className="font-medium">Detailed Changes</Label>
                                <div className="mt-2 p-3 bg-background rounded border">
                                  <pre className="text-xs whitespace-pre-wrap">
                                    {formatChanges(log.oldValues, log.newValues)}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label htmlFor="page-size">Items per page:</Label>
                  <Select
                    value={pageSize.toString()}
                    onValueChange={(value) => {
                      setPageSize(parseInt(value))
                      setCurrentPage(0)
                    }}
                  >
                    <SelectTrigger className="w-[80px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                    disabled={currentPage === 0 || loading}
                  >
                    Previous
                  </Button>
                  
                  <span className="text-sm">
                    Page {currentPage + 1} of {totalPages}
                  </span>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                    disabled={currentPage >= totalPages - 1 || loading}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default AuditTrail 