'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Plus,
  Edit,
  Search,
  Filter,
  ChevronRight,
  ChevronDown,
  Building2,
  Factory,
  Cog,
  Wrench,
  MapPin,
  Activity,
  AlertCircle,
  CheckCircle,
  Folder,
  XCircle
} from 'lucide-react'

// Types based on GraphQL schema
interface Asset {
  id: string
  name: string
  description: string
  assetType: 'Ent' | 'Site' | 'Area' | 'Line' | 'Cell' | 'Unit' | 'Equipmod' | 'Controlmod' | 'Device' | 'Equipphase'
  status: 'InService' | 'Oos'
  assetPath: string
  parent?: {
    id: string
    name: string
    assetType: string
  }
  children: Array<{
    id: string
    name: string
    assetType: string
    status: string
  }>
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy?: string
}

// Tree node interface for building the hierarchy
interface TreeNode {
  asset: Asset
  children: TreeNode[]
  isExpanded: boolean
}

const AssetManagementWithTree: React.FC = () => {
  const [assets, setAssets] = useState<Asset[]>([])
  const [treeData, setTreeData] = useState<TreeNode[]>([])
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form state for create/edit
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    assetType: 'Unit' as Asset['assetType'],
    status: 'InService' as Asset['status'],
    parentId: ''
  })

  // Fetch assets from GraphQL
  const fetchAssets = async () => {
    try {
      setLoading(true)
      const query = `
        query GetAssetsWithHierarchy {
          assets(orderBy: [{ name: Asc }]) {
            id
            name
            description
            assetType
            status
            assetPath
            createdAt
            updatedAt
            createdBy
            updatedBy
            parent {
              id
              name
              assetType
            }
            children {
              id
              name
              assetType
              status
            }
          }
        }
      `

      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      })

      if (!response.ok) {
        throw new Error('Failed to fetch assets')
      }

      const result = await response.json()
      if (result.errors) {
        throw new Error(result.errors[0].message)
      }

      setAssets(result.data.assets)
      buildTreeStructure(result.data.assets)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Build tree structure from flat asset list using assetPath
  const buildTreeStructure = (assetList: Asset[]) => {
    const assetMap = new Map<string, TreeNode>()
    const pathToAssetMap = new Map<string, Asset>()
    
    // Create maps for quick lookup
    assetList.forEach(asset => {
      const pathDepth = asset.assetPath.split('/').length
      assetMap.set(asset.id, {
        asset,
        children: [],
        isExpanded: pathDepth <= 3 // Auto-expand first 3 levels (Ent, Site, Area)
      })
      pathToAssetMap.set(asset.assetPath, asset)
    })

    // Build parent-child relationships based on assetPath hierarchy
    assetList.forEach(asset => {
      const node = assetMap.get(asset.id)!
      const pathParts = asset.assetPath.split('/')
      
      if (pathParts.length > 1) {
        // Find parent by removing last part of path
        const parentPath = pathParts.slice(0, -1).join('/')
        const parentAsset = pathToAssetMap.get(parentPath)
        
        if (parentAsset) {
          const parentNode = assetMap.get(parentAsset.id)
          if (parentNode) {
            parentNode.children.push(node)
          }
        }
      }
    })

    // Find root nodes (assets with no parent in the hierarchy)
    const rootNodes: TreeNode[] = []
    assetList.forEach(asset => {
      const pathParts = asset.assetPath.split('/')
      if (pathParts.length === 1) {
        // This is a root level asset
        const node = assetMap.get(asset.id)!
        rootNodes.push(node)
      }
    })

    // Sort children by asset type hierarchy and then by name
    const getAssetTypeOrder = (assetType: string) => {
      const order = ['Ent', 'Site', 'Area', 'Line', 'Cell', 'Unit', 'Equipmod', 'Controlmod', 'Device', 'Equipphase']
      return order.indexOf(assetType)
    }

    const sortChildren = (node: TreeNode) => {
      node.children.sort((a, b) => {
        const typeOrderA = getAssetTypeOrder(a.asset.assetType)
        const typeOrderB = getAssetTypeOrder(b.asset.assetType)
        
        if (typeOrderA !== typeOrderB) {
          return typeOrderA - typeOrderB
        }
        return a.asset.name.localeCompare(b.asset.name)
      })
      node.children.forEach(sortChildren)
    }

    rootNodes.forEach(sortChildren)
    rootNodes.sort((a, b) => {
      const typeOrderA = getAssetTypeOrder(a.asset.assetType)
      const typeOrderB = getAssetTypeOrder(b.asset.assetType)
      
      if (typeOrderA !== typeOrderB) {
        return typeOrderA - typeOrderB
      }
      return a.asset.name.localeCompare(b.asset.name)
    })

    setTreeData(rootNodes)
  }

  // Toggle tree node expansion
  const toggleNode = (nodeId: string) => {
    const updateNode = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.map(node => {
        if (node.asset.id === nodeId) {
          return { ...node, isExpanded: !node.isExpanded }
        }
        return { ...node, children: updateNode(node.children) }
      })
    }
    setTreeData(updateNode(treeData))
  }

  // Get icon for asset type
  const getAssetTypeIcon = (assetType: string) => {
    switch (assetType) {
      case 'Ent':
      case 'Site':
        return <Building2 className="h-4 w-4" />
      case 'Area':
      case 'Line':
        return <Factory className="h-4 w-4" />
      case 'Cell':
        return <Folder className="h-4 w-4" />
      case 'Unit':
        return <Cog className="h-4 w-4" />
      case 'Equipmod':
      case 'Controlmod':
        return <Wrench className="h-4 w-4" />
      case 'Device':
      case 'Equipphase':
        return <Activity className="h-4 w-4" />
      default:
        return <MapPin className="h-4 w-4" />
    }
  }

  // Get status badge variant
  const getStatusVariant = (status: string) => {
    return status === 'InService' ? 'default' : 'destructive'
  }

  // Filter assets for card view
  const filteredAssets = assets.filter(asset => {
    const matchesSearch = asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         asset.description.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = filterType === 'all' || asset.assetType === filterType
    const matchesStatus = filterStatus === 'all' || asset.status === filterStatus
    
    return matchesSearch && matchesType && matchesStatus
  })

  // Handle form submission for create/edit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      setLoading(true)
      
      if (selectedAsset) {
        // Update existing asset
        const updateMutation = `
          mutation UpdateAsset($where: AssetWhereUniqueInput!, $data: AssetUpdateInput!) {
            updateAsset(where: $where, data: $data) {
              id
              name
              description
              assetType
              status
              assetPath
              parent {
                id
                name
                assetType
              }
            }
          }
        `
        
        const updateData: {
          name: string
          description: string
          assetType: Asset['assetType']
          status: Asset['status']
          updatedBy: string
          parent?: { id: string } | null
        } = {
          name: formData.name,
          description: formData.description,
          assetType: formData.assetType,
          status: formData.status,
          updatedBy: 'current-user' // Replace with actual user context
        }
        
        // Only include parent if parentId is provided
        if (formData.parentId) {
          updateData.parent = { id: formData.parentId }
        } else {
          // If no parent selected, we need to remove the parent relationship
          // Note: Setting parent to null might require special handling depending on your schema
          updateData.parent = null
        }
        
        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: updateMutation,
            variables: {
              where: { id: selectedAsset.id },
              data: updateData
            }
          }),
        })
        
        const result = await response.json()
        if (result.errors) {
          throw new Error(result.errors[0].message)
        }
        
        console.log('Asset updated successfully:', result.data.updateAsset)
        
      } else {
        // Create new asset
        const createMutation = `
          mutation CreateAsset($data: AssetCreateInput!) {
            createAsset(data: $data) {
              id
              name
              description
              assetType
              status
              assetPath
              parent {
                id
                name
                assetType
              }
            }
          }
        `
        
        const createData: {
          name: string
          description: string
          assetType: Asset['assetType']
          status: Asset['status']
          assetPath: string
          createdBy: string
          schemaVersion: string
          parent?: { id: string }
        } = {
          name: formData.name,
          description: formData.description,
          assetType: formData.assetType,
          status: formData.status,
          assetPath: formData.parentId ? 
            `${assets.find(a => a.id === formData.parentId)?.assetPath}/${formData.name}` : 
            formData.name, // Root level asset
          createdBy: 'current-user', // Replace with actual user context
          schemaVersion: '1.0' // Add appropriate schema version
        }
        
        // Only include parent if parentId is provided
        if (formData.parentId) {
          createData.parent = { id: formData.parentId }
        }
        
        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: createMutation,
            variables: {
              data: createData
            }
          }),
        })
        
        const result = await response.json()
        if (result.errors) {
          throw new Error(result.errors[0].message)
        }
        
        console.log('Asset created successfully:', result.data.createAsset)
      }
      
      // Close dialogs and refresh data
      setIsCreateDialogOpen(false)
      setIsEditDialogOpen(false)
      resetForm()
      await fetchAssets()
      
    } catch (err) {
      console.error('Error submitting form:', err)
      setError(err instanceof Error ? err.message : 'An error occurred while saving the asset')
    } finally {
      setLoading(false)
    }
  }

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      assetType: 'Unit',
      status: 'InService',
      parentId: ''
    })
  }

  // Get available parent assets (excluding current asset and its descendants to prevent circular references)
  const getAvailableParentAssets = (excludeAssetId?: string): Asset[] => {
    if (!excludeAssetId) {
      return assets // For create mode, all assets are available as parents
    }

    // For edit mode, exclude the current asset and all its descendants
    const excludeIds = new Set<string>()
    
    // Add the current asset
    excludeIds.add(excludeAssetId)
    
    // Add all descendants by checking assetPath
    const currentAsset = assets.find(a => a.id === excludeAssetId)
    if (currentAsset) {
      assets.forEach(asset => {
        if (asset.assetPath.startsWith(currentAsset.assetPath + '/')) {
          excludeIds.add(asset.id)
        }
      })
    }
    
    return assets.filter(asset => !excludeIds.has(asset.id))
  }

  // Handle edit
  const handleEdit = (asset: Asset) => {
    setFormData({
      name: asset.name,
      description: asset.description,
      assetType: asset.assetType,
      status: asset.status,
      parentId: asset.parent?.id || ''
    })
    setSelectedAsset(asset)
    setIsEditDialogOpen(true)
  }

  // Handle setting asset out of service
  const handleSetOutOfService = async (asset: Asset) => {
    try {
      const mutation = `
        mutation UpdateAsset($where: AssetWhereUniqueInput!, $data: AssetUpdateInput!) {
          updateAsset(where: $where, data: $data) {
            id
            status
          }
        }
      `
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: mutation,
          variables: {
            where: { id: asset.id },
            data: { status: 'Oos', updatedBy: 'current-user' }
          }
        }),
      })

      const result = await response.json()
      if (result.errors) {
        throw new Error(result.errors[0].message)
      }

      await fetchAssets()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update asset')
    }
  }

  // Render tree node
  const renderTreeNode = (node: TreeNode, level: number = 0) => {
    const hasChildren = node.children.length > 0
    const paddingLeft = level * 16

    return (
      <div key={node.asset.id}>
        <div
          className={`flex items-center py-2 px-2 hover:bg-accent cursor-pointer rounded-sm transition-colors ${
            selectedAsset?.id === node.asset.id ? 'bg-accent border-l-2 border-primary' : ''
          }`}
          style={{ paddingLeft: `${paddingLeft + 8}px` }}
          onClick={() => setSelectedAsset(node.asset)}
        >
          <div className="flex items-center flex-1 min-w-0">
            {hasChildren ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 mr-2 hover:bg-accent"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleNode(node.asset.id)
                }}
              >
                {node.isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </Button>
            ) : (
              <div className="w-6" />
            )}
            
            <div className="mr-2 flex-shrink-0">
              {getAssetTypeIcon(node.asset.assetType)}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium truncate" title={node.asset.name}>
                  {node.asset.name}
                </span>
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {node.asset.assetType}
                  </span>
                  <Badge 
                    variant={getStatusVariant(node.asset.status)}
                    className="text-xs"
                  >
                    {node.asset.status === 'InService' ? (
                      <CheckCircle className="h-3 w-3 mr-1" />
                    ) : (
                      <AlertCircle className="h-3 w-3 mr-1" />
                    )}
                    {node.asset.status}
                  </Badge>
                </div>
              </div>
              {hasChildren && (
                <div className="text-xs text-muted-foreground mt-1">
                  {node.children.length} child{node.children.length !== 1 ? 'ren' : ''}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {hasChildren && node.isExpanded && (
          <div className="border-l border-border ml-4">
            {node.children.map(child => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  useEffect(() => {
    fetchAssets()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading assets...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-red-600">
          <AlertCircle className="h-8 w-8 mx-auto mb-2" />
          <p>Error: {error}</p>
          <Button onClick={fetchAssets} className="mt-2">
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Left Panel - Tree View */}
      <div className="w-1/3 bg-card border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold mb-3">Asset Hierarchy</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search assets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-2">
            {treeData.map(node => renderTreeNode(node))}
          </div>
        </ScrollArea>
      </div>

      {/* Right Panel - Details and Cards */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-card border-b border-border p-4">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold">Asset Management</h1>
            <div className="flex gap-2">
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={resetForm}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Asset
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Create New Asset</DialogTitle>
                    <DialogDescription>
                      Add a new asset to the system. Fill in the required information below.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="name" className="text-right">Name</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => setFormData({...formData, name: e.target.value})}
                          className="col-span-3"
                          required
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="description" className="text-right">Description</Label>
                        <Textarea
                          id="description"
                          value={formData.description}
                          onChange={(e) => setFormData({...formData, description: e.target.value})}
                          className="col-span-3"
                          required
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="assetType" className="text-right">Type</Label>
                        <Select value={formData.assetType} onValueChange={(value) => setFormData({...formData, assetType: value as Asset['assetType']})}>
                          <SelectTrigger className="col-span-3">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Ent">Enterprise</SelectItem>
                            <SelectItem value="Site">Site</SelectItem>
                            <SelectItem value="Area">Area</SelectItem>
                            <SelectItem value="Line">Line</SelectItem>
                            <SelectItem value="Cell">Cell</SelectItem>
                            <SelectItem value="Unit">Unit</SelectItem>
                            <SelectItem value="Equipmod">Equipment Module</SelectItem>
                            <SelectItem value="Controlmod">Control Module</SelectItem>
                            <SelectItem value="Device">Device</SelectItem>
                            <SelectItem value="Equipphase">Equipment Phase</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="status" className="text-right">Status</Label>
                        <Select value={formData.status} onValueChange={(value) => setFormData({...formData, status: value as Asset['status']})}>
                          <SelectTrigger className="col-span-3">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="InService">In Service</SelectItem>
                            <SelectItem value="Oos">Out of Service</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="parent" className="text-right">Parent Asset</Label>
                        <Select 
                          {...(formData.parentId ? { value: formData.parentId } : {})} 
                          onValueChange={(value) => setFormData({...formData, parentId: value || ''})}
                        >
                          <SelectTrigger className="col-span-3">
                            <SelectValue placeholder="Select parent asset (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">No Parent (Root Level)</SelectItem>
                            {getAvailableParentAssets().map((asset) => (
                              <SelectItem key={asset.id} value={asset.id}>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">{asset.assetType}</span>
                                  <span>{asset.name}</span>
                                  <span className="text-xs text-muted-foreground/70">({asset.assetPath})</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit">Create Asset</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="Site">Site</SelectItem>
                  <SelectItem value="Area">Area</SelectItem>
                  <SelectItem value="Cell">Cell</SelectItem>
                  <SelectItem value="Unit">Unit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="InService">In Service</SelectItem>
                <SelectItem value="Oos">Out of Service</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          {selectedAsset ? (
            /* Asset Details View */
            <div className="h-full p-6">
              <Card className="h-full">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {getAssetTypeIcon(selectedAsset.assetType)}
                        {selectedAsset.name}
                      </CardTitle>
                      <CardDescription>{selectedAsset.description}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant={getStatusVariant(selectedAsset.status)}>
                        {selectedAsset.status === 'InService' ? (
                          <CheckCircle className="h-3 w-3 mr-1" />
                        ) : (
                          <AlertCircle className="h-3 w-3 mr-1" />
                        )}
                        {selectedAsset.status}
                      </Badge>
                      <Button variant="outline" size="sm" onClick={() => handleEdit(selectedAsset)}>
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="details" className="h-full">
                    <TabsList>
                      <TabsTrigger value="details">Details</TabsTrigger>
                      <TabsTrigger value="children">Children ({selectedAsset.children.length})</TabsTrigger>
                      <TabsTrigger value="hierarchy">Hierarchy</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="details" className="mt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm font-medium">Asset Type</Label>
                          <p className="text-sm text-muted-foreground">{selectedAsset.assetType}</p>
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Status</Label>
                          <p className="text-sm text-muted-foreground">{selectedAsset.status}</p>
                        </div>
                        <div className="col-span-2">
                          <Label className="text-sm font-medium">Asset Path</Label>
                          <p className="text-sm text-muted-foreground font-mono">{selectedAsset.assetPath}</p>
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Created By</Label>
                          <p className="text-sm text-muted-foreground">{selectedAsset.createdBy}</p>
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Created At</Label>
                          <p className="text-sm text-muted-foreground">
                            {new Date(selectedAsset.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        {selectedAsset.parent && (
                          <div className="col-span-2">
                            <Label className="text-sm font-medium">Parent Asset</Label>
                            <p className="text-sm text-muted-foreground">
                              {selectedAsset.parent.name} ({selectedAsset.parent.assetType})
                            </p>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="children" className="mt-4">
                      <ScrollArea className="h-64">
                        {selectedAsset.children.length > 0 ? (
                          <div className="space-y-2">
                            {selectedAsset.children.map(child => (
                              <div key={child.id} className="flex items-center justify-between p-2 border border-border rounded">
                                <div className="flex items-center gap-2">
                                  {getAssetTypeIcon(child.assetType)}
                                  <span className="font-medium">{child.name}</span>
                                  <span className="text-sm text-muted-foreground">({child.assetType})</span>
                                </div>
                                <Badge variant={getStatusVariant(child.status)}>
                                  {child.status}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-muted-foreground text-center py-8">No child assets</p>
                        )}
                      </ScrollArea>
                    </TabsContent>

                    <TabsContent value="hierarchy" className="mt-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Asset Hierarchy Path</Label>
                        <div className="text-sm text-muted-foreground font-mono bg-muted p-2 rounded">
                          {selectedAsset.assetPath.split('/').map((segment, index, array) => (
                            <span key={index}>
                              {segment}
                              {index < array.length - 1 && <span className="text-muted-foreground/60"> / </span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
          ) : (
            /* Cards Grid View */
            <ScrollArea className="h-full">
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredAssets.map((asset) => (
                    <Card 
                      key={asset.id} 
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => setSelectedAsset(asset)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2">
                            {getAssetTypeIcon(asset.assetType)}
                            <CardTitle className="text-lg">{asset.name}</CardTitle>
                          </div>
                          <Badge variant={getStatusVariant(asset.status)}>
                            {asset.status === 'InService' ? (
                              <CheckCircle className="h-3 w-3 mr-1" />
                            ) : (
                              <AlertCircle className="h-3 w-3 mr-1" />
                            )}
                            {asset.status}
                          </Badge>
                        </div>
                        <CardDescription className="text-sm">
                          {asset.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Type:</span>
                            <span className="font-medium">{asset.assetType}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Children:</span>
                            <span className="font-medium">{asset.children.length}</span>
                          </div>
                          {asset.parent && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Parent:</span>
                              <span className="font-medium truncate ml-2" title={asset.parent.name}>
                                {asset.parent.name}
                              </span>
                            </div>
                          )}
                        </div>
                        <Separator className="my-3" />
                        <div className="flex justify-between">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEdit(asset)
                            }}
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSetOutOfService(asset)
                            }}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Set OOS
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Asset</DialogTitle>
            <DialogDescription>
              Update the asset information below.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-name" className="text-right">Name</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="col-span-3"
                  required
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-description" className="text-right">Description</Label>
                <Textarea
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="col-span-3"
                  required
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-assetType" className="text-right">Type</Label>
                <Select value={formData.assetType} onValueChange={(value) => setFormData({...formData, assetType: value as Asset['assetType']})}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ent">Enterprise</SelectItem>
                    <SelectItem value="Site">Site</SelectItem>
                    <SelectItem value="Area">Area</SelectItem>
                    <SelectItem value="Line">Line</SelectItem>
                    <SelectItem value="Cell">Cell</SelectItem>
                    <SelectItem value="Unit">Unit</SelectItem>
                    <SelectItem value="Equipmod">Equipment Module</SelectItem>
                    <SelectItem value="Controlmod">Control Module</SelectItem>
                    <SelectItem value="Device">Device</SelectItem>
                    <SelectItem value="Equipphase">Equipment Phase</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-status" className="text-right">Status</Label>
                <Select value={formData.status} onValueChange={(value) => setFormData({...formData, status: value as Asset['status']})}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="InService">In Service</SelectItem>
                    <SelectItem value="Oos">Out of Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-parent" className="text-right">Parent Asset</Label>
                <Select 
                  {...(formData.parentId ? { value: formData.parentId } : {})} 
                  onValueChange={(value) => setFormData({...formData, parentId: value || ''})}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select parent asset (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No Parent (Root Level)</SelectItem>
                    {getAvailableParentAssets(selectedAsset?.id).map((asset) => (
                      <SelectItem key={asset.id} value={asset.id}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{asset.assetType}</span>
                          <span>{asset.name}</span>
                          <span className="text-xs text-muted-foreground/70">({asset.assetPath})</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit">Update Asset</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default AssetManagementWithTree 