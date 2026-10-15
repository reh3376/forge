'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  RefreshCw, 
  Loader2, 
  CheckCircle, 
  AlertTriangle, 
  Database,
  Zap,
  TrendingUp,
  Activity
} from 'lucide-react'
import { useQueryClient, UseQueryResult } from '@tanstack/react-query'
import { 
  useRecipes, 
  useCreateRecipe, 
  useBatches, 
  useUpdateProductionOrderStatus,
  useEquipmentStatus
} from '@/lib/hooks/use-production-data'
import type { Recipe, Batch, EquipmentStatus } from '@/stores/production-store'

interface QueryStatus {
  status: string
  color: string
}

export function DataFetchingDemo() {
  const queryClient = useQueryClient()
  const [newRecipeName, setNewRecipeName] = useState('')
  const [newRecipeType, setNewRecipeType] = useState<Recipe['whiskyType']>('Bourbon')

  // Production data hooks
  const recipesQuery = useRecipes()
  const batchesQuery = useBatches()
  const equipmentQuery = useEquipmentStatus()

  // Mutation hooks
  const createRecipeMutation = useCreateRecipe()
  const updateOrderStatusMutation = useUpdateProductionOrderStatus()

  const handleCreateRecipe = () => {
    if (newRecipeName.trim()) {
      createRecipeMutation.mutate({
        name: newRecipeName,
        customer: 'Demo Customer',
        whiskyType: newRecipeType as Recipe['whiskyType'],
        status: 'active',
        version: '1.0',
        billOfMaterials: [],
        parameters: {
          highWineProof: 140,
          lowWineProof: 120,
          mashRatio: 1.5,
          cooksPerFermenter: 2,
          fermentationTime: 72
        },
        mashingProtocol: []
      })
    }
  }

  const handleRefreshAll = () => {
    queryClient.invalidateQueries()
  }

  const handleClearCache = () => {
    queryClient.clear()
  }

  const getQueryStatus = (query: UseQueryResult<unknown, Error>): QueryStatus => {
    if (query.isLoading) return { status: 'loading', color: 'blue' }
    if (query.isError) return { status: 'error', color: 'red' }
    if (query.isFetching) return { status: 'fetching', color: 'yellow' }
    if (query.isSuccess) return { status: 'success', color: 'green' }
    return { status: 'idle', color: 'gray' }
  }

  return (
    <div className="space-y-6">
      {/* Query Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-500" />
                <span className="font-medium">Recipes</span>
              </div>
              <Badge 
                variant="outline" 
                className={`text-${getQueryStatus(recipesQuery).color}-600`}
              >
                {getQueryStatus(recipesQuery).status}
              </Badge>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              Last fetched: {recipesQuery.dataUpdatedAt ? new Date(recipesQuery.dataUpdatedAt).toLocaleTimeString() : 'Never'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-green-500" />
                <span className="font-medium">Batches</span>
              </div>
              <Badge 
                variant="outline" 
                className={`text-${getQueryStatus(batchesQuery).color}-600`}
              >
                {getQueryStatus(batchesQuery).status}
              </Badge>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              Last fetched: {batchesQuery.dataUpdatedAt ? new Date(batchesQuery.dataUpdatedAt).toLocaleTimeString() : 'Never'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-purple-500" />
                <span className="font-medium">Equipment</span>
              </div>
              <Badge 
                variant="outline" 
                className={`text-${getQueryStatus(equipmentQuery).color}-600`}
              >
                {getQueryStatus(equipmentQuery).status}
              </Badge>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              Last fetched: {equipmentQuery.dataUpdatedAt ? new Date(equipmentQuery.dataUpdatedAt).toLocaleTimeString() : 'Never'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Control Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Query Controls
          </CardTitle>
          <CardDescription>
            Manage query cache and trigger manual refreshes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button onClick={handleRefreshAll} variant="outline" className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Refresh All
            </Button>
            <Button onClick={handleClearCache} variant="outline" className="gap-2">
              <Database className="w-4 h-4" />
              Clear Cache
            </Button>
            <Button onClick={() => recipesQuery.refetch()} variant="outline" className="gap-2">
              Refetch Recipes
            </Button>
            <Button onClick={() => batchesQuery.refetch()} variant="outline" className="gap-2">
              Refetch Batches
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data Display and Mutations */}
      <Tabs defaultValue="recipes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="recipes">Recipes</TabsTrigger>
          <TabsTrigger value="batches">Batches</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
          <TabsTrigger value="mutations">Mutations</TabsTrigger>
        </TabsList>

        <TabsContent value="recipes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recipe Data</CardTitle>
              <CardDescription>
                Cached for 5 minutes, refetches every 30 seconds
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recipesQuery.isLoading && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading recipes...
                </div>
              )}
              
              {recipesQuery.isError && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Error loading recipes: {recipesQuery.error?.message}
                  </AlertDescription>
                </Alert>
              )}
              
              {recipesQuery.isSuccess && recipesQuery.data && (
                <div className="space-y-2">
                  {recipesQuery.data.map((recipe: Recipe) => (
                    <div key={recipe.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{recipe.name}</span>
                        <Badge variant="outline">{recipe.whiskyType}</Badge>
                        <Badge variant={recipe.status === 'active' ? 'default' : 'secondary'}>
                          {recipe.status}
                        </Badge>
                      </div>
                      {recipesQuery.isFetching && (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="batches" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Batch Data</CardTitle>
              <CardDescription>
                Cached for 1 minute, refetches every 10 seconds
              </CardDescription>
            </CardHeader>
            <CardContent>
              {batchesQuery.isLoading && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading batches...
                </div>
              )}
              
              {batchesQuery.isError && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Error loading batches: {batchesQuery.error?.message}
                  </AlertDescription>
                </Alert>
              )}
              
              {batchesQuery.isSuccess && batchesQuery.data && (
                <div className="space-y-2">
                  {batchesQuery.data.map((batch: Batch) => (
                    <div key={batch.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{batch.batchNumber}</span>
                        <Badge variant="outline">{batch.status}</Badge>
                        <div className="text-sm text-muted-foreground">
                          {batch.qualityMetrics.alcoholContent ? `${batch.qualityMetrics.alcoholContent}% ABV` : 'No metrics'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {batchesQuery.isFetching && (
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateOrderStatusMutation.mutate({
                            id: batch.productionOrderId,
                            status: batch.status === 'completed' ? 'in-progress' : 'completed'
                          })}
                          disabled={updateOrderStatusMutation.isPending}
                        >
                          {updateOrderStatusMutation.isPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            'Toggle Order'
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="equipment" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Equipment Status</CardTitle>
              <CardDescription>
                Cached for 30 seconds, refetches every 5 seconds (real-time)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {equipmentQuery.isLoading && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading equipment status...
                </div>
              )}
              
              {equipmentQuery.isError && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Error loading equipment: {equipmentQuery.error?.message}
                  </AlertDescription>
                </Alert>
              )}
              
              {equipmentQuery.isSuccess && equipmentQuery.data && (
                <div className="space-y-2">
                  {equipmentQuery.data.map((equipment: EquipmentStatus) => (
                    <div key={equipment.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${
                          equipment.status === 'running' ? 'bg-green-500 animate-pulse' :
                          equipment.status === 'idle' ? 'bg-blue-500' :
                          equipment.status === 'maintenance' ? 'bg-yellow-500' : 'bg-red-500'
                        }`}></div>
                        <span className="font-medium">{equipment.name}</span>
                        <Badge variant="outline">{equipment.status}</Badge>
                        {equipment.temperature && equipment.temperature > 0 && (
                          <span className="text-sm text-muted-foreground">
                            {equipment.temperature}°F
                          </span>
                        )}
                      </div>
                      {equipmentQuery.isFetching && (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mutations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mutations Demo</CardTitle>
              <CardDescription>
                Test optimistic updates and error handling
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Recipe name"
                  value={newRecipeName}
                  onChange={(e) => setNewRecipeName(e.target.value)}
                />
                <select
                  value={newRecipeType}
                  onChange={(e) => setNewRecipeType(e.target.value as Recipe['whiskyType'])}
                  className="px-3 py-2 border rounded-md"
                  aria-label="Recipe type"
                >
                  <option value="Bourbon">Bourbon</option>
                  <option value="RyeBourbon">Rye Bourbon</option>
                  <option value="WheatBourbon">Wheat Bourbon</option>
                  <option value="Rye">Rye Whiskey</option>
                  <option value="WheatWhiskey">Wheat Whiskey</option>
                </select>
                <Button
                  onClick={handleCreateRecipe}
                  disabled={createRecipeMutation.isPending || !newRecipeName.trim()}
                  className="gap-2"
                >
                  {createRecipeMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  Create Recipe
                </Button>
              </div>

              {createRecipeMutation.isError && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Recipe creation failed: {createRecipeMutation.error?.message}
                  </AlertDescription>
                </Alert>
              )}

              {createRecipeMutation.isSuccess && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Recipe created successfully! Cache automatically updated.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Performance Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Performance Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="font-medium">Cache Entries</div>
              <div className="text-muted-foreground">
                {queryClient.getQueryCache().getAll().length}
              </div>
            </div>
            <div>
              <div className="font-medium">Active Queries</div>
              <div className="text-muted-foreground">
                {queryClient.getQueryCache().getAll().filter(q => q.state.fetchStatus === 'fetching').length}
              </div>
            </div>
            <div>
              <div className="font-medium">Stale Queries</div>
              <div className="text-muted-foreground">
                {queryClient.getQueryCache().getAll().filter(q => q.isStale()).length}
              </div>
            </div>
            <div>
              <div className="font-medium">Error Queries</div>
              <div className="text-muted-foreground">
                {queryClient.getQueryCache().getAll().filter(q => q.state.status === 'error').length}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 