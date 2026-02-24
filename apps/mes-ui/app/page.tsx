'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Clock,
  Zap,
  Settings,
  RefreshCw,
  TrendingUp,
  Thermometer,
  Gauge
} from 'lucide-react'

interface ProductionMetrics {
  barrelsProduced: number
  targetBarrels: number
  proofGallons: number
  wineGallons: number
  efficiency: number
  qualityScore: number
  activeLines: number
  totalLines: number
  yieldPgPerBushel: number
  distillationFeedRate: number
}

interface OEEMetrics {
  availability: number
  performance: number
  quality: number
  overall: number
}

interface BarrelingOEE {
  availability: number
  performance: number
  quality: number
}

interface MashBill {
  corn: number
  wheat?: number
  rye?: number
  malted_barley: number
}

interface Cooker {
  id: string
  name: string
  mashBill: MashBill
  currentStep: string
  productionOrderNumber: string
  temperature?: number
}

interface Fermenter {
  id: string
  name: string
  temperature: number
  timeInHours: number
  mashBill: MashBill
  status: 'active' | 'idle' | 'cleaning'
}

interface DistillationData {
  stillVaporTemp: number
  refluxProof: number
  refluxFlow: number
  beerFeedFlow: number
  lowWineCondenserTemp: number
}

interface CisternTank {
  id: string
  name: string
  mashBill: MashBill
  volume: number
  proof: number
}

interface QualityTest {
  type: 'grain' | 'fermenter' | 'distillate'
  results: any
  timestamp: string
}

interface EquipmentStatus {
  id: string
  name: string
  status: 'running' | 'idle' | 'maintenance' | 'alarm'
  temperature?: number
  pressure?: number
  efficiency?: number
}

interface QualityMetric {
  name: string
  value: string
  status: 'good' | 'warning' | 'critical'
  trend: 'up' | 'down' | 'stable'
}

export default function Home() {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [metrics, setMetrics] = useState<ProductionMetrics>({
    barrelsProduced: 432,
    targetBarrels: 500,
    proofGallons: 432 * 64,
    wineGallons: 432 * 53,
    efficiency: 87,
    qualityScore: 94,
    activeLines: 1,
    totalLines: 1,
    yieldPgPerBushel: 5.15,
    distillationFeedRate: 95
  })

  const [oeeMetrics] = useState<OEEMetrics>({
    availability: 85,
    performance: 92,
    quality: 96,
    overall: 75
  })

  const [barrelingOEE] = useState<BarrelingOEE>({
    availability: 63,
    performance: 87,
    quality: 97
  })

  const [cookers] = useState<Cooker[]>([
    {
      id: 'cooker1',
      name: 'Cooker 1',
      mashBill: { corn: 70, rye: 16, malted_barley: 14 },
      currentStep: 'Add Grain',
      productionOrderNumber: 'PO-2025-0134',
      temperature: 185
    },
    {
      id: 'cooker2',
      name: 'Cooker 2',
      mashBill: { corn: 72, wheat: 16, malted_barley: 12 },
      currentStep: 'Add Water',
      productionOrderNumber: 'PO-2025-0135',
      temperature: 154
    }
  ])

  const [fermenters] = useState<Fermenter[]>([
    { id: 'f1', name: 'Fermenter 1', temperature: 82, timeInHours: 48, mashBill: { corn: 70, rye: 16, malted_barley: 14 }, status: 'active' },
    { id: 'f2', name: 'Fermenter 2', temperature: 79, timeInHours: 72, mashBill: { corn: 72, wheat: 16, malted_barley: 12 }, status: 'active' },
    { id: 'f3', name: 'Fermenter 3', temperature: 85, timeInHours: 24, mashBill: { corn: 68, rye: 20, malted_barley: 12 }, status: 'active' },
    { id: 'f4', name: 'Fermenter 4', temperature: 81, timeInHours: 36, mashBill: { corn: 75, wheat: 13, malted_barley: 12 }, status: 'active' },
    { id: 'f5', name: 'Fermenter 5', temperature: 83, timeInHours: 60, mashBill: { corn: 70, rye: 16, malted_barley: 14 }, status: 'active' },
    { id: 'f6', name: 'Fermenter 6', temperature: 78, timeInHours: 12, mashBill: { corn: 72, wheat: 16, malted_barley: 12 }, status: 'active' },
    { id: 'f7', name: 'Fermenter 7', temperature: 84, timeInHours: 54, mashBill: { corn: 65, rye: 23, malted_barley: 12 }, status: 'active' },
    { id: 'f8', name: 'Fermenter 8', temperature: 80, timeInHours: 18, mashBill: { corn: 75, wheat: 13, malted_barley: 12 }, status: 'active' },
    { id: 'f9', name: 'Fermenter 9', temperature: 82, timeInHours: 42, mashBill: { corn: 70, rye: 16, malted_barley: 14 }, status: 'active' },
    { id: 'f10', name: 'Fermenter 10', temperature: 77, timeInHours: 66, mashBill: { corn: 72, wheat: 16, malted_barley: 12 }, status: 'active' },
    { id: 'f11', name: 'Fermenter 11', temperature: 86, timeInHours: 30, mashBill: { corn: 68, rye: 20, malted_barley: 12 }, status: 'active' },
    { id: 'f12', name: 'Fermenter 12', temperature: 81, timeInHours: 6, mashBill: { corn: 75, wheat: 13, malted_barley: 12 }, status: 'active' },
    { id: 'f13', name: 'Fermenter 13', temperature: 0, timeInHours: 0, mashBill: { corn: 0, malted_barley: 0 }, status: 'cleaning' },
    { id: 'f14', name: 'Fermenter 14', temperature: 0, timeInHours: 0, mashBill: { corn: 0, malted_barley: 0 }, status: 'idle' }
  ])

  const [distillationData, setDistillationData] = useState<DistillationData>({
    stillVaporTemp: 201,
    refluxProof: 45,
    refluxFlow: 5,
    beerFeedFlow: 95,
    lowWineCondenserTemp: 148
  })

  const [cisternTanks, setCisternTanks] = useState<CisternTank[]>([
    { id: 'c1', name: 'Cistern Tank 1', mashBill: { corn: 70, rye: 16, malted_barley: 14 }, volume: 329847.3, proof: 120.2 },
    { id: 'c2', name: 'Cistern Tank 2', mashBill: { corn: 72, wheat: 16, malted_barley: 12 }, volume: 331256.8, proof: 118.4 },
    { id: 'c3', name: 'Cistern Tank 3', mashBill: { corn: 68, rye: 20, malted_barley: 12 }, volume: 327894.1, proof: 122.1 }
  ])

  const [qualityTests] = useState<QualityTest[]>([
    { type: 'grain', results: { moisture: '12.5%', protein: '8.2%', starch: '68%' }, timestamp: '2024-09-04T08:30:00Z' },
    { type: 'fermenter', results: { pH: 4.1, abv: '8.5%', balling: 12.3 }, timestamp: '2024-09-04T10:15:00Z' },
    { type: 'distillate', results: { smell: 'Clean, fruity', taste: 'Smooth, balanced', color: 'Clear' }, timestamp: '2024-09-04T11:45:00Z' }
  ])

  const [hammermillAmps, setHammermillAmps] = useState(92)

  const [equipment] = useState<EquipmentStatus[]>([
    { id: '1', name: 'Mash Tun A', status: 'running', temperature: 152, efficiency: 94 },
    { id: '2', name: 'Fermenter B', status: 'idle', temperature: 78, efficiency: 0 },
    { id: '3', name: 'Still C', status: 'alarm', temperature: 185, pressure: 15.2 },
    { id: '4', name: 'Condenser D', status: 'maintenance', temperature: 65 }
  ])

  const [qualityMetrics] = useState<QualityMetric[]>([
    { name: 'Alcohol Content', value: '40.2% ABV', status: 'good', trend: 'stable' },
    { name: 'Temperature', value: '165°F', status: 'warning', trend: 'up' },
    { name: 'Pressure', value: '15.2 PSI', status: 'critical', trend: 'up' },
    { name: 'pH Level', value: '4.2', status: 'good', trend: 'stable' }
  ])

  // Simulate real-time updates
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
      
      // Simulate metric updates
      setMetrics(prev => {
        const newBarrels = Math.min(prev.targetBarrels, prev.barrelsProduced + Math.random() * 0.1)
        return {
          ...prev,
          barrelsProduced: newBarrels,
          proofGallons: newBarrels * 64,
          wineGallons: newBarrels * 53,
          efficiency: Math.max(80, Math.min(100, prev.efficiency + (Math.random() - 0.5) * 2))
        }
      })
      
      // Update distillation data every second for real-time simulation
      setDistillationData(prev => ({
        ...prev,
        stillVaporTemp: 201 + (Math.random() - 0.5) * 2,
        refluxProof: 45 + (Math.random() - 0.5) * 1,
        refluxFlow: 5 + (Math.random() - 0.5) * 0.2,
        beerFeedFlow: 95 + (Math.random() - 0.5) * 1,
        lowWineCondenserTemp: 148 + (Math.random() - 0.5) * 2
      }))
      
      // Simulate hammermill amps
      setHammermillAmps(92 + (Math.random() - 0.5) * 4)
      
      // Very slight fluctuation in cistern tank volumes (±0.1 gallons)
      setCisternTanks(prev => prev.map(tank => ({
        ...tank,
        volume: tank.volume + (Math.random() - 0.5) * 0.2,
        proof: tank.proof + (Math.random() - 0.5) * 0.02
      })))
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-green-500 text-white'
      case 'idle': return 'bg-yellow-500 text-white'
      case 'maintenance': return 'bg-blue-500 text-white'
      case 'alarm': return 'bg-red-500 text-white'
      case 'good': return 'text-green-600'
      case 'warning': return 'text-yellow-600'
      case 'critical': return 'text-red-600'
      default: return 'bg-gray-500 text-white'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <CheckCircle className="h-4 w-4" />
      case 'idle': return <Clock className="h-4 w-4" />
      case 'maintenance': return <Settings className="h-4 w-4" />
      case 'alarm': return <AlertTriangle className="h-4 w-4" />
      case 'good': return <CheckCircle className="h-4 w-4" />
      case 'warning': return <AlertTriangle className="h-4 w-4" />
      case 'critical': return <AlertTriangle className="h-4 w-4" />
      default: return <Activity className="h-4 w-4" />
    }
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-3 w-3 text-red-500" />
      case 'down': return <TrendingUp className="h-3 w-3 text-green-500 rotate-180" />
      default: return <div className="h-3 w-3 bg-gray-400 rounded-full" />
    }
  }

  const formatMashBill = (mashBill: MashBill) => {
    const parts = [`${mashBill.corn}% Corn`]
    if (mashBill.wheat) parts.push(`${mashBill.wheat}% Wheat`)
    if (mashBill.rye) parts.push(`${mashBill.rye}% Rye`)
    parts.push(`${mashBill.malted_barley}% Malted Barley`)
    return parts.join(', ')
  }

  const formatShortMashBill = (mashBill: MashBill) => {
    if (mashBill.wheat) return `${mashBill.corn}%/${mashBill.wheat}%/${mashBill.malted_barley}%`
    if (mashBill.rye) return `${mashBill.corn}%/${mashBill.rye}%/${mashBill.malted_barley}%`
    return `${mashBill.corn}%/${mashBill.malted_barley}%`
  }

  const productionProgress = (metrics.barrelsProduced / metrics.targetBarrels) * 100

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">
              Production Dashboard
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              {currentTime.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })} • {currentTime.toLocaleTimeString()}
            </p>
          </div>
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium">Today&apos;s Production</p>
                  <p className="text-3xl font-bold">{Math.round(metrics.barrelsProduced)}</p>
                  <p className="text-blue-100 text-sm">of {metrics.targetBarrels} barrels</p>
                </div>
                <BarChart3 className="h-8 w-8 text-blue-200" />
              </div>
              <Progress value={productionProgress} className="mt-4 bg-blue-400" />
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm font-medium">Efficiency</p>
                  <p className="text-3xl font-bold">{Math.round(metrics.efficiency)}%</p>
                  <p className="text-green-100 text-sm">Overall performance</p>
                </div>
                <Gauge className="h-8 w-8 text-green-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm font-medium">Quality Score</p>
                  <p className="text-3xl font-bold">{metrics.qualityScore}%</p>
                  <p className="text-purple-100 text-sm">Above target</p>
                </div>
                <CheckCircle className="h-8 w-8 text-purple-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-orange-500 to-orange-600 text-white border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-100 text-sm font-medium">Active Lines</p>
                  <p className="text-3xl font-bold">{metrics.activeLines}/{metrics.totalLines}</p>
                  <p className="text-orange-100 text-sm">Production lines</p>
                </div>
                <Activity className="h-8 w-8 text-orange-200" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="equipment">Equipment</TabsTrigger>
            <TabsTrigger value="quality">Quality</TabsTrigger>
            <TabsTrigger value="alerts">Alerts</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Production Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Production Lines Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                      <span className="font-medium">Production Line 1: Active</span>
                    </div>
                    <div className="text-right">
                      <Badge className="bg-green-500 text-white">Running</Badge>
                      <p className="text-sm text-muted-foreground mt-1">Feed Rate: {metrics.distillationFeedRate} GPM</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-3 p-3 border-l-4 border-green-500 bg-green-50 dark:bg-green-900/20">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Batch #2025-09-{String(Math.floor(Math.random() * 50) + 150).padStart(3, '0')} completed</p>
                      <p className="text-xs text-muted-foreground">2 minutes ago</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20">
                    <Zap className="h-4 w-4 text-blue-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Production Line efficiency improved to 94%</p>
                      <p className="text-xs text-muted-foreground">15 minutes ago</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
                    <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Temperature alert resolved</p>
                      <p className="text-xs text-muted-foreground">1 hour ago</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="equipment" className="space-y-6">
            {/* Hammermill */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Hammermill Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="font-medium">Current Draw</span>
                  <span className="text-2xl font-bold">{Math.round(hammermillAmps)} A</span>
                </div>
              </CardContent>
            </Card>

            {/* Cookers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {cookers.map((cooker) => (
                <Card key={cooker.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{cooker.name}</CardTitle>
                      <Badge className="bg-green-500 text-white">
                        <CheckCircle className="h-4 w-4" />
                        <span className="ml-1">Active</span>
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Mash Bill</span>
                      <span className="text-sm">{formatMashBill(cooker.mashBill)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Current Step</span>
                      <span className="text-sm font-bold text-blue-600">{cooker.currentStep}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Production Order</span>
                      <span className="text-sm font-mono">{cooker.productionOrderNumber}</span>
                    </div>
                    {cooker.temperature && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Thermometer className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Temperature</span>
                        </div>
                        <span className="font-medium">{cooker.temperature}°F</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Fermenters */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Fermenters (14 Total)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {fermenters.map((fermenter) => (
                    <div key={fermenter.id} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{fermenter.name}</span>
                        <Badge className={fermenter.status === 'active' ? 'bg-green-500 text-white' : fermenter.status === 'idle' ? 'bg-gray-500 text-white' : 'bg-blue-500 text-white'}>
                          {fermenter.status}
                        </Badge>
                      </div>
                      {fermenter.status === 'active' && (
                        <>
                          <div className="flex justify-between text-xs">
                            <span>Temp:</span>
                            <span className="font-medium">{fermenter.temperature}°F</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span>Time:</span>
                            <span className="font-medium">{fermenter.timeInHours}h</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Mash: {formatShortMashBill(fermenter.mashBill)}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Distillation */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Distillation (Real-time)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  <div className="text-center p-4 border rounded-lg">
                    <p className="text-sm text-muted-foreground">Still Vapor Temp</p>
                    <p className="text-2xl font-bold">{distillationData.stillVaporTemp.toFixed(1)}°F</p>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <p className="text-sm text-muted-foreground">Reflux Proof</p>
                    <p className="text-2xl font-bold">{distillationData.refluxProof.toFixed(1)}</p>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <p className="text-sm text-muted-foreground">Reflux Flow</p>
                    <p className="text-2xl font-bold">{distillationData.refluxFlow.toFixed(1)} GPM</p>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <p className="text-sm text-muted-foreground">Beer Feed Flow</p>
                    <p className="text-2xl font-bold">{distillationData.beerFeedFlow.toFixed(1)} GPM</p>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <p className="text-sm text-muted-foreground">Low Wine Condenser</p>
                    <p className="text-2xl font-bold">{distillationData.lowWineCondenserTemp.toFixed(1)}°F</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cistern Tanks */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Cistern Tanks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {cisternTanks.map((tank) => (
                    <div key={tank.id} className="border rounded-lg p-4 space-y-3">
                      <h4 className="font-medium">{tank.name}</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Mash Bill:</span>
                          <span className="font-medium">{formatShortMashBill(tank.mashBill)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Volume:</span>
                          <span className="font-medium">{tank.volume.toFixed(1)} gal</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Proof:</span>
                          <span className="font-medium">{tank.proof.toFixed(1)}°</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="quality" className="space-y-6">
            {qualityTests.map((test, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 capitalize">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    {test.type === 'grain' ? 'Recent Grain Test Results' : 
                     test.type === 'fermenter' ? 'Fermenter Sample Results' : 
                     'Latest Distillate Sample Result'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {Object.entries(test.results).map(([key, value]) => (
                      <div key={key} className="text-center p-3 border rounded-lg">
                        <p className="text-sm text-muted-foreground capitalize">{key.replace('_', ' ')}</p>
                        <p className="text-lg font-bold">{value}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">
                    Tested: {new Date(test.timestamp).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="alerts" className="space-y-6">
            <div className="space-y-4">
              <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-yellow-800 dark:text-yellow-200">
                        Hammermill Current Draw High - {Math.round(hammermillAmps)}A
                      </p>
                      <p className="text-sm text-yellow-600 dark:text-yellow-300 mt-1">
                        Current draw is approaching maximum operating range. 
                        Monitor for feed rate adjustments.
                      </p>
                      <p className="text-xs text-yellow-500 mt-2">Active for 12 minutes</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-green-200 bg-green-50 dark:bg-green-900/20">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-green-800 dark:text-green-200">
                        Fermenter 12 Ready for Transfer
                      </p>
                      <p className="text-sm text-green-600 dark:text-green-300 mt-1">
                        72-hour fermentation cycle completed. pH and ABV within specifications.
                        Ready for distillation transfer.
                      </p>
                      <p className="text-xs text-green-500 mt-2">Ready now</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/20">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-blue-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-blue-800 dark:text-blue-200">
                        Distillation Running Optimally
                      </p>
                      <p className="text-sm text-blue-600 dark:text-blue-300 mt-1">
                        All distillation parameters within normal range. 
                        Still vapor temp: {distillationData.stillVaporTemp.toFixed(1)}°F, Reflux proof: {distillationData.refluxProof.toFixed(1)}.
                      </p>
                      <p className="text-xs text-blue-500 mt-2">System nominal</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-purple-200 bg-purple-50 dark:bg-purple-900/20">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <BarChart3 className="h-5 w-5 text-purple-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-purple-800 dark:text-purple-200">
                        Production Target On Track
                      </p>
                      <p className="text-sm text-purple-600 dark:text-purple-300 mt-1">
                        Current barrel production: {Math.round(metrics.barrelsProduced)} barrels 
                        ({Math.round(productionProgress)}% of daily target).
                        Estimated completion: 3:30 PM.
                      </p>
                      <p className="text-xs text-purple-500 mt-2">On schedule</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
