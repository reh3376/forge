import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Edit, Archive, Search, MoreVertical, Building, Factory, Cpu, Wrench, MapPin, Layers, Network, Settings } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useCurrentUserEmail } from '@/lib/utils/user-context';

// Types
interface Asset {
  id: string;
  name: string;
  description: string;
  assetType: 'Ent' | 'Site' | 'Area' | 'Cell' | 'Unit' | 'Line' | 'Equipmod' | 'Controlmod' | 'Device' | 'Equipphase';
  assetPath: string;
  status: 'InService' | 'Oos';
  index?: number;
  globalId?: string;
  revision?: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy?: string;
  parent?: {
    id: string;
    name: string;
    assetType: string;
  };
  children: {
    id: string;
    name: string;
    assetType: string;
  }[];
}

interface AssetFormData {
  name: string;
  description: string;
  assetType: Asset['assetType'];
  parentId?: string;
  index?: number | undefined;
  globalId?: string;
}

const assetTypeOptions = [
  { value: 'Ent', label: 'Enterprise', icon: Building },
  { value: 'Site', label: 'Site', icon: Factory },
  { value: 'Area', label: 'Area', icon: MapPin },
  { value: 'Cell', label: 'Cell', icon: Layers },
  { value: 'Unit', label: 'Unit', icon: Cpu },
  { value: 'Line', label: 'Line', icon: Network },
  { value: 'Equipmod', label: 'Equipment Module', icon: Settings },
  { value: 'Controlmod', label: 'Control Module', icon: Wrench },
  { value: 'Device', label: 'Device', icon: Cpu },
  { value: 'Equipphase', label: 'Equipment Phase', icon: Settings },
] as const;

const statusOptions = [
  { value: 'InService', label: 'In Service', color: 'bg-green-100 text-green-800' },
  { value: 'Oos', label: 'Out of Service', color: 'bg-red-100 text-red-800' },
] as const;

export default function AssetManagement() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [formData, setFormData] = useState<AssetFormData>({
    name: '',
    description: '',
    assetType: 'Unit',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 12;

  // Get current user email for audit trails
  const userEmail = useCurrentUserEmail()

  // GraphQL client function using fetch (similar to existing patterns in the project)
  const executeGraphQL = async (query: string, variables?: Record<string, unknown>) => {
    try {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables,
        }),
      });

      if (!response.ok) {
        throw new Error(`GraphQL request failed: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
      }

      return result;
    } catch (error) {
      console.error('GraphQL Error:', error);
      throw error;
    }
  };

  const loadAssets = async () => {
    setLoading(true);
    try {
      const where: Record<string, unknown> = {};
      
      if (searchTerm) {
        where['OR'] = [
          { name: { contains: searchTerm, mode: 'Insensitive' } },
          { description: { contains: searchTerm, mode: 'Insensitive' } },
          { assetPath: { contains: searchTerm, mode: 'Insensitive' } }
        ];
      }
      
      if (filterType !== 'all') {
        where['assetType'] = filterType;
      }
      
      if (filterStatus !== 'all') {
        where['status'] = filterStatus;
      }

      const response = await executeGraphQL(`
        query GetAssets($where: AssetWhereInput, $orderBy: [AssetOrderByInput!], $take: Float, $skip: Float) {
          assets(where: $where, orderBy: $orderBy, take: $take, skip: $skip) {
            id
            name
            description
            assetType
            assetPath
            status
            index
            globalId
            revision
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
            }
          }
          _assetsMeta(where: $where) {
            count
          }
        }
      `, {
        where,
        orderBy: [{ name: 'Asc' }],
        take: pageSize,
        skip: (currentPage - 1) * pageSize
      });

      setAssets(response.data?.assets || []);
      setTotalCount(response.data?._assetsMeta?.count || 0);
    } catch (error) {
      console.error('Error loading assets:', error);
      toast.error('Failed to load assets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssets();
  }, [searchTerm, filterType, filterStatus, currentPage]);

  const handleCreateAsset = async () => {
    if (!formData.name || !formData.description) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const assetPath = formData.parentId 
        ? `${assets.find(a => a.id === formData.parentId)?.assetPath || ''}.${formData.name}`
        : formData.name;

      await executeGraphQL(`
        mutation CreateAsset($data: AssetCreateInput!) {
          createAsset(data: $data) {
            id
            name
            description
            assetType
            assetPath
            status
            createdAt
          }
        }
      `, {
        data: {
          name: formData.name,
          description: formData.description,
          assetType: formData.assetType,
          assetPath,
          status: 'InService',
          createdBy: userEmail, // Use logged-in user's email from Entra ID
          schemaVersion: '1.0',
          ...(formData.parentId && { parent: { connect: { id: formData.parentId } } }),
          ...(formData.index && { index: formData.index }),
          ...(formData.globalId && { globalId: formData.globalId }),
        }
      });

      toast.success('Asset created successfully');
      setIsCreateDialogOpen(false);
      setFormData({ name: '', description: '', assetType: 'Unit' });
      loadAssets();
    } catch (error) {
      console.error('Error creating asset:', error);
      toast.error('Failed to create asset');
    }
  };

  const handleEditAsset = async () => {
    if (!selectedAsset) return;

    try {
      await executeGraphQL(`
        mutation UpdateAsset($where: AssetWhereUniqueInput!, $data: AssetUpdateInput!) {
          updateAsset(where: $where, data: $data) {
            id
            name
            description
            assetType
            assetPath
            status
            updatedAt
          }
        }
      `, {
        where: { id: selectedAsset.id },
        data: {
          name: formData.name,
          description: formData.description,
          assetType: formData.assetType,
          updatedBy: userEmail, // Use logged-in user's email from Entra ID
          ...(formData.index && { index: formData.index }),
          ...(formData.globalId && { globalId: formData.globalId }),
        }
      });

      toast.success('Asset updated successfully');
      setIsEditDialogOpen(false);
      setSelectedAsset(null);
      setFormData({ name: '', description: '', assetType: 'Unit' });
      loadAssets();
    } catch (error) {
      console.error('Error updating asset:', error);
      toast.error('Failed to update asset');
    }
  };

  const handleArchiveAsset = async (asset: Asset) => {
    try {
      await executeGraphQL(`
        mutation UpdateAsset($where: AssetWhereUniqueInput!, $data: AssetUpdateInput!) {
          updateAsset(where: $where, data: $data) {
            id
            status
            updatedAt
          }
        }
      `, {
        where: { id: asset.id },
        data: {
          status: 'Oos',
          updatedBy: userEmail, // Use logged-in user's email from Entra ID
        }
      });

      toast.success('Asset archived successfully');
      loadAssets();
    } catch (error) {
      console.error('Error archiving asset:', error);
      toast.error('Failed to archive asset');
    }
  };

  const openEditDialog = (asset: Asset) => {
    setSelectedAsset(asset);
    setFormData({
      name: asset.name,
      description: asset.description,
      assetType: asset.assetType,
      index: asset.index,
      globalId: asset.globalId || '',
    });
    setIsEditDialogOpen(true);
  };

  const getAssetTypeIcon = (type: string) => {
    const option = assetTypeOptions.find(opt => opt.value === type);
    return option ? option.icon : Settings;
  };

  const getStatusBadge = (status: string) => {
    const option = statusOptions.find(opt => opt.value === status);
    return option ? option : { label: status, color: 'bg-gray-100 text-gray-800' };
  };

  const filteredAssets = assets.filter(asset => {
    const matchesSearch = searchTerm === '' || 
      asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.assetPath.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || asset.assetType === filterType;
    const matchesStatus = filterStatus === 'all' || asset.status === filterStatus;
    
    return matchesSearch && matchesType && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Asset Management</h1>
          <p className="text-muted-foreground">
            Configure and manage your manufacturing assets
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Asset
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create New Asset</DialogTitle>
              <DialogDescription>
                Add a new asset to your manufacturing hierarchy.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">
                  Name
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="col-span-3"
                  placeholder="Asset name"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="description" className="text-right">
                  Description
                </Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="col-span-3"
                  placeholder="Asset description"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="assetType" className="text-right">
                  Type
                </Label>
                <Select
                  value={formData.assetType}
                  onValueChange={(value: Asset['assetType']) => 
                    setFormData({ ...formData, assetType: value })
                  }
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select asset type" />
                  </SelectTrigger>
                  <SelectContent>
                    {assetTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center">
                          <option.icon className="mr-2 h-4 w-4" />
                          {option.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="globalId" className="text-right">
                  Global ID
                </Label>
                <Input
                  id="globalId"
                  value={formData.globalId || ''}
                  onChange={(e) => setFormData({ ...formData, globalId: e.target.value })}
                  className="col-span-3"
                  placeholder="Optional global identifier"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="index" className="text-right">
                  Index
                </Label>
                <Input
                  id="index"
                  type="number"
                  value={formData.index || ''}
                  onChange={(e) => setFormData({ ...formData, index: parseInt(e.target.value) || undefined })}
                  className="col-span-3"
                  placeholder="Optional sort index"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" onClick={handleCreateAsset}>
                Create Asset
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search assets..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="sm:w-48">
              <Label htmlFor="filterType">Asset Type</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {assetTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:w-48">
              <Label htmlFor="filterStatus">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assets Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 rounded"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAssets.map((asset) => {
            const IconComponent = getAssetTypeIcon(asset.assetType);
            const statusBadge = getStatusBadge(asset.status);
            
            return (
              <Card key={asset.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      <IconComponent className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <CardTitle className="text-base">{asset.name}</CardTitle>
                        <CardDescription className="text-xs">
                          {asset.assetPath}
                        </CardDescription>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(asset)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleArchiveAsset(asset)}>
                          <Archive className="mr-2 h-4 w-4" />
                          Archive
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {asset.description}
                    </p>
                    
                    <div className="flex items-center justify-between">
                      <Badge className={statusBadge.color}>
                        {statusBadge.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {assetTypeOptions.find(opt => opt.value === asset.assetType)?.label}
                      </span>
                    </div>

                    {asset.parent && (
                      <div className="text-xs text-muted-foreground">
                        Parent: {asset.parent.name}
                      </div>
                    )}

                    {asset.children.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        Children: {asset.children.length}
                      </div>
                    )}

                    {asset.globalId && (
                      <div className="text-xs text-muted-foreground">
                        ID: {asset.globalId}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalCount > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} assets
          </p>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => prev + 1)}
              disabled={currentPage * pageSize >= totalCount}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Asset</DialogTitle>
            <DialogDescription>
              Update the asset information.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-name" className="text-right">
                Name
              </Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-description" className="text-right">
                Description
              </Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-assetType" className="text-right">
                Type
              </Label>
              <Select
                value={formData.assetType}
                onValueChange={(value: Asset['assetType']) => 
                  setFormData({ ...formData, assetType: value })
                }
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assetTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center">
                        <option.icon className="mr-2 h-4 w-4" />
                        {option.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-globalId" className="text-right">
                Global ID
              </Label>
              <Input
                id="edit-globalId"
                value={formData.globalId || ''}
                onChange={(e) => setFormData({ ...formData, globalId: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-index" className="text-right">
                Index
              </Label>
              <Input
                id="edit-index"
                type="number"
                value={formData.index || ''}
                onChange={(e) => setFormData({ ...formData, index: parseInt(e.target.value) || undefined })}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" onClick={handleEditAsset}>
              Update Asset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 