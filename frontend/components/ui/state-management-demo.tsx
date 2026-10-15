'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useProductionStore } from '@/stores/production-store'
import { 
  Plus, 
  Trash2, 
  Edit, 
  Save, 
  X, 
  Factory, 
  Package, 
  Settings,
  Database
} from 'lucide-react'

export function StateManagementDemo() {
  const {
    recipes,
    productionOrders,
    batches,
    equipment,
    selectedRecipe,
    loading,
    errors,
    addRecipe,
    updateRecipe,
    deleteRecipe,
    selectRecipe,
    addProductionOrder,
    updateProductionOrder,
    addBatch,
    updateBatchStatus,
    setEquipment,
    clearAllErrors
  } = useProductionStore()

  const [newRecipeName, setNewRecipeName] = useState('')
  const [editingRecipe, setEditingRecipe] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const handleAddRecipe = () => {
    if (newRecipeName.trim()) {
      const newRecipe = {
        id: `recipe-${Date.now()}`,
        name: newRecipeName,
        customer: 'Demo Customer',
        whiskyType: 'Bourbon' as const,
        status: 'active' as const,
        version: '1.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        billOfMaterials: [],
        parameters: {
          highWineProof: 140,
          lowWineProof: 120,
          mashRatio: 1.5,
          cooksPerFermenter: 2,
          targetYield: 85,
          mashingTemperature: 150,
          fermentationTime: 72,
          distillationProof: 160
        },
        mashingProtocol: []
      }
      addRecipe(newRecipe)
      setNewRecipeName('')
    }
  }

  const handleEditRecipe = (id: string, name: string) => {
    setEditingRecipe(id)
    setEditName(name)
  }

  const handleSaveEdit = () => {
    if (editingRecipe && editName.trim()) {
      updateRecipe(editingRecipe, { name: editName })
      setEditingRecipe(null)
      setEditName('')
    }
  }

  const handleCancelEdit = () => {
    setEditingRecipe(null)
    setEditName('')
  }

  const handleAddProductionOrder = () => {
    const newOrder = {
      id: `po-${Date.now()}`,
      orderNumber: `PO-${Date.now()}`,
      recipeId: recipes[0]?.id || 'demo-recipe',
      quantity: 1000,
      unit: 'gallons',
      status: 'initiated' as const,
      priority: 'medium' as const,
      scheduledStartDate: new Date().toISOString(),
      scheduledEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      containerType: '53gal-barrel',
      finalProof: 120,
      assignedEquipment: ['mash-tun-1', 'fermenter-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    addProductionOrder(newOrder)
  }

  const handleAddBatch = () => {
    const newBatch = {
      id: `batch-${Date.now()}`,
      batchNumber: `B-${Date.now()}`,
      recipeId: recipes[0]?.id || 'demo-recipe',
      productionOrderId: productionOrders[0]?.id || 'demo-order',
      status: 'mashing' as const,
      startDate: new Date().toISOString(),
      equipment: {
        mashingLine: 'mash-tun-1',
        fermenters: ['fermenter-1'],
        distillationLine: 'still-1'
      },
      qualityMetrics: {
        phLevel: 4.2,
        temperature: 78,
        gravity: 1.045
      },
      yields: {
        mashVolume: 1000,
        fermentedVolume: 950,
        proofGallons: 500
      }
    }
    addBatch(newBatch)
  }

  const mockEquipment = () => {
    const equipment = [
      {
        id: 'mash-tun-1',
        name: 'Mash Tun #1',
        type: 'mashing' as const,
        status: 'running' as const,
        ...(batches[0] && { currentBatch: batches[0].id }),
        temperature: 150,
        pressure: 14.7,
        level: 85,
        lastUpdate: new Date().toISOString()
      },
      {
        id: 'fermenter-1',
        name: 'Fermenter #1',
        type: 'fermentation' as const,
        status: 'idle' as const,
        temperature: 78,
        pressure: 14.7,
        level: 0,
        lastUpdate: new Date().toISOString()
      }
    ]
    setEquipment(equipment)
  }

  return (
    <div className="space-y-6">
      {/* Store Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Recipes</p>
                <p className="text-2xl font-bold">{recipes.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Factory className="w-4 h-4 text-green-500" />
              <div>
                <p className="text-sm font-medium">Orders</p>
                <p className="text-2xl font-bold">{productionOrders.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-purple-500" />
              <div>
                <p className="text-sm font-medium">Batches</p>
                <p className="text-2xl font-bold">{batches.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-orange-500" />
              <div>
                <p className="text-sm font-medium">Equipment</p>
                <p className="text-2xl font-bold">{equipment.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Interactive Demo */}
      <Tabs defaultValue="recipes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="recipes">Recipes</TabsTrigger>
          <TabsTrigger value="orders">Production Orders</TabsTrigger>
          <TabsTrigger value="batches">Batches</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
        </TabsList>

        <TabsContent value="recipes" className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter recipe name"
              value={newRecipeName}
              onChange={(e) => setNewRecipeName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddRecipe()}
            />
            <Button onClick={handleAddRecipe} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Recipe
            </Button>
          </div>
          
          <div className="space-y-2">
            {recipes.map((recipe) => (
              <div key={recipe.id} className="flex items-center justify-between p-3 border rounded-lg">
                {editingRecipe === recipe.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSaveEdit()}
                    />
                    <Button size="sm" onClick={handleSaveEdit} className="gap-1">
                      <Save className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleCancelEdit} className="gap-1">
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{recipe.name}</span>
                      <Badge variant="outline">{recipe.whiskyType}</Badge>
                      {selectedRecipe?.id === recipe.id && (
                        <Badge variant="default">Selected</Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => selectRecipe(recipe)}
                        className="gap-1"
                      >
                        Select
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleEditRecipe(recipe.id, recipe.name)}
                        className="gap-1"
                      >
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => deleteRecipe(recipe.id)}
                        className="gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {recipes.length === 0 && (
              <p className="text-muted-foreground text-center py-4">No recipes yet. Add one above!</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="orders" className="space-y-4">
          <Button onClick={handleAddProductionOrder} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Production Order
          </Button>
          
          <div className="space-y-2">
            {productionOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="font-medium">{order.orderNumber}</span>
                  <Badge variant="outline">{order.status}</Badge>
                  <span className="text-sm text-muted-foreground">{order.quantity} {order.unit}</span>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => updateProductionOrder(order.id, { 
                      status: order.status === 'initiated' ? 'in-progress' : 'initiated' 
                    })}
                  >
                    Toggle Status
                  </Button>
                </div>
              </div>
            ))}
            {productionOrders.length === 0 && (
              <p className="text-muted-foreground text-center py-4">No production orders yet. Add one above!</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="batches" className="space-y-4">
          <Button onClick={handleAddBatch} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Batch
          </Button>
          
          <div className="space-y-2">
            {batches.map((batch) => (
              <div key={batch.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="font-medium">{batch.batchNumber}</span>
                  <Badge variant="outline">{batch.status}</Badge>
                  <span className="text-sm text-muted-foreground">Started: {new Date(batch.startDate).toLocaleDateString()}</span>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => updateBatchStatus(batch.id, 
                      batch.status === 'mashing' ? 'fermenting' : 'mashing'
                    )}
                  >
                    Toggle Status
                  </Button>
                </div>
              </div>
            ))}
            {batches.length === 0 && (
              <p className="text-muted-foreground text-center py-4">No batches yet. Add one above!</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="equipment" className="space-y-4">
          <Button onClick={mockEquipment} className="gap-2">
            <Settings className="w-4 h-4" />
            Load Mock Equipment
          </Button>
          
          <div className="space-y-2">
            {equipment.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="font-medium">{item.name}</span>
                  <Badge variant="outline">{item.status}</Badge>
                  <span className="text-sm text-muted-foreground">{item.type}</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {item.temperature}°F
                </div>
              </div>
            ))}
            {equipment.length === 0 && (
              <p className="text-muted-foreground text-center py-4">No equipment loaded. Click above to load mock data!</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Actions */}
      <div className="flex gap-2 pt-4 border-t">
        <Button variant="outline" onClick={clearAllErrors} className="gap-2">
          <Trash2 className="w-4 h-4" />
          Clear All Data
        </Button>
      </div>

      {/* Loading/Error States */}
      {Object.values(loading).some(Boolean) && (
        <div className="text-sm text-muted-foreground">
          Loading: {Object.entries(loading).filter(([, isLoading]) => isLoading).map(([key]) => key).join(', ')}
        </div>
      )}
      
      {Object.values(errors).some(Boolean) && (
        <div className="text-sm text-red-600">
          Errors: {Object.entries(errors).filter(([, err]) => err).map(([key, err]) => `${key}: ${err}`).join(', ')}
        </div>
      )}
    </div>
  )
} 