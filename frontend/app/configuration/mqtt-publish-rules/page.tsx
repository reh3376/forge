'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { PageContainer } from '@/components/ui/layout'
import { RouteGuard } from '@/components/auth/route-guard'
import { ManufacturingPermission } from '@/lib/auth-config'
import { useJWTAuth } from '@/hooks/useJWTAuth'
import { useAuth } from '@/lib/auth-context'
import { UnifiedGraphQLClient } from '@/lib/api/unified-graphql-client'
import {
  GET_MQTT_EVENT_PUBLISH_RULES,
  CREATE_MQTT_EVENT_PUBLISH_RULE,
  UPDATE_MQTT_EVENT_PUBLISH_RULE,
  DELETE_MQTT_EVENT_PUBLISH_RULE,
  TEST_MQTT_PUBLISH_RULE,
  ENTITY_TYPES,
  SEVERITY_LEVELS,
  PRODUCTION_PHASES,
  PayloadMode,
  type MqttEventPublishRule,
  type MqttEventPublishRuleCreateInput,
  type MqttEventPublishRuleUpdateInput,
  type GetMqttEventPublishRulesResult,
  type CreateMqttEventPublishRuleResult,
  type UpdateMqttEventPublishRuleResult,
  type DeleteMqttEventPublishRuleResult,
  type TestMqttPublishRuleResult,
  type TestPublishRuleResult
} from '@/lib/api/graphql/mqtt-publish-rules'
import {
  GET_UNS_BROKER_CONFIGURATIONS,
  type GetUnsBrokerConfigurationsResult,
  type UnsBrokerConfiguration
} from '@/lib/api/graphql/mqtt-brokers'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Plus,
  Edit,
  Trash2,
  Send,
  RefreshCw,
  XCircle,
  CheckCircle,
  LogIn,
  Power,
  PowerOff,
  Info,
  Play,
  Loader2
} from 'lucide-react'

// Create the GraphQL client instance with JWT authentication
const graphqlClient = new UnifiedGraphQLClient({
  useJWTAuth: true,
  enableRetry: true,
})

interface RuleFormData {
  name: string
  description: string
  entityType: string
  eventType: string
  severityFilter: string[]
  phaseFilter: string[]
  assetFilter: string
  topicTemplate: string
  payloadMode: PayloadMode
  includeRelations: string
  excludeFields: string
  payloadTransform: string
  qos: number
  retain: boolean
  enabled: boolean
  priority: number
  brokerIds: string[]
}

const defaultFormData: RuleFormData = {
  name: '',
  description: '',
  entityType: 'ScheduleOrder',
  eventType: '*',
  severityFilter: [],
  phaseFilter: [],
  assetFilter: '',
  topicTemplate: 'whk/events/{entityType}/{eventType}/{entityId}',
  payloadMode: PayloadMode.Full,
  includeRelations: '',
  excludeFields: '',
  payloadTransform: '',
  qos: 1,
  retain: false,
  enabled: true,
  priority: 0,
  brokerIds: []
}

export default function MqttPublishRulesPage() {
  const [isClient, setIsClient] = useState(false)
  const { user, isAuthenticated } = useJWTAuth()
  const { isAuthenticated: isAuthContextAuthenticated } = useAuth()
  const [rules, setRules] = useState<MqttEventPublishRule[]>([])
  const [brokers, setBrokers] = useState<UnsBrokerConfiguration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<MqttEventPublishRule | null>(null)
  const [formData, setFormData] = useState<RuleFormData>(defaultFormData)
  const [submitting, setSubmitting] = useState(false)
  const [testingRuleId, setTestingRuleId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<TestPublishRuleResult | null>(null)
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false)

  // Check if user is authenticated (either JWT or auth context)
  const isUserAuthenticated = isAuthenticated || isAuthContextAuthenticated

  useEffect(() => {
    setIsClient(true)
  }, [])

  const fetchRules = async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await graphqlClient.query<GetMqttEventPublishRulesResult>(
        GET_MQTT_EVENT_PUBLISH_RULES,
        {
          fetchPolicy: 'network-only'
        }
      )

      setRules(result.mqttEventPublishRules || [])
      console.log('Successfully fetched MQTT publish rules:', result.mqttEventPublishRules?.length || 0)

    } catch (error) {
      console.error('Failed to fetch MQTT publish rules:', error)
      setError('Unable to fetch MQTT publish rules. Check your authentication and backend connection.')
      setRules([])
    } finally {
      setLoading(false)
    }
  }

  const fetchBrokers = async () => {
    try {
      const result = await graphqlClient.query<GetUnsBrokerConfigurationsResult>(
        GET_UNS_BROKER_CONFIGURATIONS,
        {
          fetchPolicy: 'network-only'
        }
      )

      setBrokers(result.unsBrokerConfigurations || [])
    } catch (error) {
      console.error('Failed to fetch MQTT brokers:', error)
    }
  }

  useEffect(() => {
    async function fetchData() {
      if (isUserAuthenticated) {
        await Promise.all([fetchRules(), fetchBrokers()])
      }
    }

    if (isClient) {
      fetchData()
    }
  }, [isClient, isUserAuthenticated])

  const handleCreateRule = () => {
    setEditingRule(null)
    setFormData(defaultFormData)
    setIsDialogOpen(true)
  }

  const handleEditRule = (rule: MqttEventPublishRule) => {
    setEditingRule(rule)
    setFormData({
      name: rule.name,
      description: rule.description || '',
      entityType: rule.entityType,
      eventType: rule.eventType,
      severityFilter: rule.severityFilter || [],
      phaseFilter: rule.phaseFilter || [],
      assetFilter: (rule.assetFilter || []).join(', '),
      topicTemplate: rule.topicTemplate,
      payloadMode: rule.payloadMode,
      includeRelations: (rule.includeRelations || []).join(', '),
      excludeFields: (rule.excludeFields || []).join(', '),
      payloadTransform: rule.payloadTransform ? JSON.stringify(rule.payloadTransform, null, 2) : '',
      qos: rule.qos,
      retain: rule.retain,
      enabled: rule.enabled,
      priority: rule.priority,
      brokerIds: rule.brokers?.map(b => b.id) || []
    })
    setIsDialogOpen(true)
  }

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this publish rule?')) {
      return
    }

    try {
      await graphqlClient.mutate<DeleteMqttEventPublishRuleResult>(
        DELETE_MQTT_EVENT_PUBLISH_RULE,
        {
          variables: { where: { id: ruleId } },
          refetchQueries: [{ query: GET_MQTT_EVENT_PUBLISH_RULES }]
        }
      )

      await fetchRules()
      toast.success('MQTT publish rule deleted successfully')
    } catch (error) {
      console.error('Failed to delete rule:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to delete MQTT publish rule')
    }
  }

  const handleToggleEnabled = async (rule: MqttEventPublishRule) => {
    try {
      const userId = user?.username || user?.id || 'system'

      await graphqlClient.mutate<UpdateMqttEventPublishRuleResult>(
        UPDATE_MQTT_EVENT_PUBLISH_RULE,
        {
          variables: {
            where: { id: rule.id },
            data: {
              enabled: !rule.enabled,
              updatedBy: userId
            }
          },
          refetchQueries: [{ query: GET_MQTT_EVENT_PUBLISH_RULES }]
        }
      )

      await fetchRules()
      toast.success(`Rule ${!rule.enabled ? 'enabled' : 'disabled'} successfully`)
    } catch (error) {
      console.error('Failed to toggle rule:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to toggle rule status')
    }
  }

  const handleTestRule = async (rule: MqttEventPublishRule) => {
    try {
      setTestingRuleId(rule.id)

      const result = await graphqlClient.mutate<TestMqttPublishRuleResult>(
        TEST_MQTT_PUBLISH_RULE,
        {
          variables: { where: { id: rule.id } }
        }
      )

      setTestResult(result.testMqttPublishRule)
      setIsTestDialogOpen(true)

      if (result.testMqttPublishRule.success) {
        toast.success('Test message published successfully')
      } else {
        toast.error(result.testMqttPublishRule.error || 'Test failed')
      }
    } catch (error) {
      console.error('Failed to test rule:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to test publish rule')
    } finally {
      setTestingRuleId(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      // Parse comma-separated fields
      const parseCommaSeparated = (value: string): string[] => {
        return value.split(',').map(s => s.trim()).filter(s => s.length > 0)
      }

      // Parse payload transform JSON
      let payloadTransform = null
      if (formData.payloadTransform.trim()) {
        try {
          payloadTransform = JSON.parse(formData.payloadTransform)
        } catch {
          throw new Error('Invalid JSON in payload transform field')
        }
      }

      const userId = user?.username || user?.id || 'system'

      if (editingRule) {
        const updateData: MqttEventPublishRuleUpdateInput = {
          name: formData.name,
          description: formData.description || null,
          entityType: formData.entityType,
          eventType: formData.eventType,
          severityFilter: formData.severityFilter,
          phaseFilter: formData.phaseFilter,
          assetFilter: parseCommaSeparated(formData.assetFilter),
          topicTemplate: formData.topicTemplate,
          payloadMode: formData.payloadMode,
          includeRelations: parseCommaSeparated(formData.includeRelations),
          excludeFields: parseCommaSeparated(formData.excludeFields),
          payloadTransform,
          qos: formData.qos,
          retain: formData.retain,
          enabled: formData.enabled,
          priority: formData.priority,
          updatedBy: userId,
          brokers: { set: formData.brokerIds.map(id => ({ id })) }
        }

        await graphqlClient.mutate<UpdateMqttEventPublishRuleResult>(
          UPDATE_MQTT_EVENT_PUBLISH_RULE,
          {
            variables: { where: { id: editingRule.id }, data: updateData },
            refetchQueries: [{ query: GET_MQTT_EVENT_PUBLISH_RULES }]
          }
        )

        toast.success('MQTT publish rule updated successfully')
      } else {
        const createData: MqttEventPublishRuleCreateInput = {
          name: formData.name,
          description: formData.description || null,
          entityType: formData.entityType,
          eventType: formData.eventType,
          severityFilter: formData.severityFilter,
          phaseFilter: formData.phaseFilter,
          assetFilter: parseCommaSeparated(formData.assetFilter),
          topicTemplate: formData.topicTemplate,
          payloadMode: formData.payloadMode,
          includeRelations: parseCommaSeparated(formData.includeRelations),
          excludeFields: parseCommaSeparated(formData.excludeFields),
          payloadTransform,
          qos: formData.qos,
          retain: formData.retain,
          enabled: formData.enabled,
          priority: formData.priority,
          createdBy: userId,
          updatedBy: userId,
          brokers: { connect: formData.brokerIds.map(id => ({ id })) }
        }

        await graphqlClient.mutate<CreateMqttEventPublishRuleResult>(
          CREATE_MQTT_EVENT_PUBLISH_RULE,
          {
            variables: { data: createData },
            refetchQueries: [{ query: GET_MQTT_EVENT_PUBLISH_RULES }]
          }
        )

        toast.success('MQTT publish rule created successfully')
      }

      setIsDialogOpen(false)
      setFormData(defaultFormData)
      await fetchRules()
    } catch (error) {
      console.error('Failed to save rule:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save MQTT publish rule')
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogin = () => {
    window.location.href = '/auth-demo'
  }

  const handleRefreshData = async () => {
    await Promise.all([fetchRules(), fetchBrokers()])
    toast.success('Data refreshed successfully')
  }

  const handleSeverityChange = (severity: string, checked: boolean) => {
    if (checked) {
      setFormData(prev => ({
        ...prev,
        severityFilter: [...prev.severityFilter, severity]
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        severityFilter: prev.severityFilter.filter(s => s !== severity)
      }))
    }
  }

  const handlePhaseChange = (phase: string, checked: boolean) => {
    if (checked) {
      setFormData(prev => ({
        ...prev,
        phaseFilter: [...prev.phaseFilter, phase]
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        phaseFilter: prev.phaseFilter.filter(p => p !== phase)
      }))
    }
  }

  const handleBrokerChange = (brokerId: string, checked: boolean) => {
    if (checked) {
      setFormData(prev => ({
        ...prev,
        brokerIds: [...prev.brokerIds, brokerId]
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        brokerIds: prev.brokerIds.filter(id => id !== brokerId)
      }))
    }
  }

  if (!isClient) {
    return <div>Loading...</div>
  }

  return (
    <RouteGuard
      config={{
        requiresAuth: true,
        requiredPermissions: [ManufacturingPermission.SYSTEM_SETTINGS]
      }}
    >
      <PageContainer>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/configuration">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Configuration
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Send className="h-6 w-6" />
                  MQTT Publish Rules
                </h1>
                <p className="text-muted-foreground">
                  Configure domain event publishing to MQTT brokers
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleRefreshData} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              {isUserAuthenticated ? (
                <Button onClick={handleCreateRule}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Rule
                </Button>
              ) : (
                <Button onClick={handleLogin}>
                  <LogIn className="h-4 w-4 mr-2" />
                  Login to Manage
                </Button>
              )}
            </div>
          </div>

          {/* Info Card */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">About MQTT Publish Rules</p>
                  <p>
                    Publish rules define how domain events (e.g., ScheduleOrder status changes, production events)
                    are published to MQTT brokers. Use topic templates with variables like <code className="bg-blue-100 px-1 rounded">{'{entityType}'}</code>,
                    <code className="bg-blue-100 px-1 rounded ml-1">{'{eventType}'}</code>, and <code className="bg-blue-100 px-1 rounded ml-1">{'{entityId}'}</code> to define dynamic topics.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Error State */}
          {error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-red-800">
                  <XCircle className="h-5 w-5" />
                  <span className="font-medium">Error loading publish rules</span>
                </div>
                <p className="text-red-700 mt-2">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchRules}
                  className="mt-3"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Rules List */}
          <Card>
            <CardHeader>
              <CardTitle>Publish Rules</CardTitle>
              <CardDescription>
                Configure which domain events get published to MQTT brokers and how
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                  Loading publish rules...
                </div>
              ) : rules.length === 0 ? (
                <div className="text-center py-8">
                  <Send className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No publish rules configured</h3>
                  <p className="text-muted-foreground mb-4">
                    Get started by adding your first publish rule to enable domain event publishing.
                  </p>
                  {isUserAuthenticated && (
                    <Button onClick={handleCreateRule}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Your First Rule
                    </Button>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Entity Type</TableHead>
                      <TableHead>Event Type</TableHead>
                      <TableHead>Topic Template</TableHead>
                      <TableHead>Payload</TableHead>
                      <TableHead>QoS</TableHead>
                      <TableHead>Brokers</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium">
                          <div>
                            {rule.name}
                            {rule.description && (
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {rule.description}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{rule.entityType}</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">
                            {rule.eventType}
                          </code>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-2 py-1 rounded block max-w-[200px] truncate">
                            {rule.topicTemplate}
                          </code>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{rule.payloadMode}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{rule.qos}</Badge>
                        </TableCell>
                        <TableCell>
                          {rule.brokers?.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              {rule.brokers.map(broker => (
                                <Badge key={broker.id} variant="secondary" className="text-xs">
                                  {broker.host}:{broker.port}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">All brokers</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {rule.enabled ? (
                            <Badge variant="default" className="bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Enabled
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <XCircle className="h-3 w-3 mr-1" />
                              Disabled
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {isUserAuthenticated && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleTestRule(rule)}
                                  disabled={testingRuleId === rule.id || !rule.enabled}
                                  title={!rule.enabled ? 'Enable rule to test' : 'Test publish rule'}
                                  className="text-blue-600 hover:text-blue-700"
                                >
                                  {testingRuleId === rule.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Play className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleToggleEnabled(rule)}
                                  title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                                >
                                  {rule.enabled ? (
                                    <PowerOff className="h-4 w-4" />
                                  ) : (
                                    <Power className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEditRule(rule)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDeleteRule(rule.id)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Create/Edit Rule Dialog */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingRule ? 'Edit Publish Rule' : 'Add Publish Rule'}
                </DialogTitle>
                <DialogDescription>
                  Configure how domain events are published to MQTT brokers.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Production Events to UNS"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Input
                      id="priority"
                      type="number"
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                      placeholder="0"
                    />
                    <p className="text-xs text-muted-foreground">Higher priority rules are evaluated first</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Optional description"
                  />
                </div>

                {/* Entity & Event Matching */}
                <div className="border rounded-lg p-4 space-y-4">
                  <h4 className="font-medium">Event Matching</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="entityType">Entity Type *</Label>
                      <Select
                        value={formData.entityType}
                        onValueChange={(value) => setFormData({ ...formData, entityType: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select entity type" />
                        </SelectTrigger>
                        <SelectContent>
                          {ENTITY_TYPES.map(type => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="eventType">Event Type *</Label>
                      <Input
                        id="eventType"
                        value={formData.eventType}
                        onChange={(e) => setFormData({ ...formData, eventType: e.target.value })}
                        placeholder="* for all events, or specific type"
                      />
                      <p className="text-xs text-muted-foreground">Use * for all events or specify: created, updated, deleted, status_change</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Severity Filter (optional)</Label>
                    <div className="flex flex-wrap gap-4">
                      {SEVERITY_LEVELS.map(severity => (
                        <div key={severity} className="flex items-center space-x-2">
                          <Checkbox
                            id={`severity-${severity}`}
                            checked={formData.severityFilter.includes(severity)}
                            onCheckedChange={(checked) => handleSeverityChange(severity, checked as boolean)}
                          />
                          <Label htmlFor={`severity-${severity}`} className="text-sm font-normal">
                            {severity}
                          </Label>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Leave empty to match all severities</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Phase Filter (optional)</Label>
                    <div className="flex flex-wrap gap-4">
                      {PRODUCTION_PHASES.map(phase => (
                        <div key={phase} className="flex items-center space-x-2">
                          <Checkbox
                            id={`phase-${phase}`}
                            checked={formData.phaseFilter.includes(phase)}
                            onCheckedChange={(checked) => handlePhaseChange(phase, checked as boolean)}
                          />
                          <Label htmlFor={`phase-${phase}`} className="text-sm font-normal">
                            {phase}
                          </Label>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Leave empty to match all phases</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="assetFilter">Asset Filter (optional)</Label>
                    <Input
                      id="assetFilter"
                      value={formData.assetFilter}
                      onChange={(e) => setFormData({ ...formData, assetFilter: e.target.value })}
                      placeholder="Comma-separated asset IDs, e.g., COOKER-01, COOKER-02"
                    />
                    <p className="text-xs text-muted-foreground">Leave empty to match all assets</p>
                  </div>
                </div>

                {/* Topic & Payload */}
                <div className="border rounded-lg p-4 space-y-4">
                  <h4 className="font-medium">Topic & Payload Configuration</h4>

                  <div className="space-y-2">
                    <Label htmlFor="topicTemplate">Topic Template *</Label>
                    <Input
                      id="topicTemplate"
                      value={formData.topicTemplate}
                      onChange={(e) => setFormData({ ...formData, topicTemplate: e.target.value })}
                      placeholder="whk/events/{entityType}/{eventType}/{entityId}"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Variables: {'{entityType}'}, {'{eventType}'}, {'{entityId}'}, {'{assetId}'}, {'{phase}'}, {'{severity}'}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="payloadMode">Payload Mode</Label>
                      <Select
                        value={formData.payloadMode}
                        onValueChange={(value) => setFormData({ ...formData, payloadMode: value as PayloadMode })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={PayloadMode.Full}>Full (entire entity)</SelectItem>
                          <SelectItem value={PayloadMode.EventOnly}>Event Only (event data)</SelectItem>
                          <SelectItem value={PayloadMode.Custom}>Custom (transform)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="qos">QoS Level</Label>
                      <Select
                        value={formData.qos.toString()}
                        onValueChange={(value) => setFormData({ ...formData, qos: parseInt(value) })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">0 - At most once</SelectItem>
                          <SelectItem value="1">1 - At least once</SelectItem>
                          <SelectItem value="2">2 - Exactly once</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 flex items-end">
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="retain"
                          checked={formData.retain}
                          onCheckedChange={(checked) => setFormData({ ...formData, retain: checked })}
                        />
                        <Label htmlFor="retain">Retain Message</Label>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="includeRelations">Include Relations</Label>
                      <Input
                        id="includeRelations"
                        value={formData.includeRelations}
                        onChange={(e) => setFormData({ ...formData, includeRelations: e.target.value })}
                        placeholder="e.g., productionOrder, recipe"
                      />
                      <p className="text-xs text-muted-foreground">Comma-separated relation names to include</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="excludeFields">Exclude Fields</Label>
                      <Input
                        id="excludeFields"
                        value={formData.excludeFields}
                        onChange={(e) => setFormData({ ...formData, excludeFields: e.target.value })}
                        placeholder="e.g., createdAt, updatedAt"
                      />
                      <p className="text-xs text-muted-foreground">Comma-separated field names to exclude</p>
                    </div>
                  </div>

                  {formData.payloadMode === PayloadMode.Custom && (
                    <div className="space-y-2">
                      <Label htmlFor="payloadTransform">Payload Transform (JSON)</Label>
                      <Textarea
                        id="payloadTransform"
                        value={formData.payloadTransform}
                        onChange={(e) => setFormData({ ...formData, payloadTransform: e.target.value })}
                        placeholder='{"field": "$.source.field", "nested": {"value": "$.data.value"}}'
                        rows={4}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">JSONPath expressions for custom payload mapping</p>
                    </div>
                  )}
                </div>

                {/* Broker Selection */}
                <div className="border rounded-lg p-4 space-y-4">
                  <h4 className="font-medium">Target Brokers</h4>
                  {brokers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No MQTT brokers configured. <Link href="/configuration/mqtt-brokers" className="text-blue-600 hover:underline">Add a broker first</Link>.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-4">
                        {brokers.map(broker => (
                          <div key={broker.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`broker-${broker.id}`}
                              checked={formData.brokerIds.includes(broker.id)}
                              onCheckedChange={(checked) => handleBrokerChange(broker.id, checked as boolean)}
                            />
                            <Label htmlFor={`broker-${broker.id}`} className="text-sm font-normal">
                              {broker.host}:{broker.port}
                            </Label>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">Leave empty to publish to all connected brokers</p>
                    </>
                  )}
                </div>

                {/* Status */}
                <div className="flex items-center space-x-2">
                  <Switch
                    id="enabled"
                    checked={formData.enabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                  />
                  <Label htmlFor="enabled">Enable this rule</Label>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        {editingRule ? 'Updating...' : 'Creating...'}
                      </>
                    ) : (
                      editingRule ? 'Update Rule' : 'Create Rule'
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Test Result Dialog */}
          <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {testResult?.success ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                  Test Publish Result
                </DialogTitle>
                <DialogDescription>
                  {testResult?.success
                    ? 'Test message was published successfully'
                    : testResult?.error || 'Test failed'}
                </DialogDescription>
              </DialogHeader>

              {testResult && (
                <div className="space-y-4">
                  {/* Topic */}
                  {testResult.topic && (
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Topic</Label>
                      <code className="block bg-muted p-2 rounded text-sm break-all">
                        {testResult.topic}
                      </code>
                    </div>
                  )}

                  {/* Broker Results */}
                  {testResult.brokerResults.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Broker Results</Label>
                      <div className="space-y-1">
                        {testResult.brokerResults.map((br, idx) => (
                          <div
                            key={idx}
                            className={`flex items-center justify-between p-2 rounded text-sm ${
                              br.success ? 'bg-green-50' : 'bg-red-50'
                            }`}
                          >
                            <span className="font-mono text-xs">{br.brokerId.slice(0, 12)}...</span>
                            {br.success ? (
                              <Badge variant="default" className="bg-green-100 text-green-800">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Sent
                              </Badge>
                            ) : (
                              <Badge variant="destructive">
                                <XCircle className="h-3 w-3 mr-1" />
                                {br.error || 'Failed'}
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Payload Preview */}
                  {testResult.payload && (
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Payload Preview</Label>
                      <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-48">
                        {JSON.stringify(testResult.payload, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsTestDialogOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </PageContainer>
    </RouteGuard>
  )
}
