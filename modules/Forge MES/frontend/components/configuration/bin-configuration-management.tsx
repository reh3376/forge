'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Plus, 
  Edit, 
  Trash2, 
  RefreshCw, 
  AlertTriangle,
  CheckCircle,
  Package,
  Building2,
  Loader2
} from 'lucide-react'
import { useMillingBinConfigurations } from '@/hooks/use-milling-bin-configurations'
import { type MillingBinConfiguration } from '@/lib/api/graphql/milling-bin-configuration'

interface BinConfigurationFormData {
  binId: string
  itemGroupId: string
}

export default function BinConfigurationManagement() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedConfiguration, setSelectedConfiguration] = useState<MillingBinConfiguration | null>(null)
  const [formData, setFormData] = useState<BinConfigurationFormData>({
    binId: '',
    itemGroupId: ''
  })

  const {
    configurations,
    assets,
    itemGroups,
    availableAssets,
    loading,
    error,
    createConfiguration,
    updateConfiguration,
    deleteConfiguration,
    refresh
  } = useMillingBinConfigurations({
    onSuccess: (message) => {
      console.log('Success:', message)
      handleCloseDialogs()
    },
    onError: (error) => {
      console.error('Error:', error)
    }
  })

  const handleCloseDialogs = () => {
    setIsCreateDialogOpen(false)
    setIsEditDialogOpen(false)
    setIsDeleteDialogOpen(false)
    setSelectedConfiguration(null)
    setFormData({ binId: '', itemGroupId: '' })
  }

  const handleCreate = () => {
    setFormData({ binId: '', itemGroupId: '' })
    setIsCreateDialogOpen(true)
  }

  const handleEdit = (configuration: MillingBinConfiguration) => {
    setSelectedConfiguration(configuration)
    setFormData({
      binId: configuration.bin.id,
      itemGroupId: configuration.itemGroup.id
    })
    setIsEditDialogOpen(true)
  }

  const handleDelete = (configuration: MillingBinConfiguration) => {
    setSelectedConfiguration(configuration)
    setIsDeleteDialogOpen(true)
  }

  const handleSubmitCreate = async () => {
    if (!formData.binId || !formData.itemGroupId) {
      return
    }
    await createConfiguration(formData.binId, formData.itemGroupId)
  }

  const handleSubmitEdit = async () => {
    if (!selectedConfiguration || !formData.binId || !formData.itemGroupId) {
      return
    }
    await updateConfiguration(
      selectedConfiguration.id,
      formData.binId,
      formData.itemGroupId
    )
  }

  const handleSubmitDelete = async () => {
    if (!selectedConfiguration) {
      return
    }
    await deleteConfiguration(selectedConfiguration.id)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Error Loading Bin Configurations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Failed to load bin configuration data. Please check your connection and try again.
            </AlertDescription>
          </Alert>
          <Button onClick={refresh} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Bin Configuration Management</h2>
          <p className="text-muted-foreground">
            Configure which item groups are associated with specific bins for production orders
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={refresh} variant="outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={handleCreate} disabled={loading || availableAssets.length === 0}>
            <Plus className="h-4 w-4 mr-2" />
            Add Configuration
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Configurations</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{configurations.length}</div>
            <p className="text-xs text-muted-foreground">
              Active bin-to-item group mappings
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Assets</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{availableAssets.length}</div>
            <p className="text-xs text-muted-foreground">
              Unconfigured assets ready for setup
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Item Groups</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{itemGroups.length}</div>
            <p className="text-xs text-muted-foreground">
              Available item group categories
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Configurations Table */}
      <Card>
        <CardHeader>
          <CardTitle>Current Configurations</CardTitle>
          <CardDescription>
            Manage the mapping between bins (assets) and item groups for production planning
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Loading configurations...</span>
            </div>
          ) : configurations.length === 0 ? (
            <div className="text-center py-8">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Configurations Found</h3>
              <p className="text-muted-foreground mb-4">
                Get started by creating your first bin configuration
              </p>
              <Button onClick={handleCreate} disabled={availableAssets.length === 0}>
                <Plus className="h-4 w-4 mr-2" />
                Add Configuration
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bin (Asset)</TableHead>
                  <TableHead>Item Group</TableHead>
                  <TableHead>Asset Type</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configurations.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{config.bin.name}</div>
                        {config.bin.description && (
                          <div className="text-sm text-muted-foreground">
                            {config.bin.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{config.itemGroup.name}</div>
                        {config.itemGroup.description && (
                          <div className="text-sm text-muted-foreground">
                            {config.itemGroup.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {config.bin.assetType ? (
                        <Badge variant="secondary">{config.bin.assetType}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(config.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(config.updatedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(config)}
                          disabled={loading}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(config)}
                          disabled={loading}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Bin Configuration</DialogTitle>
            <DialogDescription>
              Associate a bin (asset) with an item group for production planning
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="create-bin">Select Bin (Asset)</Label>
              <Select
                value={formData.binId}
                onValueChange={(value) => setFormData(prev => ({ ...prev, binId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a bin..." />
                </SelectTrigger>
                <SelectContent>
                  {availableAssets.map((asset) => (
                    <SelectItem key={asset.id} value={asset.id}>
                      <div>
                        <div className="font-medium">{asset.name}</div>
                        {asset.description && (
                          <div className="text-sm text-muted-foreground">
                            {asset.description}
                          </div>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="create-item-group">Select Item Group</Label>
              <Select
                value={formData.itemGroupId}
                onValueChange={(value) => setFormData(prev => ({ ...prev, itemGroupId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose an item group..." />
                </SelectTrigger>
                <SelectContent>
                  {itemGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      <div>
                        <div className="font-medium">{group.name}</div>
                        {group.description && (
                          <div className="text-sm text-muted-foreground">
                            {group.description}
                          </div>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialogs}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmitCreate}
              disabled={!formData.binId || !formData.itemGroupId || loading}
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Bin Configuration</DialogTitle>
            <DialogDescription>
              Update the bin and item group association
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-bin">Select Bin (Asset)</Label>
              <Select
                value={formData.binId}
                onValueChange={(value) => setFormData(prev => ({ ...prev, binId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a bin..." />
                </SelectTrigger>
                <SelectContent>
                  {/* Include current bin plus available assets */}
                  {assets.filter(asset => ['SIL-110', 'SIL-115', 'SIL-120'].includes(asset.name)).map((asset) => (
                    <SelectItem key={asset.id} value={asset.id}>
                      <div>
                        <div className="font-medium">{asset.name}</div>
                        {asset.description && (
                          <div className="text-sm text-muted-foreground">
                            {asset.description}
                          </div>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-item-group">Select Item Group</Label>
              <Select
                value={formData.itemGroupId}
                onValueChange={(value) => setFormData(prev => ({ ...prev, itemGroupId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose an item group..." />
                </SelectTrigger>
                <SelectContent>
                  {itemGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      <div>
                        <div className="font-medium">{group.name}</div>
                        {group.description && (
                          <div className="text-sm text-muted-foreground">
                            {group.description}
                          </div>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialogs}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmitEdit}
              disabled={!formData.binId || !formData.itemGroupId || loading}
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Update Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Bin Configuration</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this bin configuration? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {selectedConfiguration && (
            <div className="bg-muted p-4 rounded-lg">
              <div className="font-medium">
                {selectedConfiguration.bin.name} → {selectedConfiguration.itemGroup.name}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                This will remove the association between the bin and item group.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialogs}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleSubmitDelete}
              disabled={loading}
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 