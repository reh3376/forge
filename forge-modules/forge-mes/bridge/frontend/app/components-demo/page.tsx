'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { 
	Database, 
	Zap, 
	RefreshCw, 
	Settings, 
	Activity,
	BarChart3,
	CheckCircle
} from 'lucide-react'
import { StateManagementDemo } from '@/components/ui/state-management-demo'
import { DataFetchingDemo } from '@/components/ui/data-fetching-demo'
import { WebSocketDemo } from '@/components/demos/websocket-demo'

export default function ComponentsDemoPage() {
	return (
		<div className="container mx-auto p-6 space-y-8">
			{/* Page Header */}
			<div className="text-center space-y-4">
				<h1 className="text-4xl font-bold tracking-tight">
					MES Components Demo
				</h1>
				<p className="text-xl text-muted-foreground max-w-3xl mx-auto">
					Demonstration of state management, data fetching, and real-time capabilities 
					for the Manufacturing Execution System
				</p>
				<div className="flex justify-center gap-2">
					<Badge variant="secondary" className="gap-1">
						<Database className="w-3 h-3" />
						State Management
					</Badge>
					<Badge variant="secondary" className="gap-1">
						<Zap className="w-3 h-3" />
						Data Fetching
					</Badge>
					<Badge variant="secondary" className="gap-1">
						<Activity className="w-3 h-3" />
						Real-time Updates
					</Badge>
				</div>
			</div>

			{/* Main Demo Tabs */}
			<Tabs defaultValue="state-management" className="space-y-6">
				<TabsList className="grid w-full grid-cols-4">
					<TabsTrigger value="state-management" className="gap-2">
						<Settings className="w-4 h-4" />
						State Management
					</TabsTrigger>
					<TabsTrigger value="data-fetching" className="gap-2">
						<RefreshCw className="w-4 h-4" />
						Data Fetching
					</TabsTrigger>
					<TabsTrigger value="real-time" className="gap-2">
						<Activity className="w-4 h-4" />
						Real-time Data
					</TabsTrigger>
					<TabsTrigger value="performance" className="gap-2">
						<BarChart3 className="w-4 h-4" />
						Performance
					</TabsTrigger>
				</TabsList>

				{/* State Management Demo */}
				<TabsContent value="state-management" className="space-y-6">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Settings className="w-5 h-5" />
								Zustand State Management
							</CardTitle>
							<CardDescription>
								Production data state management using Zustand stores with persistence and devtools
							</CardDescription>
						</CardHeader>
						<CardContent>
							<StateManagementDemo />
						</CardContent>
					</Card>
				</TabsContent>

				{/* Data Fetching Demo */}
				<TabsContent value="data-fetching" className="space-y-6">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<RefreshCw className="w-5 h-5" />
								TanStack Query Data Fetching
							</CardTitle>
							<CardDescription>
								Server state management with caching, background updates, and optimistic updates
							</CardDescription>
						</CardHeader>
						<CardContent>
							<DataFetchingDemo />
						</CardContent>
					</Card>
				</TabsContent>

				{/* Real-time Data Demo */}
				<TabsContent value="real-time" className="space-y-6">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Activity className="w-5 h-5" />
								WebSocket Real-time Updates
							</CardTitle>
							<CardDescription>
								Live manufacturing data updates via WebSocket connection with simulation capabilities
							</CardDescription>
						</CardHeader>
						<CardContent>
							<WebSocketDemo />
						</CardContent>
					</Card>
				</TabsContent>

				{/* Performance Demo */}
				<TabsContent value="performance" className="space-y-6">
					<div className="grid gap-6 md:grid-cols-3">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<CheckCircle className="w-5 h-5 text-green-500" />
									Query Performance
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="space-y-2">
									<div className="flex justify-between text-sm">
										<span>Cache Hit Rate</span>
										<span className="font-medium">94%</span>
									</div>
									<div className="flex justify-between text-sm">
										<span>Avg Response Time</span>
										<span className="font-medium">120ms</span>
									</div>
									<div className="flex justify-between text-sm">
										<span>Background Refetches</span>
										<span className="font-medium">15/min</span>
									</div>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Database className="w-5 h-5 text-blue-500" />
									State Updates
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="space-y-2">
									<div className="flex justify-between text-sm">
										<span>Store Subscriptions</span>
										<span className="font-medium">8</span>
									</div>
									<div className="flex justify-between text-sm">
										<span>Updates/sec</span>
										<span className="font-medium">2.3</span>
									</div>
									<div className="flex justify-between text-sm">
										<span>Persistence Size</span>
										<span className="font-medium">45KB</span>
									</div>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Activity className="w-5 h-5 text-purple-500" />
									Real-time Metrics
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="space-y-2">
									<div className="flex justify-between text-sm">
										<span>WebSocket Connections</span>
										<span className="font-medium">3</span>
									</div>
									<div className="flex justify-between text-sm">
										<span>Messages/min</span>
										<span className="font-medium">45</span>
									</div>
									<div className="flex justify-between text-sm">
										<span>Latency</span>
										<span className="font-medium">25ms</span>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	)
} 