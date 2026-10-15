'use client'

import React, { useState } from 'react'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useEnzymeDosing } from '@/hooks/useEnzymeDosing'
import { EnzymeDosingResult } from '@/lib/utils/enzyme-dosing'
import { Loader2, Calculator } from 'lucide-react'

export default function EnzymeDosingTestPage() {
	const [createModeInput, setCreateModeInput] = useState({
		mashBill: '75-21-04-00',
		enzymeItemId: 'cmbbayb0l00019q8s2iu672fn' // Termamyl SC DS
	})

	const [editModeInput, setEditModeInput] = useState({
		recipeId: 'cm8vv2gu600zkbseoolyfhz6x',
		enzymeItemId: 'cmbbayb0l00019q8s2iu672fn' // Termamyl SC DS
	})

	const [results, setResults] = useState<{
		mode: 'create' | 'edit'
		data: EnzymeDosingResult | null
	} | null>(null)

	const {
		loading,
		error,
		calculateSingleEnzymeDosing,
		formatMashBill,
		parseMashBill,
		clearError
	} = useEnzymeDosing()

	const handleCreateModeTest = async () => {
		clearError()
		try {
			const result = await calculateSingleEnzymeDosing({
				mashBill: createModeInput.mashBill,
				enzymeItemId: createModeInput.enzymeItemId
			})
			setResults({ mode: 'create', data: result })
		} catch (err) {
			console.error('Create mode test failed:', err)
		}
	}

	const handleEditModeTest = async () => {
		clearError()
		try {
			const result = await calculateSingleEnzymeDosing({
				recipeId: editModeInput.recipeId,
				enzymeItemId: editModeInput.enzymeItemId
			})
			setResults({ mode: 'edit', data: result })
		} catch (err) {
			console.error('Edit mode test failed:', err)
		}
	}

	const handleMashBillFormat = () => {
		const formatted = formatMashBill(75, 21, 4, 0)
		setCreateModeInput(prev => ({ ...prev, mashBill: formatted }))
	}

	const handleMashBillParse = () => {
		try {
			const parsed = parseMashBill(createModeInput.mashBill)
			console.log('Parsed mash bill:', parsed)
		} catch (err) {
			console.error('Parse error:', err)
		}
	}

	return (
		<div className="container mx-auto p-6 space-y-6">
			<div className="flex items-center gap-2">
				<Calculator className="h-6 w-6" />
				<h1 className="text-2xl font-bold">Enzyme Dosing Integration Test</h1>
			</div>

			<Tabs defaultValue="create" className="w-full">
				<TabsList className="grid w-full grid-cols-2">
					<TabsTrigger value="create">Create Mode (Mash Bill)</TabsTrigger>
					<TabsTrigger value="edit">Edit Mode (Recipe ID)</TabsTrigger>
				</TabsList>

				<TabsContent value="create" className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle>Create Mode - Calculate with Mash Bill</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-2 gap-4">
								<div>
									<Label htmlFor="mashBill">Mash Bill (XX-XX-XX-XX)</Label>
									<Input
										id="mashBill"
										value={createModeInput.mashBill}
										onChange={(e) => setCreateModeInput(prev => ({ ...prev, mashBill: e.target.value }))}
										placeholder="75-21-04-00"
									/>
								</div>
								<div>
									<Label htmlFor="enzymeId">Enzyme Item ID</Label>
									<Input
										id="enzymeId"
										value={createModeInput.enzymeItemId}
										onChange={(e) => setCreateModeInput(prev => ({ ...prev, enzymeItemId: e.target.value }))}
										placeholder="cmbbayb0l00019q8s2iu672fn"
									/>
								</div>
							</div>
							
							<div className="flex gap-2">
								<Button
									onClick={handleCreateModeTest}
									disabled={loading}
									className="flex items-center gap-2"
								>
									{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
									Calculate Dosing
								</Button>
								<Button variant="outline" onClick={handleMashBillFormat}>
									Format Mash Bill
								</Button>
								<Button variant="outline" onClick={handleMashBillParse}>
									Parse Mash Bill
								</Button>
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="edit" className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle>Edit Mode - Calculate with Recipe ID</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-2 gap-4">
								<div>
									<Label htmlFor="recipeId">Recipe ID</Label>
									<Input
										id="recipeId"
										value={editModeInput.recipeId}
										onChange={(e) => setEditModeInput(prev => ({ ...prev, recipeId: e.target.value }))}
										placeholder="cm8vv2gu600zkbseoolyfhz6x"
									/>
								</div>
								<div>
									<Label htmlFor="enzymeIdEdit">Enzyme Item ID</Label>
									<Input
										id="enzymeIdEdit"
										value={editModeInput.enzymeItemId}
										onChange={(e) => setEditModeInput(prev => ({ ...prev, enzymeItemId: e.target.value }))}
										placeholder="cmbbayb0l00019q8s2iu672fn"
									/>
								</div>
							</div>
							
							<Button
								onClick={handleEditModeTest}
								disabled={loading}
								className="flex items-center gap-2"
							>
								{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
								Calculate Dosing
							</Button>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>

			{error && (
				<Card className="border-red-200 bg-red-50">
					<CardContent className="pt-6">
						<div className="text-red-800">
							<strong>Error:</strong> {error}
						</div>
					</CardContent>
				</Card>
			)}

			{results && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							Calculation Results
							<Badge variant={results.mode === 'create' ? 'default' : 'secondary'}>
								{results.mode === 'create' ? 'Create Mode' : 'Edit Mode'}
							</Badge>
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-2 gap-4 text-sm">
							<div>
								<strong>Enzyme:</strong> {results.data?.enzymeName}
							</div>
							<div>
								<strong>Category:</strong> {results.data?.enzymeCategory}
							</div>
							<div>
								<strong>Mash Bill:</strong> {results.data?.mashBill}
							</div>
							<div>
								<strong>Dose Ratio:</strong> {results.data?.normalizedDoseRatio}
							</div>
							<div className="col-span-2">
								<strong>Instructions:</strong> {results.data?.instructions}
							</div>
							{results.data?.recipeName && (
								<div className="col-span-2">
									<strong>Recipe:</strong> {results.data.recipeName}
								</div>
							)}
							<div className="col-span-2">
								<strong>Calculated At:</strong> {results.data?.calculatedAt ? new Date(results.data.calculatedAt).toLocaleString() : 'N/A'}
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader>
					<CardTitle>Integration Notes</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2 text-sm text-gray-600">
					<p><strong>Create Mode:</strong> Uses mash bill string (XX-XX-XX-XX format) for new recipe creation</p>
					<p><strong>Edit Mode:</strong> Uses existing recipe ID for editing existing recipes</p>
					<p><strong>Auto-Detection:</strong> The calculateSingleEnzymeDosing function automatically detects which mode to use based on the input parameters</p>
					<p><strong>Mash Bill Format:</strong> Must be in XX-XX-XX-XX format (corn-rye-wheat-malt percentages)</p>
				</CardContent>
			</Card>
		</div>
	)
} 