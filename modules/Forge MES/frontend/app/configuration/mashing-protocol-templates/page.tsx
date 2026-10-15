'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, Search, Filter, Loader2, Copy, Edit, Trash2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageContainer } from '@/components/ui/layout'
import { RouteGuard } from '@/components/auth/route-guard'
import { ManufacturingPermission } from '@/lib/auth-config'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'

// Types for mashing protocol data
interface MashingProtocolStep {
  id: string
  stepType: string
  stepTime: number | null
  holdType: string | null
  agitatorEnabled: boolean
  agitatorSpdSp: number | null
  heatEnabled: boolean
  heatTempSp: number | null
  coolEnabled: boolean
  coolTempSp: number | null
  temperatureActual: number | null
  temperatureSetpoint: number | null
  promptMessage: string | null
  recipeBomItem: Array<{
    id: string
    quantity: number
    item: {
      id: string
      itemNumber: string
      itemName: string
    }
  }>
}

interface MashingProtocol {
  id: string
  name: string
  isTemplate: boolean
  master: boolean
  templateCategory: string | null
  templateDescription: string | null
  steps: MashingProtocolStep[]
}

interface CreateTemplateData {
  name: string
  templateCategory: string
  templateDescription: string
  sourceProtocolId: string
}

// GraphQL queries and mutations
const GET_MASHING_PROTOCOLS_QUERY = `
  query GetMashingProtocols {
    mashingProtocols {
      id
      name
      isTemplate
      master
      templateCategory
      templateDescription
      steps {
        id
        stepType
        stepTime
        holdType
        agitatorEnabled
        agitatorSpdSp
        heatEnabled
        heatTempSp
        coolEnabled
        coolTempSp
        temperatureActual
        temperatureSetpoint
        promptMessage
        recipeBomItem {
          id
          quantity
          item {
            id
            itemNumber
            itemName
          }
        }
      }
    }
  }
`

const UPDATE_MASHING_PROTOCOL_MUTATION = `
  mutation UpdateMashingProtocol($where: MashingProtocolWhereUniqueInput!, $data: MashingProtocolUpdateInput!) {
    updateMashingProtocol(where: $where, data: $data) {
      id
      name
      isTemplate
      master
      templateCategory
      templateDescription
    }
  }
`

const DELETE_MASHING_PROTOCOL_MUTATION = `
  mutation DeleteMashingProtocol($where: MashingProtocolWhereUniqueInput!) {
    deleteMashingProtocol(where: $where) {
      id
    }
  }
`

// Template categories
const TEMPLATE_CATEGORIES = [
  'RyeBourbon',
  'WheatedBourbon', 
  'FourGrainBourbon',
  'RyeWhiskey',
  'WheatWhiskey',
  'MaltWhiskey'
]

export default function MashingProtocolTemplatesPage() {
  const { user } = useAuth()
  const [protocols, setProtocols] = useState<MashingProtocol[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedProtocol, setSelectedProtocol] = useState<MashingProtocol | null>(null)
  const [protocolSearchTerm, setProtocolSearchTerm] = useState('')
  const [createTemplateData, setCreateTemplateData] = useState<CreateTemplateData>({
    name: '',
    templateCategory: '',
    templateDescription: '',
    sourceProtocolId: ''
  })
  const [editTemplateData, setEditTemplateData] = useState({
    name: '',
    templateCategory: '',
    templateDescription: ''
  })

  // Fetch protocols
  const fetchProtocols = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: GET_MASHING_PROTOCOLS_QUERY,
        }),
      })

      const result = await response.json()
      if (result.errors) {
        throw new Error(result.errors[0]?.message || 'Failed to fetch protocols')
      }

      setProtocols(result.data.mashingProtocols || [])
    } catch (error) {
      console.error('Error fetching protocols:', error)
      toast.error('Failed to load mashing protocols')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProtocols()
  }, [fetchProtocols])

  // Filter protocols based on search and category
  const filteredProtocols = useMemo(() => {
    return protocols.filter(protocol => {
      const matchesSearch = protocol.name.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesCategory = selectedCategory === 'all' || 
        (selectedCategory === 'templates' && protocol.isTemplate) ||
        (selectedCategory === 'protocols' && !protocol.isTemplate) ||
        protocol.templateCategory === selectedCategory
      
      return matchesSearch && matchesCategory
    })
  }, [protocols, searchTerm, selectedCategory])

  // Separate templates and regular protocols
  const templates = filteredProtocols.filter(p => p.isTemplate)
  const regularProtocols = filteredProtocols.filter(p => !p.isTemplate)

  // Filter protocols for the create modal based on search
  const filteredProtocolsForModal = useMemo(() => {
    return protocols
      .filter(p => !p.isTemplate)
      .filter(p => p.name.toLowerCase().includes(protocolSearchTerm.toLowerCase()))
  }, [protocols, protocolSearchTerm])

  // Handle create template from existing protocol
  const handleCreateTemplate = async () => {
    if (!createTemplateData.sourceProtocolId || !createTemplateData.name) {
      alert('Please select a source protocol and provide a template name')
      return
    }

    const sourceProtocol = protocols.find(p => p.id === createTemplateData.sourceProtocolId)
    if (!sourceProtocol) {
      alert('Source protocol not found')
      return
    }

    try {
      // First, create the protocol without steps
      const createProtocolMutation = `
        mutation CreateMashingProtocol($data: MashingProtocolCreateInput!) {
          createMashingProtocol(data: $data) {
            id
            name
            isTemplate
            master
            templateCategory
            templateDescription
          }
        }
      `

      const protocolData: {
        name: string
        isTemplate: boolean
        master: boolean
        templateDescription: string
        createdBy: string
        templateCategory?: string
      } = {
        name: createTemplateData.name,
        isTemplate: true,
        master: true,
        templateDescription: createTemplateData.templateDescription,
        createdBy: user?.email || 'unknown-user'
      }

      // Only include templateCategory if it's selected and not empty
      if (createTemplateData.templateCategory && createTemplateData.templateCategory.trim() !== '') {
        protocolData.templateCategory = createTemplateData.templateCategory
      }

      const protocolResponse = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: createProtocolMutation,
          variables: { 
            data: protocolData
          }
        })
      })

      const protocolResult = await protocolResponse.json()
      
      if (protocolResult.errors) {
        throw new Error(protocolResult.errors[0].message)
      }

      const newProtocolId = protocolResult.data.createMashingProtocol.id

      // Create a RecipeBom for the template if there are BOM items to copy
      let templateRecipeBomId: string | null = null
      const stepsWithBomItems = sourceProtocol.steps.filter(step => step.recipeBomItem && step.recipeBomItem.length > 0)
      
      if (stepsWithBomItems.length > 0) {
        const createRecipeBomMutation = `
          mutation CreateRecipeBom($data: RecipeBomCreateInput!) {
            createRecipeBom(data: $data) {
              id
            }
          }
        `

        const recipeBomResponse = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: createRecipeBomMutation,
            variables: { 
              data: {
                createdBy: user?.email || 'unknown-user'
              }
            }
          })
        })

        const recipeBomResult = await recipeBomResponse.json()
        
        if (recipeBomResult.errors) {
          console.warn('Failed to create RecipeBom for template:', recipeBomResult.errors[0].message)
        } else {
          templateRecipeBomId = recipeBomResult.data.createRecipeBom.id
          console.log('Created RecipeBom for template:', templateRecipeBomId)
        }
      }

      // Create a map to store created RecipeBomItems for each original item
      const bomItemMap = new Map<string, string>()

      // Create RecipeBomItems for the template if we have a RecipeBom
      if (templateRecipeBomId) {
        const createRecipeBomItemMutation = `
          mutation CreateRecipeBomItem($data: RecipeBomItemCreateInput!) {
            createRecipeBomItem(data: $data) {
              id
            }
          }
        `

        // Collect unique BOM items from all steps
        const uniqueBomItems = new Map<string, { quantity: number; itemId: string }>()
        
        for (const step of stepsWithBomItems) {
          for (const bomItem of step.recipeBomItem) {
            const key = bomItem.item.id
            if (!uniqueBomItems.has(key)) {
              uniqueBomItems.set(key, {
                quantity: bomItem.quantity,
                itemId: bomItem.item.id
              })
            }
          }
        }

        // Create RecipeBomItems for each unique item
        for (const [itemId, bomData] of uniqueBomItems) {
          try {
            const bomItemResponse = await fetch('/api/graphql', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: createRecipeBomItemMutation,
                variables: { 
                  data: {
                    quantity: bomData.quantity,
                    createdBy: user?.email || 'unknown-user',
                    item: { connect: { id: itemId } },
                    recipeBoms: { connect: { id: templateRecipeBomId } }
                  }
                }
              })
            })

            const bomItemResult = await bomItemResponse.json()
            
            if (bomItemResult.errors) {
              console.warn(`Failed to create RecipeBomItem for item ${itemId}:`, bomItemResult.errors[0].message)
            } else {
              bomItemMap.set(itemId, bomItemResult.data.createRecipeBomItem.id)
              console.log(`Created RecipeBomItem for item ${itemId}:`, bomItemResult.data.createRecipeBomItem.id)
            }
          } catch (error) {
            console.warn(`Exception creating RecipeBomItem for item ${itemId}:`, error)
          }
        }
      }

      // Then, create each step individually
      const createStepMutation = `
        mutation CreateMashingProtocolStep($data: MashingProtocolStepCreateInput!) {
          createMashingProtocolStep(data: $data) {
            id
            stepType
            stepTime
            holdType
            agitatorEnabled
            agitatorSpdSp
            heatEnabled
            heatTempSp
            coolEnabled
            coolTempSp
            temperatureActual
            temperatureSetpoint
            promptMessage
            index
          }
        }
      `

      // Create all steps
      let successfulSteps = 0
      let failedSteps = 0
      
      for (const [stepIndex, step] of sourceProtocol.steps.entries()) {
        try {
          const stepInput: {
            stepType: string
            stepTime: number | null
            holdType: string | null
            agitatorEnabled: boolean
            agitatorSpdSp: number | null
            heatEnabled: boolean
            heatTempSp: number | null
            coolEnabled: boolean
            coolTempSp: number | null
            temperatureActual: number | null
            temperatureSetpoint: number | null
            promptMessage: string | null
            index: number
            createdBy: string
            mashingProtocol: { connect: { id: string } }
            recipeBomItem?: { connect: Array<{ id: string }> }
          } = {
            stepType: step.stepType,
            stepTime: step.stepTime,
            holdType: step.holdType,
            agitatorEnabled: step.agitatorEnabled,
            agitatorSpdSp: step.agitatorSpdSp,
            heatEnabled: step.heatEnabled,
            heatTempSp: step.heatTempSp,
            coolEnabled: step.coolEnabled,
            coolTempSp: step.coolTempSp,
            temperatureActual: step.temperatureActual,
            temperatureSetpoint: step.temperatureSetpoint,
            promptMessage: step.promptMessage,
            index: stepIndex + 1,
            createdBy: user?.email || 'unknown-user',
            mashingProtocol: {
              connect: { id: newProtocolId }
            }
          }

          // Add RecipeBomItem connections if they exist
          if (step.recipeBomItem && step.recipeBomItem.length > 0 && bomItemMap.size > 0) {
            const bomItemConnections = step.recipeBomItem
              .map(bomItem => bomItemMap.get(bomItem.item.id))
              .filter(id => id !== undefined)
              .map(id => ({ id }))

            if (bomItemConnections.length > 0) {
              stepInput.recipeBomItem = {
                connect: bomItemConnections
              }
            }
          }

          console.log(`Creating step ${stepIndex + 1}/${sourceProtocol.steps.length}:`, {
            stepType: step.stepType,
            index: stepIndex + 1,
            promptMessage: step.promptMessage,
            bomItemCount: stepInput.recipeBomItem?.connect?.length || 0
          })

          const stepResponse = await fetch('/api/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: createStepMutation,
              variables: { data: stepInput }
            })
          })

          if (!stepResponse.ok) {
            throw new Error(`HTTP ${stepResponse.status}: ${stepResponse.statusText}`)
          }

          const stepResult = await stepResponse.json()
          
          if (stepResult.errors) {
            console.error(`Error creating step ${stepIndex + 1}:`, stepResult.errors[0].message)
            console.error('Step input data:', stepInput)
            console.error('Full error:', stepResult.errors)
            failedSteps++
          } else {
            console.log(`Successfully created step ${stepIndex + 1}:`, stepResult.data.createMashingProtocolStep)
            successfulSteps++
          }

          // Add a small delay to avoid overwhelming the server
          if (stepIndex < sourceProtocol.steps.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        } catch (error) {
          console.error(`Exception creating step ${stepIndex + 1}:`, error)
          failedSteps++
        }
      }

      console.log(`Step creation summary: ${successfulSteps} successful, ${failedSteps} failed out of ${sourceProtocol.steps.length} total`)
      console.log(`RecipeBom created: ${templateRecipeBomId ? 'Yes' : 'No'}`)
      console.log(`RecipeBomItems created: ${bomItemMap.size}`)

      // Refresh the protocols list
      await fetchProtocols()
      setIsCreateModalOpen(false)
      setCreateTemplateData({ name: '', templateCategory: '', templateDescription: '', sourceProtocolId: '' })
      
      if (failedSteps > 0) {
        alert(`Template created with ${successfulSteps} steps. ${failedSteps} steps failed to create. Check console for details.`)
      } else {
        alert('Template created successfully!')
      }
    } catch (error: unknown) {
      console.error('Error creating template:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      alert(`Error creating template: ${errorMessage}`)
    }
  }

  // Handle edit template
  const handleEditTemplate = async () => {
    if (!selectedProtocol || !editTemplateData.name || !editTemplateData.templateCategory) {
      toast.error('Please fill in all required fields')
      return
    }

    try {
      const updateData: {
        name: string
        templateDescription: string
        updatedBy: string
        templateCategory?: string
      } = {
        name: editTemplateData.name,
        templateDescription: editTemplateData.templateDescription,
        updatedBy: user?.email || 'unknown-user'
      }

      // Only include templateCategory if it's selected and not empty
      if (editTemplateData.templateCategory && editTemplateData.templateCategory.trim() !== '') {
        updateData.templateCategory = editTemplateData.templateCategory
      }

      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: UPDATE_MASHING_PROTOCOL_MUTATION,
          variables: { 
            where: { id: selectedProtocol.id },
            data: updateData
          }
        }),
      })

      const result = await response.json()
      if (result.errors) {
        throw new Error(result.errors[0]?.message || 'Failed to update template')
      }

      toast.success('Template updated successfully')
      setIsEditModalOpen(false)
      setSelectedProtocol(null)
      fetchProtocols()
    } catch (error) {
      console.error('Error updating template:', error)
      toast.error('Failed to update template')
    }
  }

  // Handle delete template
  const handleDeleteTemplate = async (protocolId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) {
      return
    }

    try {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: DELETE_MASHING_PROTOCOL_MUTATION,
          variables: { where: { id: protocolId } }
        }),
      })

      const result = await response.json()
      if (result.errors) {
        throw new Error(result.errors[0]?.message || 'Failed to delete template')
      }

      toast.success('Template deleted successfully')
      fetchProtocols()
    } catch (error) {
      console.error('Error deleting template:', error)
      toast.error('Failed to delete template')
    }
  }

  // Open create modal with selected protocol
  const openCreateModal = (sourceProtocol?: MashingProtocol) => {
    setProtocolSearchTerm('')
    setCreateTemplateData({
      name: sourceProtocol ? `${sourceProtocol.name} Template` : '',
      templateCategory: '',
      templateDescription: '',
      sourceProtocolId: sourceProtocol?.id || ''
    })
    setIsCreateModalOpen(true)
  }

  // Open edit modal
  const openEditModal = (protocol: MashingProtocol) => {
    setSelectedProtocol(protocol)
    setEditTemplateData({
      name: protocol.name,
      templateCategory: protocol.templateCategory || 'Custom',
      templateDescription: protocol.templateDescription || ''
    })
    setIsEditModalOpen(true)
  }

  const getStepTypeColor = (stepType: string) => {
    const colors: Record<string, string> = {
      'LiquidAdd': 'bg-blue-100 text-blue-800',
      'Hold': 'bg-yellow-100 text-yellow-800',
      'AdditiveAdd': 'bg-green-100 text-green-800',
      'Malt': 'bg-purple-100 text-purple-800',
      'Corn': 'bg-orange-100 text-orange-800',
      'Rye': 'bg-red-100 text-red-800',
      'Wheat': 'bg-amber-100 text-amber-800'
    }
    return colors[stepType] || 'bg-gray-100 text-gray-800'
  }

  return (
    <RouteGuard config={{ 
      requiresAuth: true,
      requiredPermissions: [ManufacturingPermission.EDIT_RECIPES]
    }}>
      <PageContainer>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Mashing Protocol Templates</h1>
              <p className="text-muted-foreground">
                Manage mashing protocol templates for recipe configuration
              </p>
            </div>
            <Button onClick={() => openCreateModal()} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Template
            </Button>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search protocols and templates..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[200px]">
                <Filter className="h-4 w-4" />
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="templates">Templates Only</SelectItem>
                <SelectItem value="protocols">Protocols Only</SelectItem>
                {TEMPLATE_CATEGORIES.map(category => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="space-y-8">
              {/* Templates Section */}
              {templates.length > 0 && (
                <div>
                  <div className="mb-4 flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <h2 className="text-xl font-semibold">Templates ({templates.length})</h2>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {templates.map((protocol) => (
                      <Card key={protocol.id} className="border-primary/20">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <CardTitle className="text-base">{protocol.name}</CardTitle>
                              <div className="flex gap-2">
                                <Badge variant="secondary" className="text-xs">
                                  Template
                                </Badge>
                                {protocol.templateCategory && (
                                  <Badge variant="outline" className="text-xs">
                                    {protocol.templateCategory}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditModal(protocol)}
                                className="h-8 w-8"
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteTemplate(protocol.id)}
                                className="h-8 w-8 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          {protocol.templateDescription && (
                            <CardDescription className="text-sm">
                              {protocol.templateDescription}
                            </CardDescription>
                          )}
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="space-y-2">
                            <div className="text-sm text-muted-foreground">
                              {protocol.steps.length} steps
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {protocol.steps.slice(0, 3).map((step) => (
                                <Badge
                                  key={step.id}
                                  variant="outline"
                                  className={`text-xs ${getStepTypeColor(step.stepType)}`}
                                >
                                  {step.stepType}
                                </Badge>
                              ))}
                              {protocol.steps.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{protocol.steps.length - 3} more
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Regular Protocols Section */}
              {regularProtocols.length > 0 && (
                <div>
                  <div className="mb-4 flex items-center gap-2">
                    <h2 className="text-xl font-semibold">Protocols ({regularProtocols.length})</h2>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {regularProtocols.map((protocol) => (
                      <Card key={protocol.id}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <CardTitle className="text-base">{protocol.name}</CardTitle>
                              <Badge variant="outline" className="text-xs w-fit">
                                Protocol
                              </Badge>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openCreateModal(protocol)}
                              className="h-8 w-8"
                              title="Create template from this protocol"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="space-y-2">
                            <div className="text-sm text-muted-foreground">
                              {protocol.steps.length} steps
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {protocol.steps.slice(0, 3).map((step) => (
                                <Badge
                                  key={step.id}
                                  variant="outline"
                                  className={`text-xs ${getStepTypeColor(step.stepType)}`}
                                >
                                  {step.stepType}
                                </Badge>
                              ))}
                              {protocol.steps.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{protocol.steps.length - 3} more
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {filteredProtocols.length === 0 && !loading && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No protocols found matching your criteria.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Create Template Modal */}
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create Mashing Protocol Template</DialogTitle>
              <DialogDescription>
                Create a new template from an existing mashing protocol
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="source-protocol">Source Protocol</Label>
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search protocols..."
                      value={protocolSearchTerm}
                      onChange={(e) => setProtocolSearchTerm(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  <Select
                    value={createTemplateData.sourceProtocolId}
                    onValueChange={(value) => 
                      setCreateTemplateData(prev => ({ ...prev, sourceProtocolId: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a protocol to base the template on" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {filteredProtocolsForModal.length === 0 ? (
                        <div className="p-2 text-sm text-muted-foreground">
                          {protocolSearchTerm ? 'No protocols found matching search' : 'No protocols available'}
                        </div>
                      ) : (
                        filteredProtocolsForModal.map((protocol) => (
                          <SelectItem key={protocol.id} value={protocol.id}>
                            <div className="flex flex-col">
                              <span>{protocol.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {protocol.steps.length} steps
                              </span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-name">Template Name</Label>
                <Input
                  id="template-name"
                  value={createTemplateData.name}
                  onChange={(e) => 
                    setCreateTemplateData(prev => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Enter template name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-category">Category</Label>
                <Select
                  value={createTemplateData.templateCategory}
                  onValueChange={(value) => 
                    setCreateTemplateData(prev => ({ ...prev, templateCategory: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-description">Description</Label>
                <Textarea
                  id="template-description"
                  value={createTemplateData.templateDescription}
                  onChange={(e) => 
                    setCreateTemplateData(prev => ({ ...prev, templateDescription: e.target.value }))
                  }
                  placeholder="Enter template description"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateTemplate}>
                  Create Template
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Template Modal */}
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Edit Template</DialogTitle>
              <DialogDescription>
                Update template information
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-template-name">Template Name</Label>
                <Input
                  id="edit-template-name"
                  value={editTemplateData.name}
                  onChange={(e) => 
                    setEditTemplateData(prev => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Enter template name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-template-category">Category</Label>
                <Select
                  value={editTemplateData.templateCategory}
                  onValueChange={(value) => 
                    setEditTemplateData(prev => ({ ...prev, templateCategory: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-template-description">Description</Label>
                <Textarea
                  id="edit-template-description"
                  value={editTemplateData.templateDescription}
                  onChange={(e) => 
                    setEditTemplateData(prev => ({ ...prev, templateDescription: e.target.value }))
                  }
                  placeholder="Enter template description"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleEditTemplate}>
                  Update Template
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </RouteGuard>
  )
} 