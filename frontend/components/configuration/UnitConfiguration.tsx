'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Trash2, Edit, Plus, Save, X, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

// Types based on GraphQL schema
interface Units {
  id: string;
  name: string;
  abbreviation: string;
  active?: boolean;
  archived?: boolean;
  conversions?: Record<string, unknown>;
  mesConfiguredUnit?: boolean;
  perOperation?: 'PerBarrel' | 'PerCook' | 'PerFermenter' | 'PerLot';
  baseUnit?: {
    id: string;
    name: string;
    abbreviation: string;
  };
  itemGroup?: {
    id: string;
    name: string;
  };
  revision?: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy?: string;
}

interface ItemGroup {
  id: string;
  name: string;
  description?: string;
}

interface UnitFormData {
  name: string;
  abbreviation: string;
  active: boolean;
  archived: boolean;
  mesConfiguredUnit: boolean;
  perOperation?: 'PerBarrel' | 'PerCook' | 'PerFermenter' | 'PerLot' | undefined;
  itemGroupId?: string | undefined;
  baseUnitId?: string | undefined;
  conversions: string; // JSON string
}

const initialFormData: UnitFormData = {
  name: '',
  abbreviation: '',
  active: true,
  archived: false,
  mesConfiguredUnit: true,
  perOperation: undefined,
  itemGroupId: undefined,
  baseUnitId: undefined,
  conversions: '{}',
};

export default function UnitConfiguration() {
  const [units, setUnits] = useState<Units[]>([]);
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Units | null>(null);
  const [formData, setFormData] = useState<UnitFormData>(initialFormData);
  const [submitting, setSubmitting] = useState(false);
  const [expandedConversions, setExpandedConversions] = useState<Set<string>>(new Set());

  // GraphQL queries
  const UNITS_QUERY = `
    query GetUnits($where: UnitsWhereInput, $orderBy: [UnitsOrderByInput!]) {
      unitsItems(where: $where, orderBy: $orderBy) {
        id
        name
        abbreviation
        active
        archived
        conversions
        mesConfiguredUnit
        perOperation
        baseUnit {
          id
          name
          abbreviation
        }
        itemGroup {
          id
          name
        }
        revision
        createdAt
        createdBy
        updatedAt
        updatedBy
      }
    }
  `;

  const ITEM_GROUPS_QUERY = `
    query GetItemGroups {
      itemGroups {
        id
        name
        description
      }
    }
  `;

  const CREATE_UNIT_MUTATION = `
    mutation CreateUnit($data: UnitsCreateInput!) {
      createUnits(data: $data) {
        id
        name
        abbreviation
        active
        archived
        conversions
        mesConfiguredUnit
        perOperation
        baseUnit {
          id
          name
          abbreviation
        }
        itemGroup {
          id
          name
          abbreviation
        }
        revision
        createdAt
        createdBy
        updatedAt
        updatedBy
      }
    }
  `;

  const UPDATE_UNIT_MUTATION = `
    mutation UpdateUnit($where: UnitsWhereUniqueInput!, $data: UnitsUpdateInput!) {
      updateUnits(where: $where, data: $data) {
        id
        name
        abbreviation
        active
        archived
        conversions
        mesConfiguredUnit
        perOperation
        baseUnit {
          id
          name
          abbreviation
        }
        itemGroup {
          id
          name
          abbreviation
        }
        revision
        createdAt
        createdBy
        updatedAt
        updatedBy
      }
    }
  `;

  const DELETE_UNIT_MUTATION = `
    mutation DeleteUnit($where: UnitsWhereUniqueInput!) {
      deleteUnits(where: $where) {
        id
        name
      }
    }
  `;

  // GraphQL request function
  const graphqlRequest = async (query: string, variables?: Record<string, unknown>) => {
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

      const result = await response.json();
      
      if (result.errors) {
        throw new Error(result.errors[0]?.message || 'GraphQL error');
      }

      return result.data;
    } catch (error) {
      console.error('GraphQL request error:', error);
      throw error;
    }
  };

  // Load data
  const loadUnits = async () => {
    try {
      setLoading(true);
      const data = await graphqlRequest(UNITS_QUERY, {
        orderBy: [{ name: 'Asc' }]
      });
      setUnits(data.unitsItems || []);
    } catch (error) {
      setError(`Failed to load units: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const loadItemGroups = async () => {
    try {
      const data = await graphqlRequest(ITEM_GROUPS_QUERY);
      setItemGroups(data.itemGroups || []);
    } catch (error) {
      console.error('Failed to load item groups:', error);
    }
  };

  useEffect(() => {
    loadUnits();
    loadItemGroups();
  }, []);

  // Form handlers
  const handleInputChange = (field: keyof UnitFormData, value: string | boolean | undefined) => {
    setFormData(prev => {
      const updated = {
        ...prev,
        [field]: value
      };

      // Auto-sync base unit abbreviation into conversions JSON when baseUnitId changes
      if (field === 'baseUnitId' && value) {
        const selectedBaseUnit = units.find(u => u.id === value);
        if (selectedBaseUnit) {
          try {
            const conversions = prev.conversions ? JSON.parse(prev.conversions) : {};
            conversions.baseTo = selectedBaseUnit.abbreviation;
            updated.conversions = JSON.stringify(conversions, null, 2);
          } catch (e) {
            // If JSON is invalid, create new object
            updated.conversions = JSON.stringify({ baseTo: selectedBaseUnit.abbreviation }, null, 2);
          }
        }
      }

      return updated;
    });
  };

  const handleEdit = (unit: Units) => {
    setEditingUnit(unit);
    setFormData({
      name: unit.name,
      abbreviation: unit.abbreviation,
      active: unit.active ?? true,
      archived: unit.archived ?? false,
      mesConfiguredUnit: unit.mesConfiguredUnit ?? true,
      perOperation: unit.perOperation ?? undefined,
      itemGroupId: unit.itemGroup?.id ?? undefined,
      baseUnitId: unit.baseUnit?.id ?? undefined,
      conversions: JSON.stringify(unit.conversions || {}, null, 2),
    });
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingUnit(null);
    setFormData(initialFormData);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      // Parse conversions JSON
      let conversions;
      try {
        conversions = JSON.parse(formData.conversions);
      } catch {
        throw new Error('Invalid JSON format in conversions field');
      }

      const inputData = {
        name: formData.name,
        abbreviation: formData.abbreviation,
        active: formData.active,
        archived: formData.archived,
        mesConfiguredUnit: formData.mesConfiguredUnit,
        perOperation: formData.perOperation,
        conversions,
        createdBy: 'current-user', // Replace with actual user
        updatedBy: 'current-user', // Replace with actual user
        ...(formData.itemGroupId && {
          itemGroup: { id: formData.itemGroupId }
        }),
        ...(formData.baseUnitId && {
          baseUnit: { id: formData.baseUnitId }
        }),
      };

      if (editingUnit) {
        // Update existing unit
        await graphqlRequest(UPDATE_UNIT_MUTATION, {
          where: { id: editingUnit.id },
          data: inputData
        });
      } else {
        // Create new unit
        await graphqlRequest(CREATE_UNIT_MUTATION, {
          data: inputData
        });
      }

      setIsDialogOpen(false);
      await loadUnits();
    } catch (error) {
      setError(`Failed to ${editingUnit ? 'update' : 'create'} unit: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (unit: Units) => {
    if (!confirm(`Are you sure you want to delete the unit "${unit.name}"?`)) {
      return;
    }

    try {
      await graphqlRequest(DELETE_UNIT_MUTATION, {
        where: { id: unit.id }
      });
      await loadUnits();
    } catch (error) {
      setError(`Failed to delete unit: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Filter units based on search term
  const filteredUnits = units.filter(unit =>
    unit.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    unit.abbreviation.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const perOperationOptions = [
    { value: 'PerBarrel', label: 'Per Barrel' },
    { value: 'PerCook', label: 'Per Cook' },
    { value: 'PerFermenter', label: 'Per Fermenter' },
    { value: 'PerLot', label: 'Per Lot' },
  ];

  // Helper function to format conversions for display
  const formatConversions = (conversions: Record<string, unknown>) => {
    if (!conversions || Object.keys(conversions).length === 0) {
      return null;
    }

    const entries = Object.entries(conversions);
    if (entries.length <= 3) {
      return entries.map(([key, value]) => (
        <span key={key} className="inline-flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs">
          <span className="font-medium">{key}:</span>
          <span>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
        </span>
      ));
    }

    return (
      <div className="space-y-1">
        <div className="flex flex-wrap gap-1">
          {entries.slice(0, 2).map(([key, value]) => (
            <span key={key} className="inline-flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs">
              <span className="font-medium">{key}:</span>
              <span>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
            </span>
          ))}
          <span className="text-xs text-muted-foreground px-2 py-1">
            +{entries.length - 2} more
          </span>
        </div>
      </div>
    );
  };

  const toggleConversionsExpanded = (unitId: string) => {
    const newExpanded = new Set(expandedConversions);
    if (newExpanded.has(unitId)) {
      newExpanded.delete(unitId);
    } else {
      newExpanded.add(unitId);
    }
    setExpandedConversions(newExpanded);
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex justify-between items-center flex-shrink-0">
        <h1 className="text-3xl font-bold">Unit Configuration</h1>
        <Button onClick={handleCreate} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Unit
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="flex-shrink-0">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Search */}
      <Card className="flex-shrink-0">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search units by name or abbreviation..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Units List - Scrollable */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto space-y-4 pr-2">
          {loading ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">Loading units...</div>
              </CardContent>
            </Card>
          ) : filteredUnits.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  {searchTerm ? 'No units found matching your search.' : 'No units configured yet.'}
                </div>
              </CardContent>
            </Card>
          ) : (
            filteredUnits.map((unit) => (
              <Card key={unit.id}>
                <CardContent className="pt-6">
                  <div className="flex justify-between items-start">
                    <div className="space-y-3 flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-lg font-semibold">{unit.name}</h3>
                        <Badge variant="secondary">{unit.abbreviation}</Badge>
                        {unit.perOperation ? (
                          <Badge className="bg-blue-100 text-blue-800 border-blue-300">Derived Unit</Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-800 border-green-300">Base Unit</Badge>
                        )}
                        {unit.active && <Badge variant="default">Active</Badge>}
                        {unit.archived && <Badge variant="destructive">Archived</Badge>}
                        {unit.mesConfiguredUnit ? (
                          <Badge variant="outline">MES Configured</Badge>
                        ) : (
                          <Badge variant="destructive" className="bg-orange-100 text-orange-800 border-orange-300">
                            ERP-Controlled
                          </Badge>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                        {unit.perOperation && (
                          <div>
                            <span className="font-medium">Per Operation:</span>
                            <div className="text-muted-foreground">
                              {perOperationOptions.find(opt => opt.value === unit.perOperation)?.label}
                            </div>
                          </div>
                        )}

                        {unit.baseUnit && (
                          <div>
                            <span className="font-medium">Derived from:</span>
                            <div className="text-muted-foreground">
                              {unit.baseUnit.name} ({unit.baseUnit.abbreviation})
                            </div>
                          </div>
                        )}

                        {unit.itemGroup && (
                          <div>
                            <span className="font-medium">Item Group:</span>
                            <div className="text-muted-foreground">{unit.itemGroup.name}</div>
                          </div>
                        )}
                        
                        <div>
                          <span className="font-medium">Created:</span>
                          <div className="text-muted-foreground">
                            {new Date(unit.createdAt).toLocaleDateString()} by {unit.createdBy}
                          </div>
                        </div>
                        
                        <div>
                          <span className="font-medium">Updated:</span>
                          <div className="text-muted-foreground">
                            {new Date(unit.updatedAt).toLocaleDateString()}
                            {unit.updatedBy && ` by ${unit.updatedBy}`}
                          </div>
                        </div>
                      </div>

                      {unit.conversions && Object.keys(unit.conversions).length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">Conversions:</span>
                            {Object.keys(unit.conversions).length > 3 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleConversionsExpanded(unit.id)}
                                className="h-6 px-2 text-xs"
                              >
                                {expandedConversions.has(unit.id) ? (
                                  <>
                                    <ChevronUp className="h-3 w-3 mr-1" />
                                    Show Less
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="h-3 w-3 mr-1" />
                                    Show All
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                          
                          <div className="space-y-2">
                            {expandedConversions.has(unit.id) ? (
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(unit.conversions).map(([key, value]) => (
                                  <span key={key} className="inline-flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs">
                                    <span className="font-medium">{key}:</span>
                                    <span>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {formatConversions(unit.conversions)}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex gap-2 ml-4 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(unit)}
                        disabled={!unit.mesConfiguredUnit}
                        title={!unit.mesConfiguredUnit ? "Cannot edit ERP-controlled units" : "Edit unit"}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(unit)}
                        disabled={!unit.mesConfiguredUnit}
                        title={!unit.mesConfiguredUnit ? "Cannot delete ERP-controlled units" : "Delete unit"}
                        className="text-destructive hover:text-destructive disabled:text-muted-foreground"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingUnit ? 'Edit Unit' : 'Create New Unit'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="abbreviation">Abbreviation *</Label>
                <Input
                  id="abbreviation"
                  value={formData.abbreviation}
                  onChange={(e) => handleInputChange('abbreviation', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="perOperation">Per Operation</Label>
                <Select
                  value={formData.perOperation || ''}
                  onValueChange={(value) => handleInputChange('perOperation', value || undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select operation type" />
                  </SelectTrigger>
                  <SelectContent>
                    {perOperationOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="baseUnit">Base Unit</Label>
                <Select
                  value={formData.baseUnitId || ''}
                  onValueChange={(value) => handleInputChange('baseUnitId', value || undefined)}
                  disabled={!formData.perOperation}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={formData.perOperation ? "Select base unit" : "Select operation type first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {units
                      .filter(unit => !unit.perOperation && unit.active)
                      .map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.name} ({unit.abbreviation})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {formData.perOperation && (
                  <p className="text-xs text-muted-foreground">
                    Select the base unit this derived unit is calculated from
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="itemGroup">Item Group</Label>
                <Select
                  value={formData.itemGroupId || ''}
                  onValueChange={(value) => handleInputChange('itemGroupId', value || undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select item group" />
                  </SelectTrigger>
                  <SelectContent>
                    {itemGroups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div>
                <h4 className="font-medium">Configuration Options</h4>
                <p className="text-sm text-muted-foreground">
                  MES Configured units can be edited and managed within this system. 
                  ERP-Controlled units are managed externally and cannot be modified here.
                </p>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="active"
                    checked={formData.active}
                    onCheckedChange={(checked) => handleInputChange('active', checked)}
                  />
                  <Label htmlFor="active">Active</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="archived"
                    checked={formData.archived}
                    onCheckedChange={(checked) => handleInputChange('archived', checked)}
                  />
                  <Label htmlFor="archived">Archived</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="mesConfiguredUnit"
                    checked={formData.mesConfiguredUnit}
                    onCheckedChange={(checked) => handleInputChange('mesConfiguredUnit', checked)}
                  />
                  <Label htmlFor="mesConfiguredUnit" className="font-medium">
                    MES Configured
                  </Label>
                </div>
              </div>
              
              {!formData.mesConfiguredUnit && (
                <Alert>
                  <AlertDescription>
                    <strong>Warning:</strong> Units marked as not MES Configured will be treated as ERP-Controlled 
                    and cannot be edited or deleted through this interface.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="conversions">Conversions (JSON)</Label>
              <Textarea
                id="conversions"
                value={formData.conversions}
                onChange={(e) => handleInputChange('conversions', e.target.value)}
                placeholder='{"factor": 1.0, "baseUnit": "kg"}'
                rows={4}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Enter conversion factors and relationships as JSON
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={submitting}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                <Save className="h-4 w-4 mr-2" />
                {submitting ? 'Saving...' : editingUnit ? 'Update Unit' : 'Create Unit'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
} 