'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, Settings, RefreshCw, Filter } from 'lucide-react'
import { toast } from 'sonner'
import { useEnzymeConfigurations } from '@/lib/hooks/use-enzyme-dosing'

export function EnzymeConfigurationViewer() {
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  // API hooks
  const { data: configurations = [], isLoading, error, refetch } = useEnzymeConfigurations()

  // Filter configurations based on search, category, and status
  const filteredConfigurations = configurations.filter((config) => {
    const matchesSearch = searchTerm === '' || 
      config.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      config.itemNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      config.itemDescription?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesCategory = categoryFilter === 'all' || config.itemGroup === categoryFilter
    // All enzyme items are considered available (no active/inactive status in data model)
    const matchesStatus = statusFilter === 'all' || statusFilter === 'active'

    return matchesSearch && matchesCategory && matchesStatus
  })

  const handleRefresh = () => {
    refetch()
    toast.success('Configurations Refreshed', {
      description: 'Enzyme configurations have been reloaded.'
    })
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'ENZYMES':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
      case 'RM-ENZ':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
    }
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-lg font-medium text-destructive">Failed to Load Configurations</div>
        <div className="text-sm text-muted-foreground mt-1">
          {error instanceof Error ? error.message : 'An unexpected error occurred'}
        </div>
        <Button onClick={handleRefresh} className="mt-4">
          <RefreshCw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <div className="text-lg font-medium">Loading Configurations...</div>
          <div className="text-sm text-muted-foreground">
            Retrieving enzyme configuration data
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filter & Search
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, manufacturer, product code, or instructions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="ENZYMES">Enzymes</SelectItem>
                <SelectItem value="RM-ENZ">Raw Material - Enzymes</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
              </SelectContent>
            </Select>
            
            <Button onClick={handleRefresh} variant="outline" disabled={isLoading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          
          <div className="text-sm text-muted-foreground">
            Showing {filteredConfigurations.length} of {configurations.length} configurations
          </div>
        </CardContent>
      </Card>

      {/* Configurations Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Enzyme Configurations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredConfigurations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <div className="text-lg font-medium">No Configurations Found</div>
              <div className="text-sm">
                {configurations.length === 0
                  ? 'No enzyme configurations available'
                  : 'Try adjusting your search or filter criteria'
                }
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Base Rate</TableHead>
                    <TableHead>Manufacturer</TableHead>
                    <TableHead>Product Code</TableHead>
                    <TableHead>Instructions</TableHead>
                    <TableHead>Last Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredConfigurations.map((config) => (
                    <TableRow key={config.id}>
                      <TableCell className="font-medium">
                        {config.itemName}
                      </TableCell>
                      <TableCell>
                        <Badge className={getCategoryColor(config.itemGroup || '')}>
                          {config.itemGroup || 'Unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-muted-foreground">
                          Available
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">
                        <span className="text-muted-foreground">—</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">—</span>
                      </TableCell>
                      <TableCell className="font-mono">
                        {config.itemNumber || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="truncate" title={config.itemDescription || ''}>
                          {config.itemDescription || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {config.updatedAt ? new Date(config.updatedAt).toLocaleDateString() : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 