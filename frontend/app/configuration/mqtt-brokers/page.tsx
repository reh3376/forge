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
import { PageContainer } from '@/components/ui/layout'
import { RouteGuard } from '@/components/auth/route-guard'
import { ManufacturingPermission } from '@/lib/auth-config'
import { useJWTAuth } from '@/hooks/useJWTAuth'
import { useAuth } from '@/lib/auth-context'
import { UnifiedGraphQLClient } from '@/lib/api/unified-graphql-client'
import { 
  GET_UNS_BROKER_CONFIGURATIONS,
  CREATE_UNS_BROKER_CONFIGURATION,
  UPDATE_UNS_BROKER_CONFIGURATION,
  DELETE_UNS_BROKER_CONFIGURATION,
  type UnsBrokerConfiguration,
  type UnsBrokerConfigurationCreateInput,
  type UnsBrokerConfigurationUpdateInput,
  type GetUnsBrokerConfigurationsResult,
  type CreateUnsBrokerConfigurationResult,
  type UpdateUnsBrokerConfigurationResult,
  type DeleteUnsBrokerConfigurationResult
} from '@/lib/api/graphql/mqtt-brokers'
import { restApi } from '@/lib/api/rest-client'
import { useMqttSocket, type MqttStatusUpdate, type MqttConnectionStatus } from '@/lib/websocket/mqtt-socket-client'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Plus,
  Edit,
  Trash2,
  Radio,
  RefreshCw,
  XCircle,
  Shield,
  AlertTriangle,
  CheckCircle,
  RotateCcw,
  LogIn,
  Wifi,
  WifiOff
} from 'lucide-react'

// Create the GraphQL client instance with JWT authentication
const graphqlClient = new UnifiedGraphQLClient({
  useJWTAuth: true,
  enableRetry: true,
})

// Types for certificate management
interface CertificateStatus {
  brokerId: string
  certificateType: 'client' | 'ca'
  rotationStatus: 'healthy' | 'warning' | 'critical' | 'failed'
  daysUntilExpiry: number
  lastRotation: string | null
  nextRotation: string | null
  errorMessage?: string
}

interface CertificateHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  totalCertificates: number
  healthyCertificates: number
  warningCertificates: number
  criticalCertificates: number
  failedCertificates: number
  lastCheck: string
}

interface BrokerFormData {
  host: string
  port: number
  protocol: string
  username: string
  password: string
  tls: boolean
  validateCertificate: boolean
  baseTopicPath: string
  subscriptions: string
}

// Interface for broker status from REST API
interface BrokerStatusData {
  brokerId: string
  connected: boolean
  brokerConfig?: {
    host: string
    port: number
    protocol: string
    tls: boolean
  }
}

const defaultFormData: BrokerFormData = {
  host: '',
  port: 1883,
  protocol: 'mqtt://',
  username: '',
  password: '',
  tls: false,
  validateCertificate: false,
  baseTopicPath: '#',
  subscriptions: '[]'
}

export default function MqttBrokersPage() {
  const [isClient, setIsClient] = useState(false)
  const { user, isAuthenticated } = useJWTAuth()
  const { isAuthenticated: isAuthContextAuthenticated } = useAuth()
  const [brokers, setBrokers] = useState<UnsBrokerConfiguration[]>([])
  const [connectionStatuses, setConnectionStatuses] = useState<Map<string, MqttConnectionStatus>>(new Map())
  const [certificateStatuses, setCertificateStatuses] = useState<CertificateStatus[]>([])
  const [certificateHealth, setCertificateHealth] = useState<CertificateHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingBroker, setEditingBroker] = useState<UnsBrokerConfiguration | null>(null)
  const [formData, setFormData] = useState<BrokerFormData>(defaultFormData)
  const [submitting, setSubmitting] = useState(false)

  // Initialize WebSocket for real-time connection status updates
  const mqttSocket = useMqttSocket()

  // Check if user is authenticated (either JWT or auth context)
  const isUserAuthenticated = isAuthenticated || isAuthContextAuthenticated

  useEffect(() => {
    setIsClient(true)
  }, [])

  const fetchBrokers = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const result = await graphqlClient.query<GetUnsBrokerConfigurationsResult>(
        GET_UNS_BROKER_CONFIGURATIONS,
        {
          fetchPolicy: 'network-only' // Force fresh data
        }
      )
      
      setBrokers(result.unsBrokerConfigurations || [])
      console.log('✅ Successfully fetched MQTT brokers:', result.unsBrokerConfigurations?.length || 0)
      
    } catch (error) {
      console.error('Failed to fetch MQTT brokers:', error)
      setError('Unable to fetch MQTT broker configurations. Check your authentication and backend connection.')
      setBrokers([])
    } finally {
      setLoading(false)
    }
  }

  // Fetch real MQTT connection status using REST API
  const fetchConnectionStatus = async () => {
    try {
      const response = await restApi.mqttBrokers.getConnectionStatus()
      const statusData = response.data.data
      
      if (statusData && statusData.brokerStatuses) {
        const statusMap = new Map<string, MqttConnectionStatus>()
        statusData.brokerStatuses.forEach((status: BrokerStatusData) => {
          statusMap.set(status.brokerId, {
            brokerId: status.brokerId,
            connected: status.connected,
            ...(status.brokerConfig && { brokerConfig: status.brokerConfig })
          })
        })
        setConnectionStatuses(statusMap)
        console.log('✅ Successfully fetched MQTT connection statuses:', statusMap.size)
      }
    } catch (error) {
      console.warn('⚠️ Failed to fetch MQTT connection status:', error)
      // Don't set error state - connection status is optional
    }
  }

  const fetchCertificateStatuses = async () => {
    try {
      // Mock certificate data for now - replace with actual API call
      const mockCertificates: CertificateStatus[] = []
      setCertificateStatuses(mockCertificates)
      
      // Mock certificate health
      const mockHealth: CertificateHealth = {
        status: 'healthy',
        totalCertificates: 0,
        healthyCertificates: 0,
        warningCertificates: 0,
        criticalCertificates: 0,
        failedCertificates: 0,
        lastCheck: new Date().toISOString()
      }
      setCertificateHealth(mockHealth)
    } catch (error) {
      console.error('Failed to fetch certificate statuses:', error)
    }
  }

  const handleCertificateRotation = async (brokerId: string, certificateType: 'client' | 'ca') => {
    try {
      // Mock certificate rotation - replace with actual API call
      toast.success(`${certificateType} certificate rotation initiated for broker ${brokerId}`)
      await fetchCertificateStatuses()
    } catch (error) {
      console.error('Failed to rotate certificate:', error)
      toast.error('Failed to rotate certificate')
    }
  }

  const handleTestConnection = async (brokerIdParam: string) => {
    try {
      // Mock connection test - replace with actual API call
      toast.success(`Connection test initiated for broker ${brokerIdParam}`)
    } catch (error) {
      console.error('Failed to test connection:', error)
      toast.error('Failed to test connection')
    }
  }

  const handleLogin = () => {
    // Redirect to login or show login modal
    window.location.href = '/auth-demo'
  }

  // Handle real-time MQTT status updates
  const handleMqttStatusUpdate = (statusUpdate: MqttStatusUpdate) => {
    console.log('📊 Received real-time MQTT status update:', statusUpdate)
    
    const statusMap = new Map<string, MqttConnectionStatus>()
    statusUpdate.brokers.forEach(broker => {
      statusMap.set(broker.brokerId, broker)
    })
    setConnectionStatuses(statusMap)
  }

  // Setup WebSocket connection and listeners
  useEffect(() => {
    let unsubscribeStatus: (() => void) | undefined

    const setupWebSocket = async () => {
      try {
        await mqttSocket.connect()
        
        // Subscribe to status updates
        unsubscribeStatus = mqttSocket.onStatusUpdate(handleMqttStatusUpdate)
        
        // Request initial status
        mqttSocket.requestStatus()
        
        console.log('✅ MQTT WebSocket connected and listening for status updates')
      } catch (error) {
        console.warn('⚠️ Failed to connect to MQTT WebSocket:', error)
        // Continue without WebSocket - we'll still have REST API data
      }
    }

    if (isClient) {
      setupWebSocket()
    }

    return () => {
      if (unsubscribeStatus) {
        unsubscribeStatus()
      }
      mqttSocket.disconnect()
    }
  }, [isClient])

  useEffect(() => {
    async function fetchData() {
      if (isUserAuthenticated) {
        await fetchBrokers()
        await fetchConnectionStatus()
        await fetchCertificateStatuses()
      }
    }

    if (isClient) {
      fetchData()
    }
  }, [isClient, isUserAuthenticated])

  const handleCreateBroker = () => {
    setEditingBroker(null)
    setFormData(defaultFormData)
    setIsDialogOpen(true)
  }

  const handleEditBroker = (broker: UnsBrokerConfiguration) => {
    setEditingBroker(broker)
    setFormData({
      host: broker.host,
      port: broker.port || 1883,
      protocol: broker.protocol || 'mqtt://',
      username: broker.username || '',
      password: '', // Don't populate password for security
      tls: broker.tls || false,
      validateCertificate: broker.validateCertificate || false,
      baseTopicPath: broker.baseTopicPath || '#',
      subscriptions: JSON.stringify(broker.subscriptions || [], null, 2)
    })
    setIsDialogOpen(true)
  }

  const handleDeleteBroker = async (brokerId: string) => {
    if (!confirm('Are you sure you want to delete this MQTT broker configuration?')) {
      return
    }

    try {
      await graphqlClient.mutate<DeleteUnsBrokerConfigurationResult>(
        DELETE_UNS_BROKER_CONFIGURATION,
        {
          variables: { where: { id: brokerId } },
          refetchQueries: [{ query: GET_UNS_BROKER_CONFIGURATIONS }]
        }
      )
      
      await fetchBrokers() // Refresh the list
      toast.success('MQTT broker configuration deleted successfully')
    } catch (error) {
      console.error('Failed to delete broker:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to delete MQTT broker configuration')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      let subscriptions
      try {
        subscriptions = JSON.parse(formData.subscriptions)
      } catch {
        throw new Error('Invalid JSON in subscriptions field')
      }

      // Get current user for createdBy/updatedBy fields
      const userId = user?.username || user?.id || 'system'

      if (editingBroker) {
        const updateData: UnsBrokerConfigurationUpdateInput = {
          host: formData.host,
          port: formData.port,
          protocol: formData.protocol,
          username: formData.username || null,
          password: formData.password || null,
          tls: formData.tls,
          validateCertificate: formData.validateCertificate,
          baseTopicPath: formData.baseTopicPath || null,
          subscriptions,
          updatedBy: userId,
        }

        await graphqlClient.mutate<UpdateUnsBrokerConfigurationResult>(
          UPDATE_UNS_BROKER_CONFIGURATION,
          {
            variables: { where: { id: editingBroker.id }, data: updateData },
            refetchQueries: [{ query: GET_UNS_BROKER_CONFIGURATIONS }]
          }
        )
        
        toast.success('MQTT broker configuration updated successfully')
      } else {
        const createData: UnsBrokerConfigurationCreateInput = {
          host: formData.host,
          port: formData.port,
          protocol: formData.protocol,
          username: formData.username || null,
          password: formData.password || null,
          tls: formData.tls,
          validateCertificate: formData.validateCertificate,
          baseTopicPath: formData.baseTopicPath || null,
          subscriptions,
          createdBy: userId,
          updatedBy: userId,
        }

        await graphqlClient.mutate<CreateUnsBrokerConfigurationResult>(
          CREATE_UNS_BROKER_CONFIGURATION,
          {
            variables: { data: createData },
            refetchQueries: [{ query: GET_UNS_BROKER_CONFIGURATIONS }]
          }
        )
        
        toast.success('MQTT broker configuration created successfully')
      }

      setIsDialogOpen(false)
      setFormData(defaultFormData)
      await fetchBrokers() // Refresh the list
      await fetchConnectionStatus() // Refresh connection status
      await fetchCertificateStatuses() // Refresh certificate data
    } catch (error) {
      console.error('Failed to save broker:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save MQTT broker configuration')
    } finally {
      setSubmitting(false)
    }
  }

  // Helper function to get certificate status for a broker
  const getBrokerCertificateStatus = (brokerId: string) => {
    return certificateStatuses.filter(cert => cert.brokerId === brokerId)
  }

  // Helper function to get certificate status badge
  const getCertificateStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return (
          <Badge variant="default" className="bg-green-100 text-green-800">
            <Shield className="h-3 w-3 mr-1" />
            Healthy
          </Badge>
        )
      case 'warning':
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Warning
          </Badge>
        )
      case 'critical':
        return (
          <Badge variant="destructive" className="bg-red-100 text-red-800">
            <Shield className="h-3 w-3 mr-1" />
            Critical
          </Badge>
        )
      case 'failed':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        )
      default:
        return (
          <Badge variant="outline">
            <Shield className="h-3 w-3 mr-1" />
            Unknown
          </Badge>
        )
    }
  }

  // Helper function to get connection status badge
  const getConnectionStatusBadge = (brokerId: string) => {
    const status = connectionStatuses.get(brokerId)
    
    if (status === undefined) {
      return (
        <Badge variant="outline">
          <Radio className="h-3 w-3 mr-1" />
          Unknown
        </Badge>
      )
    }
    
    if (status.connected) {
      return (
        <Badge variant="default" className="bg-green-100 text-green-800">
          <Wifi className="h-3 w-3 mr-1" />
          Connected
        </Badge>
      )
    } else {
      return (
        <Badge variant="secondary" className="bg-red-100 text-red-800">
          <WifiOff className="h-3 w-3 mr-1" />
          Disconnected
        </Badge>
      )
    }
  }

  const handleRefreshData = async () => {
    await fetchBrokers()
    await fetchConnectionStatus()
    await fetchCertificateStatuses()
    // Also request fresh status from WebSocket
    mqttSocket.requestStatus()
    toast.success('Data refreshed successfully')
  }

  // Add this debug function after the fetchBrokers function
  const debugBrokerIds = () => {
    console.log('🔍 Current brokers in state:', brokers.map(b => ({ id: b.id, host: b.host })));
    console.log('🔍 Connection statuses:', Array.from(connectionStatuses.entries()));
  }

  const forceBrokerRefresh = async () => {
    console.log('🔄 Forcing broker refresh...');
    setBrokers([]);
    setConnectionStatuses(new Map());
    await fetchBrokers();
    await fetchConnectionStatus();
    debugBrokerIds();
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
                  <Radio className="h-6 w-6" />
                  MQTT Brokers
                </h1>
                <p className="text-muted-foreground">
                  Manage MQTT broker configurations for UNS data integration
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleRefreshData} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              {/* Debug button for troubleshooting broker IDs */}
              <Button variant="outline" onClick={forceBrokerRefresh}>
                🔍 Debug Brokers
              </Button>
              {isUserAuthenticated ? (
                <Button onClick={handleCreateBroker}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Broker
                </Button>
              ) : (
                <Button onClick={handleLogin}>
                  <LogIn className="h-4 w-4 mr-2" />
                  Login to Manage
                </Button>
              )}
            </div>
          </div>

          {/* Certificate Health Overview */}
          {certificateHealth && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Certificate Health Overview
                </CardTitle>
                <CardDescription>
                  Overall status of MQTT broker certificates
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {certificateHealth.healthyCertificates}
                    </div>
                    <div className="text-sm text-muted-foreground">Healthy</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">
                      {certificateHealth.warningCertificates}
                    </div>
                    <div className="text-sm text-muted-foreground">Warning</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {certificateHealth.criticalCertificates}
                    </div>
                    <div className="text-sm text-muted-foreground">Critical</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-600">
                      {certificateHealth.failedCertificates}
                    </div>
                    <div className="text-sm text-muted-foreground">Failed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {certificateHealth.totalCertificates}
                    </div>
                    <div className="text-sm text-muted-foreground">Total</div>
                  </div>
                </div>
                <div className="mt-4 text-sm text-muted-foreground">
                  Last checked: {new Date(certificateHealth.lastCheck).toLocaleString()}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error State */}
          {error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-red-800">
                  <XCircle className="h-5 w-5" />
                  <span className="font-medium">Error loading MQTT brokers</span>
                </div>
                <p className="text-red-700 mt-2">{error}</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={fetchBrokers}
                  className="mt-3"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              </CardContent>
            </Card>
          )}

          {/* MQTT Brokers List */}
          <Card>
            <CardHeader>
              <CardTitle>MQTT Broker Configurations</CardTitle>
              <CardDescription>
                Configure MQTT brokers for data integration with the Unified Namespace (UNS)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                  Loading MQTT brokers...
                </div>
              ) : brokers.length === 0 ? (
                <div className="text-center py-8">
                  <Radio className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No MQTT brokers configured</h3>
                  <p className="text-muted-foreground mb-4">
                    Get started by adding your first MQTT broker configuration.
                  </p>
                  {isUserAuthenticated && (
                    <Button onClick={handleCreateBroker}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Your First Broker
                    </Button>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Host</TableHead>
                      <TableHead>Port</TableHead>
                      <TableHead>Protocol</TableHead>
                      <TableHead>TLS</TableHead>
                      <TableHead>Connection Status</TableHead>
                      <TableHead>Base Topic</TableHead>
                      <TableHead>Certificate Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {brokers.map((broker) => {
                      const certStatuses = getBrokerCertificateStatus(broker.id)
                      return (
                        <TableRow key={broker.id}>
                          <TableCell className="font-medium">{broker.host}</TableCell>
                          <TableCell>{broker.port || 1883}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {broker.protocol || 'mqtt://'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {broker.tls ? (
                              <Badge variant="default" className="bg-green-100 text-green-800">
                                <Shield className="h-3 w-3 mr-1" />
                                Enabled
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                Disabled
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {getConnectionStatusBadge(broker.id)}
                          </TableCell>
                          <TableCell>
                            <code className="text-sm bg-muted px-2 py-1 rounded">
                              {broker.baseTopicPath || '#'}
                            </code>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {certStatuses.length > 0 ? (
                                certStatuses.map((cert) => (
                                  <div key={`${cert.brokerId}-${cert.certificateType}`} className="flex items-center gap-2">
                                    {getCertificateStatusBadge(cert.rotationStatus)}
                                    <span className="text-xs text-muted-foreground">
                                      {cert.certificateType}
                                    </span>
                                    {cert.rotationStatus !== 'healthy' && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleCertificateRotation(broker.id, cert.certificateType)}
                                        className="h-6 px-2"
                                      >
                                        <RotateCcw className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                ))
                              ) : (
                                <Badge variant="outline">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  No certificates
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleTestConnection(broker.id)}
                              >
                                <Radio className="h-4 w-4" />
                              </Button>
                              {isUserAuthenticated && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleEditBroker(broker)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDeleteBroker(broker.id)}
                                    className="text-red-600 hover:text-red-700"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Create/Edit Broker Dialog */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingBroker ? 'Edit MQTT Broker' : 'Add MQTT Broker'}
                </DialogTitle>
                <DialogDescription>
                  Configure the MQTT broker connection settings for UNS data integration.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="host">Host *</Label>
                    <Input
                      id="host"
                      value={formData.host}
                      onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                      placeholder="mqtt.example.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="port">Port</Label>
                    <Input
                      id="port"
                      type="number"
                      value={formData.port}
                      onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 1883 })}
                      placeholder="1883"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="protocol">Protocol</Label>
                    <Input
                      id="protocol"
                      value={formData.protocol}
                      onChange={(e) => setFormData({ ...formData, protocol: e.target.value })}
                      placeholder="mqtt://"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder={editingBroker ? "Leave blank to keep current password" : "Optional"}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="baseTopicPath">Base Topic Path</Label>
                  <Input
                    id="baseTopicPath"
                    value={formData.baseTopicPath}
                    onChange={(e) => setFormData({ ...formData, baseTopicPath: e.target.value })}
                    placeholder="#"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subscriptions">Subscriptions (JSON)</Label>
                  <Textarea
                    id="subscriptions"
                    value={formData.subscriptions}
                    onChange={(e) => setFormData({ ...formData, subscriptions: e.target.value })}
                    placeholder='["topic1", "topic2"]'
                    rows={3}
                  />
                </div>

                <div className="flex items-center space-x-6">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="tls"
                      checked={formData.tls}
                      onCheckedChange={(checked) => setFormData({ ...formData, tls: checked })}
                    />
                    <Label htmlFor="tls">Enable TLS</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="validateCertificate"
                      checked={formData.validateCertificate}
                      onCheckedChange={(checked) => setFormData({ ...formData, validateCertificate: checked })}
                    />
                    <Label htmlFor="validateCertificate">Validate Certificate</Label>
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        {editingBroker ? 'Updating...' : 'Creating...'}
                      </>
                    ) : (
                      editingBroker ? 'Update Broker' : 'Create Broker'
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </PageContainer>
    </RouteGuard>
  )
} 