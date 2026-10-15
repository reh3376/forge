'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trash2, Edit, Plus, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { useCurrentUserEmail } from '@/lib/utils/user-context'

// Types
interface Item {
  id: string
  itemNumber: string
  itemName: string
  itemType: string
  itemClass: string
}

interface EnzymeConfiguration {
  id: string
  category: string
  dosePerMetricTon: number
  instructions: string
  active: boolean
  item: Item
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}

// Enzyme categories from GraphQL enum
const ENZYME_CATEGORIES = [
  'LIQUIFACTION',
  'SACCHARIFICATION', 
  'VISCOSITY'
]

export function EnzymeConfigurationManager() {
  const [configurations, setConfigurations] = useState<EnzymeConfiguration[]>([])
  const [enzymeItems, setEnzymeItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  
  // Form state
  const [formData, setFormData] = useState({
    itemId: '',
    category: '',
    dosePerMetricTon: '',
    instructions: '',
    active: true
  })

  // Get current user email for audit trails
  const userEmail = useCurrentUserEmail()

  const loadData = async () => {
    try {
      setLoading(true)
      
      // Load enzyme configurations using GraphQL proxy
      const configQuery = `
        query GetEnzymeConfigurations {
          enzymeConfigurations {
            id
            category
            dosePerMetricTon
            instructions
            active
            item {
              id
              itemNumber
              itemName
              itemType
              itemClass
            }
            createdAt
            createdBy
            updatedAt
            updatedBy
          }
        }
      `;

      const configResponse = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: configQuery,
        }),
      });

      // Load enzyme items using GraphQL proxy
      const itemsQuery = `
        query GetEnzymeItems {
          items(where: { itemNumber: { contains: "ENZ" } }) {
            id
            itemNumber
            itemName
            itemType
            itemClass
          }
        }
      `;

      const itemsResponse = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: itemsQuery,
        }),
      });

      if (!configResponse.ok || !itemsResponse.ok) {
        throw new Error('Failed to fetch data')
      }

      const configData = await configResponse.json()
      const itemsData = await itemsResponse.json()

      if (configData.errors || itemsData.errors) {
        throw new Error('GraphQL errors occurred')
      }
      
      setConfigurations(configData.data.enzymeConfigurations || [])
      setEnzymeItems(itemsData.data.items || [])
    } catch (error) {
      console.error('Error loading enzyme configurations:', error)
      toast.error('Failed to load enzyme configurations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const resetForm = () => {
    setFormData({
      itemId: '',
      category: '',
      dosePerMetricTon: '',
      instructions: '',
      active: true
    })
    setEditingId(null)
    setShowForm(false)
  }

  const handleEdit = (config: EnzymeConfiguration) => {
    setFormData({
      itemId: config.item.id,
      category: config.category,
      dosePerMetricTon: config.dosePerMetricTon.toString(),
      instructions: config.instructions,
      active: config.active
    })
    setEditingId(config.id)
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.itemId || !formData.category || !formData.dosePerMetricTon || !formData.instructions) {
      toast.error('Please fill in all required fields')
      return
    }

    try {
      const dose = parseFloat(formData.dosePerMetricTon)
      if (isNaN(dose) || dose < 0) {
        toast.error('Please enter a valid dose amount')
        return
      }

      if (editingId) {
        // Update existing configuration using GraphQL proxy
        const updateQuery = `
          mutation UpdateEnzymeConfiguration($where: EnzymeConfigurationWhereUniqueInput!, $data: EnzymeConfigurationUpdateInput!) {
            updateEnzymeConfiguration(where: $where, data: $data) {
              id
              category
              dosePerMetricTon
              instructions
              active
              item {
                id
                itemNumber
                itemName
                itemType
                itemClass
              }
              createdAt
              createdBy
              updatedAt
              updatedBy
            }
          }
        `;

        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: updateQuery,
            variables: {
              where: { id: editingId },
              data: {
                itemId: formData.itemId,
                category: formData.category,
                dosePerMetricTon: dose,
                instructions: formData.instructions,
                updatedBy: userEmail
              }
            }
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to update configuration')
        }

        const data = await response.json()
        if (data.errors) {
          throw new Error('GraphQL errors occurred')
        }

        toast.success('Enzyme configuration updated successfully')
      } else {
        // Create new configuration using GraphQL proxy
        const createQuery = `
          mutation CreateEnzymeConfiguration($data: EnzymeConfigurationCreateInput!) {
            createEnzymeConfiguration(data: $data) {
              id
              category
              dosePerMetricTon
              instructions
              active
              item {
                id
                itemNumber
                itemName
                itemType
                itemClass
              }
              createdAt
              createdBy
              updatedAt
              updatedBy
            }
          }
        `;

        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: createQuery,
            variables: {
              data: {
                itemId: formData.itemId,
                category: formData.category,
                dosePerMetricTon: dose,
                instructions: formData.instructions,
                createdBy: userEmail
              }
            }
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to create configuration')
        }

        const data = await response.json()
        if (data.errors) {
          throw new Error('GraphQL errors occurred')
        }

        toast.success('Enzyme configuration created successfully')
      }

      resetForm()
      await loadData()
    } catch (error) {
      console.error('Error saving enzyme configuration:', error)
      toast.error('Failed to save enzyme configuration')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this enzyme configuration?')) {
      return
    }

    try {
      const deleteQuery = `
        mutation DeleteEnzymeConfiguration($where: EnzymeConfigurationWhereUniqueInput!) {
          deleteEnzymeConfiguration(where: $where) {
            id
          }
        }
      `;

      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: deleteQuery,
          variables: {
            where: { id }
          }
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete configuration')
      }

      const data = await response.json()
      if (data.errors) {
        throw new Error('GraphQL errors occurred')
      }

      toast.success('Enzyme configuration deleted successfully')
      await loadData()
    } catch (error) {
      console.error('Error deleting enzyme configuration:', error)
      toast.error('Failed to delete enzyme configuration')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading enzyme configurations...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Enzyme Configurations</h2>
          <p className="text-muted-foreground">
            Manage enzyme dosing configurations for production
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Configuration
        </Button>
      </div>

      {/* Configuration Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>
              {editingId ? 'Edit' : 'Create'} Enzyme Configuration
            </CardTitle>
            <CardDescription>
              Configure enzyme dosing parameters for production recipes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="enzyme-item">Enzyme Item *</Label>
                  <Select
                    value={formData.itemId}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, itemId: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select enzyme item" />
                    </SelectTrigger>
                    <SelectContent>
                      {enzymeItems.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.itemNumber} - {item.itemName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {ENZYME_CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category.replace('_', ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dose">Dose per Metric Ton *</Label>
                  <Input
                    id="dose"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.dosePerMetricTon}
                    onChange={(e) => setFormData(prev => ({ ...prev, dosePerMetricTon: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="active">Active</Label>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="active"
                      checked={formData.active}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, active: checked }))}
                    />
                    <span className="text-sm text-muted-foreground">
                      {formData.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="instructions">Instructions *</Label>
                <Textarea
                  id="instructions"
                  value={formData.instructions}
                  onChange={(e) => setFormData(prev => ({ ...prev, instructions: e.target.value }))}
                  placeholder="Enter dosing instructions and notes..."
                  rows={3}
                />
              </div>

              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button type="submit">
                  <Save className="h-4 w-4 mr-2" />
                  {editingId ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Configurations List */}
      <div className="grid gap-4">
        {configurations.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <div className="text-center">
                <p className="text-muted-foreground mb-4">No enzyme configurations found</p>
                <Button onClick={() => setShowForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Configuration
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          configurations.map((config) => (
            <Card key={config.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {config.item.itemNumber} - {config.item.itemName}
                      <Badge variant={config.active ? 'default' : 'secondary'}>
                        {config.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Category: {config.category.replace('_', ' ')} | 
                      Dose: {config.dosePerMetricTon} per metric ton
                    </CardDescription>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(config)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(config.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div>
                    <strong>Instructions:</strong>
                    <p className="text-sm text-muted-foreground mt-1">
                      {config.instructions}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Created by {config.createdBy} on {new Date(config.createdAt).toLocaleDateString()}
                    {config.updatedAt !== config.createdAt && (
                      <span> | Updated by {config.updatedBy} on {new Date(config.updatedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
} 