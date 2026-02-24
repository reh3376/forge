'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, Download, Trash2, Eye, Calendar, Filter, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { 
  useEnzymeCalculationHistory
} from '@/lib/hooks/use-enzyme-dosing'

export function CalculationHistory() {
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState('all')
  const [userFilter, setUserFilter] = useState('all')

  // API hooks
  const { data: calculations = [], isLoading, error, refetch } = useEnzymeCalculationHistory()
  // Note: Delete functionality will need to be implemented later

  // Filter calculations based on search and filters
  const filteredCalculations = calculations.filter((calc) => {
    const recipeName = calc.recipe?.[0]?.Recipe || 'Unknown Recipe'
    const searchableText = `${recipeName} ${calc.id}`.toLowerCase()
    
    const matchesSearch = searchTerm === '' || searchableText.includes(searchTerm.toLowerCase())

    const matchesDate = dateFilter === 'all' || (() => {
      if (!calc.createdAt) return true
      const calcDate = new Date(calc.createdAt)
      const now = new Date()
      
      switch (dateFilter) {
        case 'today':
          return calcDate.toDateString() === now.toDateString()
        case 'week':
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          return calcDate >= weekAgo
        case 'month':
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          return calcDate >= monthAgo
        default:
          return true
      }
    })()

    // For now, we'll skip user filtering since we don't have user data
    const matchesUser = userFilter === 'all'

    return matchesSearch && matchesDate && matchesUser
  })

  // Get unique users for filter (empty for now since we don't have user data)
  const uniqueUsers: string[] = []

  const handleView = (calculationId: string) => {
    // TODO: Implement view calculation details
    toast.info('View Details', {
      description: `Viewing calculation ${calculationId}`
    })
  }

  const handleDelete = async (calculationId: string) => {
    // Note: Delete functionality will need to be implemented later
    console.error('Delete functionality not implemented')
  }

  const handleExport = () => {
    if (filteredCalculations.length === 0) {
      toast.error('No Data to Export', {
        description: 'No calculations match your current filters.'
      })
      return
    }

    // Create CSV content
    const headers = ['BOM ID', 'Recipe Name', 'Revision', 'Enzyme Items', 'Created At']
    const csvContent = [
      headers.join(','),
      ...filteredCalculations.map(calc => [
        calc.id,
        calc.recipe?.[0]?.Recipe || 'Unknown Recipe',
        calc.recipe?.[0]?.revision?.toString() || '',
        calc.recipeBomITem?.filter(item => item.item.itemGroup?.includes('ENZ')).length.toString() || '0',
        calc.createdAt ? new Date(calc.createdAt).toLocaleString() : ''
      ].map(field => `"${field}"`).join(','))
    ].join('\n')

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `enzyme-calculation-history-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast.success('Export Complete', {
      description: `Exported ${filteredCalculations.length} calculations to CSV`
    })
  }

  const handleRefresh = () => {
    refetch()
    toast.success('History Refreshed', {
      description: 'Calculation history has been updated'
    })
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-lg font-medium text-destructive">Failed to Load History</div>
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
      <div className="text-center py-8">
        <div className="text-lg font-medium">Loading History...</div>
        <div className="text-sm text-muted-foreground">
          Retrieving calculation history
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters and Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filter & Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by recipe name or BOM ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">Last 7 Days</SelectItem>
                <SelectItem value="month">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by user" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {uniqueUsers.map((user) => (
                  <SelectItem key={user} value={user}>
                    {user}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              Showing {filteredCalculations.length} of {calculations.length} calculations
            </div>
            
            <div className="flex gap-2">
              <Button onClick={handleRefresh} variant="outline" size="sm">
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button onClick={handleExport} variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* History Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Calculation History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredCalculations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <div className="text-lg font-medium">No Calculations Found</div>
              <div className="text-sm">
                {calculations.length === 0 
                  ? 'No calculations have been performed yet'
                  : 'Try adjusting your search or filter criteria'
                }
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>BOM ID</TableHead>
                    <TableHead>Recipe Name</TableHead>
                    <TableHead>Revision</TableHead>
                    <TableHead>Enzyme Items</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCalculations.map((calculation) => {
                    const enzymeItems = calculation.recipeBomITem?.filter(item => 
                      item.item.itemGroup?.includes('ENZ')
                    ) || []
                    
                    return (
                      <TableRow key={calculation.id}>
                        <TableCell className="font-mono text-sm">
                          {calculation.id}
                        </TableCell>
                        <TableCell className="font-mono">
                          {calculation.recipe?.[0]?.Recipe || 'Unknown Recipe'}
                        </TableCell>
                        <TableCell>
                          {calculation.recipe?.[0]?.revision || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {enzymeItems.length} enzyme{enzymeItems.length !== 1 ? 's' : ''}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {calculation.createdAt ? new Date(calculation.createdAt).toLocaleString() : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleView(calculation.id)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(calculation.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 