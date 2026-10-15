'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Shield,
  Radio,
  AlertTriangle,
  Building2,
  Package,
  Settings,
  Ruler,
  Activity,
  Calculator,
  FlaskConical,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Wheat,
  FunctionSquare,
  Send,
  BarChart3
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageContainer } from '@/components/ui/layout'
import { RouteGuard } from '@/components/auth/route-guard'
import { ManufacturingPermission } from '@/lib/auth-config'
import { UnifiedGraphQLClient } from '@/lib/api/unified-graphql-client'
import { 
  GET_UNS_BROKER_CONFIGURATIONS,
  type GetUnsBrokerConfigurationsResult
} from '@/lib/api/graphql/mqtt-brokers'
import { restApi } from '@/lib/api/rest-client'
import { useMqttSocket, type MqttStatusUpdate } from '@/lib/websocket/mqtt-socket-client'
import { recipeParameterClient } from '@/lib/api/recipe-parameter-client'
import { useMillingBinConfigurations } from '@/hooks/use-milling-bin-configurations'
import { useEntraIntegration } from '@/hooks/use-entra-integration'

// Create the GraphQL client instance with JWT authentication
const graphqlClient = new UnifiedGraphQLClient({
  useJWTAuth: true,
  enableRetry: true,
})

// Types for MQTT data
interface MqttConnectionStatus {
  isConnected: boolean
  connectedBrokers: number
  totalBrokers: number
  lastUpdate: string
  brokerStatuses?: Array<{
    brokerId: string
    connected: boolean
    host?: string
    port?: number
  }>
}

// Types for Recipe Parameters data
interface RecipeParametersData {
  totalParameters: number
  activeParameters: number
  loading: boolean
  error: string | null
}

// Types for Units data
interface UnitsData {
  totalUnits: number
  activeUnits: number
  loading: boolean
  error: string | null
}

interface TemplateCount {
  total: number
  active: number
}

export default function ConfigurationPage() {
  const [mqttData, setMqttData] = useState<{
    brokers: Array<{
      id: string
      name: string
      host: string
      port: number
      isConnected?: boolean
    }>
    connectionStatus: MqttConnectionStatus
    loading: boolean
    error: string | null
  }>({
    brokers: [],
    connectionStatus: {
      isConnected: false,
      connectedBrokers: 0,
      totalBrokers: 0,
      lastUpdate: new Date().toISOString()
    },
    loading: true,
    error: null
  })

  const [recipeParametersData, setRecipeParametersData] = useState<RecipeParametersData>({
    totalParameters: 0,
    activeParameters: 0,
    loading: true,
    error: null
  })

  const [unitsData, setUnitsData] = useState<UnitsData>({
    totalUnits: 0,
    activeUnits: 0,
    loading: true,
    error: null
  })

  const [templateCount, setTemplateCount] = useState<TemplateCount>({
    total: 0,
    active: 0
  })

  // Add Entra integration hook
  const entraData = useEntraIntegration()

  // Add bin configuration hook
  const {
    configurations: binConfigurations,
    availableAssets,
    loading: binConfigLoading
  } = useMillingBinConfigurations()

  // Initialize WebSocket for real-time updates
  const mqttSocket = useMqttSocket()

  // Fetch MQTT broker configurations using GraphQL
  const fetchBrokerConfigurations = async () => {
    try {
      const result = await graphqlClient.query<GetUnsBrokerConfigurationsResult>(
        GET_UNS_BROKER_CONFIGURATIONS,
        {
          fetchPolicy: 'network-only' // Force fresh data
        }
      )
      
      return result.unsBrokerConfigurations || []
    } catch (error) {
      console.error('Failed to fetch MQTT broker configurations:', error)
      throw error
    }
  }

  // Fetch real MQTT connection status using REST API
  const fetchConnectionStatus = async () => {
    try {
      const response = await restApi.mqttBrokers.getConnectionStatus()
      return response.data.data as MqttConnectionStatus
    } catch (error) {
      console.error('Failed to fetch MQTT connection status:', error)
      // Return null to indicate connection status unavailable
      return null
    }
  }

  // Fetch recipe parameters data
  const fetchRecipeParametersData = async () => {
    try {
      setRecipeParametersData(prev => ({ ...prev, loading: true, error: null }))
      
      // Fetch all recipe parameters (master records only)
      const result = await recipeParameterClient.getRecipeParameters(
        { skip: 0, take: 1000 }, // Get a large number to count all
        {} // No additional filters, will use default isClassDefinition: true
      )
      
      const totalParameters = result.totalCount
      const activeParameters = result.recipeParameters.filter(param => param.active).length
      
      setRecipeParametersData({
        totalParameters,
        activeParameters,
        loading: false,
        error: null
      })
    } catch (error) {
      console.error('Failed to fetch recipe parameters data:', error)
      setRecipeParametersData(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to load recipe parameters data'
      }))
    }
  }

  // Fetch units data
  const fetchUnitsData = async () => {
    try {
      setUnitsData(prev => ({ ...prev, loading: true, error: null }))
      
      // GraphQL query to fetch units
      const UNITS_QUERY = `
        query GetUnits {
          unitsItems {
            id
            name
            active
            archived
          }
        }
      `
      
      // GraphQL request function
      const graphqlRequest = async (query: string) => {
        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query }),
        })

        const result = await response.json()
        
        if (result.errors) {
          throw new Error(result.errors[0]?.message || 'GraphQL error')
        }

        return result.data
      }
      
      const result = await graphqlRequest(UNITS_QUERY)
      const units = result.unitsItems || []
      
      const totalUnits = units.length
      const activeUnits = units.filter((unit: { active?: boolean; archived?: boolean }) => 
        unit.active && !unit.archived
      ).length
      
      setUnitsData({
        totalUnits,
        activeUnits,
        loading: false,
        error: null
      })
    } catch (error) {
      console.error('Failed to fetch units data:', error)
      setUnitsData(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to load units data'
      }))
    }
  }

  // Fetch all MQTT data
  const fetchMqttData = async () => {
    try {
      setMqttData(prev => ({ ...prev, loading: true, error: null }))
      
      // Fetch both broker configurations and connection status in parallel
      const [brokers, connectionStatus] = await Promise.allSettled([
        fetchBrokerConfigurations(),
        fetchConnectionStatus()
      ])
      
      const brokerConfigs = brokers.status === 'fulfilled' ? brokers.value : []
      const realConnectionStatus = connectionStatus.status === 'fulfilled' ? connectionStatus.value : null
      
      // If we have broker configs but no real connection status, create a fallback
      const finalConnectionStatus: MqttConnectionStatus = realConnectionStatus || {
        isConnected: brokerConfigs.length > 0,
        connectedBrokers: 0, // Unknown without real status
        totalBrokers: brokerConfigs.length,
        lastUpdate: new Date().toISOString(),
        brokerStatuses: []
      }

      setMqttData({
        brokers: brokerConfigs.map(broker => ({
          id: broker.id,
          name: `${broker.host}:${broker.port}`, // Create name from host:port
          host: broker.host || '',
          port: broker.port || 0,
          isConnected: false // Default to false, will be updated by connection status
        })),
        connectionStatus: finalConnectionStatus,
        loading: false,
        error: brokers.status === 'rejected' ? 'Unable to fetch MQTT broker configurations' : null
      })
      
      console.log('✅ Successfully fetched MQTT data for configuration page:', {
        brokers: brokerConfigs.length,
        connected: finalConnectionStatus.connectedBrokers,
        total: finalConnectionStatus.totalBrokers
      })
      
    } catch (error) {
      console.error('Failed to fetch MQTT data:', error)
      setMqttData(prev => ({
        ...prev,
        loading: false,
        error: 'Unable to fetch MQTT data. Check your authentication and backend connection.'
      }))
    }
  }

  // Handle real-time MQTT status updates
  const handleMqttStatusUpdate = (statusUpdate: MqttStatusUpdate) => {
    console.log('📊 Received real-time MQTT status update:', statusUpdate)
    
    setMqttData(prev => {
      if (!prev.connectionStatus) return prev
      
      const connectedCount = statusUpdate.brokers.filter(b => b.connected).length
      const totalCount = statusUpdate.brokers.length
      
      return {
        ...prev,
        connectionStatus: {
          ...prev.connectionStatus,
          connectedBrokers: connectedCount,
          totalBrokers: Math.max(totalCount, prev.brokers.length), // Use max of configured vs reported
          isConnected: connectedCount > 0,
          lastUpdate: statusUpdate.timestamp,
          brokerStatuses: statusUpdate.brokers.map(b => ({
            brokerId: b.brokerId,
            connected: b.connected,
            ...(b.brokerConfig?.host && { host: b.brokerConfig.host }),
            ...(b.brokerConfig?.port && { port: b.brokerConfig.port })
          }))
        }
      }
    })
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

    setupWebSocket()

    return () => {
      if (unsubscribeStatus) {
        unsubscribeStatus()
      }
      mqttSocket.disconnect()
    }
  }, [])

  // Initial data fetch
  useEffect(() => {
    fetchMqttData()
    fetchRecipeParametersData()
    fetchUnitsData()
  }, [])

  // Calculate MQTT metrics for display
  const mqttMetrics = {
    connectedBrokers: mqttData.connectionStatus?.connectedBrokers ?? 0,
    totalBrokers: Math.max(
      mqttData.connectionStatus?.totalBrokers ?? 0,
      mqttData.brokers.length
    ),
    isConnected: (mqttData.connectionStatus?.connectedBrokers ?? 0) > 0,
    hasError: !!mqttData.error,
    lastUpdate: mqttData.connectionStatus?.lastUpdate
  }

  useEffect(() => {
    const fetchTemplateCount = async () => {
      try {
        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query GetTemplateCount {
                mashingProtocols(where: { isTemplate: { equals: true } }) {
                  id
                  isTemplate
                }
              }
            `
          })
        })
        const data = await response.json()
        const templates = data.data?.mashingProtocols || []
        setTemplateCount({
          total: templates.length,
          active: templates.length
        })
      } catch (error) {
        console.error('Error fetching template count:', error)
      }
    }

    fetchTemplateCount()
  }, [])

  return (
    <RouteGuard 
      config={{
        requiresAuth: true,
        requiredPermissions: [ManufacturingPermission.SYSTEM_SETTINGS]
      }}
    >
      <PageContainer>
        <div className="space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold tracking-tight">System Configuration</h1>
            <p className="text-muted-foreground">
              Manage system settings, integrations, and configurations
            </p>
          </div>

          {/* Recipe & Production */}
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Recipe & Production</h2>
              <p className="text-sm text-muted-foreground">Recipe parameters, grain characters, formulas, and production metrics</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Recipe Parameters */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Recipe Parameters
                  </CardTitle>
                  <CardDescription>
                    Configure master recipe parameters and setpoints
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {recipeParametersData.loading ? (
                      <div className="text-center py-4">
                        <span className="text-sm text-muted-foreground">Loading...</span>
                      </div>
                    ) : recipeParametersData.error ? (
                      <div className="text-center py-4">
                        <span className="text-sm text-destructive">{recipeParametersData.error}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <span className="text-sm">Total Parameters:</span>
                          <span className="font-medium">{recipeParametersData.totalParameters}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Active Parameters:</span>
                          <Badge variant="default" className="bg-green-100 text-green-800">
                            {recipeParametersData.activeParameters}
                          </Badge>
                        </div>
                      </>
                    )}
                    <Link href="/configuration/recipe-parameters">
                      <Button variant="outline" size="sm" className="w-full">
                        Manage Recipe Parameters
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* Mashing Step Parameters */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FlaskConical className="h-5 w-5" />
                    Mashing Step Parameters
                  </CardTitle>
                  <CardDescription>
                    Configure parameter definitions for each mashing step type
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">
                      Define what parameters operators record during mashing execution
                      (temperature, duration, grain quantity, etc.)
                    </div>
                    <Link href="/configuration/mashing-step-parameters">
                      <Button variant="outline" size="sm" className="w-full">
                        Manage Mashing Parameters
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* Grain Characters */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wheat className="h-5 w-5" />
                    Grain Characters
                  </CardTitle>
                  <CardDescription>
                    Configure grain character abbreviations for mashbill recipes
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">
                      Manage grain types (C, R, W, M) and varieties used in recipe mashbills
                    </div>
                    <Link href="/configuration/grain-characters">
                      <Button variant="outline" size="sm" className="w-full">
                        Manage Grain Characters
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* Mashing Protocol Templates */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FlaskConical className="h-5 w-5" />
                    Mashing Protocol Templates
                  </CardTitle>
                  <CardDescription>
                    Manage and configure mashing protocol templates
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm">Available Templates:</span>
                      <span className="font-medium">{templateCount.active} / {templateCount.total}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Template Management:</span>
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        Active
                      </Badge>
                    </div>
                    <Link href="/configuration/mashing-protocol-templates">
                      <Button variant="outline" size="sm" className="w-full">
                        Manage Templates
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* Enzyme Dosing Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="h-5 w-5" />
                    Enzyme Dosing
                  </CardTitle>
                  <CardDescription>
                    Calculate enzyme dosing amounts and manage configurations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm">Available Enzymes:</span>
                      <span className="font-medium">--</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Calculator Status:</span>
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        Active
                      </Badge>
                    </div>
                    <Link href="/configuration/enzyme-dosing">
                      <Button variant="outline" size="sm" className="w-full">
                        Enzyme Calculator
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* Formula Library */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FunctionSquare className="h-5 w-5" />
                    Formula Library
                  </CardTitle>
                  <CardDescription>
                    Create and manage BOM calculation formulas
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">
                      Define reusable formulas for calculating BOM quantities based on grain load, water load, and mash bill
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Formula Engine:</span>
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        Active
                      </Badge>
                    </div>
                    <Link href="/configuration/formula-library">
                      <Button variant="outline" size="sm" className="w-full">
                        Manage Formulas
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* Production Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Production Metrics
                  </CardTitle>
                  <CardDescription>
                    Yield rates, equipment parameters, and production constants
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm">Bourbon Yield:</span>
                      <span className="font-medium">5.2 PG/GU</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Whiskey Yield:</span>
                      <span className="font-medium">4.9 PG/GU</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Cooks/Fermenter:</span>
                      <span className="font-medium">3</span>
                    </div>
                    <Link href="/configuration/production-metrics">
                      <Button variant="outline" size="sm" className="w-full">
                        Manage Metrics
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Equipment & Integration */}
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Equipment & Integration</h2>
              <p className="text-sm text-muted-foreground">Assets, bins, and measurement units</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Asset Management */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Asset Management
                  </CardTitle>
                  <CardDescription>
                    Configure production assets and equipment
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm">Total Assets:</span>
                      <span className="font-medium">45</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Active Assets:</span>
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        42
                      </Badge>
                    </div>
                    <Link href="/configuration/assets">
                      <Button variant="outline" size="sm" className="w-full">
                        Manage Assets
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* Bin Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Bin Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure bin-to-item group mappings for production orders
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {binConfigLoading ? (
                      <div className="text-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                        <span className="text-sm text-muted-foreground">Loading...</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <span className="text-sm">Configured Bins:</span>
                          <span className="font-medium">{binConfigurations.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Available Assets:</span>
                          <Badge variant="secondary">
                            {availableAssets.length}
                          </Badge>
                        </div>
                      </>
                    )}
                    <Link href="/configuration/bin-configurations">
                      <Button variant="outline" size="sm" className="w-full">
                        Manage Bin Configurations
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* Units Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Ruler className="h-5 w-5" />
                    Units Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure measurement units and conversion factors
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {unitsData.loading ? (
                      <div className="text-center py-4">
                        <span className="text-sm text-muted-foreground">Loading...</span>
                      </div>
                    ) : unitsData.error ? (
                      <div className="text-center py-4">
                        <span className="text-sm text-destructive">{unitsData.error}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <span className="text-sm">Configured Units:</span>
                          <span className="font-medium">{unitsData.totalUnits}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Active Units:</span>
                          <Badge variant="default" className="bg-green-100 text-green-800">
                            {unitsData.activeUnits}
                          </Badge>
                        </div>
                      </>
                    )}
                    <Link href="/configuration/units">
                      <Button variant="outline" size="sm" className="w-full">
                        Manage Units
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Security & Administration */}
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Security & Administration</h2>
              <p className="text-sm text-muted-foreground">Authentication, MQTT, alerts, and audit logging</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Entra Integration */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Entra Integration
                  </CardTitle>
                  <CardDescription>
                    Microsoft Entra ID authentication and user management
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {entraData.loading ? (
                      <div className="text-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                        <span className="text-sm text-muted-foreground">Loading...</span>
                      </div>
                    ) : entraData.error ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-destructive" />
                          <span className="text-sm font-medium text-destructive">Disconnected</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{entraData.error}</div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 mb-3">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-medium text-green-600">Connected</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Total Users:</span>
                          <span className="font-medium">{entraData.totalUsers}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Active Users:</span>
                          <Badge variant="default" className="bg-green-100 text-green-800">
                            {entraData.activeUsers}
                          </Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Admin Users:</span>
                          <span className="font-medium">{entraData.adminUsers}</span>
                        </div>
                        {entraData.lastSync && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            Last sync: {new Date(entraData.lastSync).toLocaleTimeString()}
                          </div>
                        )}
                      </>
                    )}
                    <Link href="/diagnostics/role-debug">
                      <Button variant="outline" size="sm" className="w-full">
                        View User Roles
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* Security Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Security & Authentication
                  </CardTitle>
                  <CardDescription>
                    Configure authentication and security policies
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm">Auth Provider:</span>
                      <span className="text-sm font-medium">Microsoft Entra ID</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">2FA Enabled:</span>
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        Yes
                      </Badge>
                    </div>
                    <Button variant="outline" size="sm" className="w-full">
                      Security Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* MQTT Broker Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Radio className="h-5 w-5" />
                    MQTT Broker Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure MQTT brokers for UNS data integration
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm">Connected Brokers:</span>
                      {mqttData.loading ? (
                        <div className="h-4 w-12 bg-muted animate-pulse rounded" />
                      ) : mqttData.error ? (
                        <span className="text-sm text-muted-foreground">--</span>
                      ) : (
                        <span className="font-medium">
                          {mqttMetrics.connectedBrokers} / {mqttMetrics.totalBrokers}
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Connection Status:</span>
                      {mqttData.loading ? (
                        <div className="h-5 w-16 bg-muted animate-pulse rounded" />
                      ) : mqttData.error ? (
                        <Badge variant="destructive">
                          Error
                        </Badge>
                      ) : mqttMetrics.isConnected ? (
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          Connected
                        </Badge>
                      ) : mqttMetrics.totalBrokers > 0 ? (
                        <Badge variant="secondary">
                          Disconnected
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          No Brokers
                        </Badge>
                      )}
                    </div>
                    {mqttMetrics.lastUpdate && !mqttData.loading && (
                      <div className="text-xs text-muted-foreground">
                        Last updated: {new Date(mqttMetrics.lastUpdate).toLocaleTimeString()}
                      </div>
                    )}
                    {mqttData.error && (
                      <div className="text-xs text-muted-foreground">
                        {mqttData.error}
                      </div>
                    )}
                    <Link href="/configuration/mqtt-brokers">
                      <Button variant="outline" size="sm" className="w-full">
                        Manage MQTT Brokers
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* MQTT Publish Rules */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Send className="h-5 w-5" />
                    MQTT Publish Rules
                  </CardTitle>
                  <CardDescription>
                    Configure domain event publishing to MQTT brokers
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">
                      Define rules for publishing domain events (orders, production events, deviations) to MQTT
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Event Publishing:</span>
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        Active
                      </Badge>
                    </div>
                    <Link href="/configuration/mqtt-publish-rules">
                      <Button variant="outline" size="sm" className="w-full">
                        Manage Publish Rules
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* System Alerts */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    System Alerts & Notifications
                  </CardTitle>
                  <CardDescription>
                    Configure alert thresholds and notification settings
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm">Active Alerts:</span>
                      <span className="font-medium">0</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Notification Rules:</span>
                      <span className="font-medium">12</span>
                    </div>
                    <Button variant="outline" size="sm" className="w-full">
                      Alert Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Audit Trail */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Audit Trail
                  </CardTitle>
                  <CardDescription>
                    Track all configuration changes and user activities
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm">Recent Changes:</span>
                      <span className="font-medium">--</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Audit Logging:</span>
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        Active
                      </Badge>
                    </div>
                    <Link href="/configuration/audit-trail">
                      <Button variant="outline" size="sm" className="w-full">
                        View Audit Trail
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      </PageContainer>
    </RouteGuard>
  )
} 