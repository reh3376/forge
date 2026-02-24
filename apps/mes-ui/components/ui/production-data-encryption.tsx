'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Lock, 
  Unlock, 
  Copy, 
  CheckCircle, 
  AlertTriangle, 
  Database,
  Shield,
  Key,
  Clock
} from 'lucide-react'
import {
  encryptionUtils,
  DataClassification,
  ManufacturingDataType,
  type RecipeData,
  type BatchData,
  type QualityData,
  type EncryptedData
} from '@/lib/security/encryption'

// Sample production data for testing
const sampleRecipeData: RecipeData = {
  name: "DWL-75-21-04-00-v01",
  ingredients: [
    { name: "Corn", quantity: 75, unit: "%" },
    { name: "Wheat", quantity: 21, unit: "%" },
    { name: "Malted Barley", quantity: 4, unit: "%" }
  ],
  parameters: {
    highWineProof: 140,
    lowWineProof: 130,
    mashRatio: 3.0,
    fermentationTime: 72,
    isFourGrain: false
  },
  mashingProtocol: [
    { step: "1", type: "LiquidAdd", temperature: 85, time: 30 },
    { step: "2", type: "Hold", temperature: 180, time: 45 },
    { step: "3", type: "Cool", temperature: 155, time: 15 }
  ],
  customer: "BHK"
}

const sampleBatchData: BatchData = {
  batchId: "BATCH-2025-01-24-001",
  recipeId: "DWL-75-21-04-00-v01",
  parameters: {
    actualProof: 139.5,
    fermentationTemp: 86.2,
    phLevel: 5.1,
    yield: 87.3
  },
  qualityMetrics: {
    clarity: "Clear",
    aroma: "Clean grain, slight sweetness",
    taste: "Smooth, wheat forward"
  },
  yields: {
    totalGallons: 142.5,
    proofGallons: 198.8
  }
}

const sampleQualityData: QualityData = {
  batchId: "BATCH-2025-01-24-001",
  testResults: {
    alcoholContent: 139.5,
    phLevel: 5.1,
    conductivity: 12.8,
    totalAcids: 0.15,
    methanol: "ND",
    fuselOils: 0.08
  },
  specifications: {
    minAlcohol: 135.0,
    maxAlcohol: 145.0,
    minPh: 4.8,
    maxPh: 5.4,
    maxMethanol: 0.1
  },
  complianceData: {
    ttbApproval: "APPROVED",
    koaPermit: "KY-2025-WHK-001",
    testDate: "2025-01-24T10:30:00Z",
    inspector: "J.Smith"
  }
}

export function ProductionDataEncryptionDemo() {
  const [activeTab, setActiveTab] = useState('recipe')
  const [encryptedData, setEncryptedData] = useState<EncryptedData | null>(null)
  const [decryptedData, setDecryptedData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const getCurrentData = () => {
    switch (activeTab) {
      case 'recipe': return sampleRecipeData
      case 'batch': return sampleBatchData
      case 'quality': return sampleQualityData
      default: return sampleRecipeData
    }
  }

  const getDataType = (): ManufacturingDataType => {
    switch (activeTab) {
      case 'recipe': return ManufacturingDataType.RECIPE_FORMULATION
      case 'batch': return ManufacturingDataType.BATCH_PARAMETERS
      case 'quality': return ManufacturingDataType.QUALITY_METRICS
      default: return ManufacturingDataType.RECIPE_FORMULATION
    }
  }

  const getClassification = (): DataClassification => {
    switch (activeTab) {
      case 'recipe': return DataClassification.PROPRIETARY
      case 'batch': return DataClassification.CONFIDENTIAL
      case 'quality': return DataClassification.REGULATED
      default: return DataClassification.PROPRIETARY
    }
  }

  const handleEncrypt = () => {
    try {
      setError(null)
      const data = getCurrentData()
      let encrypted: EncryptedData

      switch (activeTab) {
        case 'recipe':
          encrypted = encryptionUtils.encryptRecipe(data as RecipeData)
          break
        case 'batch':
          encrypted = encryptionUtils.encryptBatch(data as BatchData)
          break
        case 'quality':
          encrypted = encryptionUtils.encryptQuality(data as QualityData)
          break
        default:
          encrypted = encryptionUtils.encryptRecipe(data as RecipeData)
      }

      setEncryptedData(encrypted)
      setDecryptedData(null)
      setSuccess(`${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} data encrypted successfully`)
    } catch (err) {
      setError(`Encryption failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setEncryptedData(null)
    }
  }

  const handleDecrypt = () => {
    if (!encryptedData) {
      setError('No encrypted data available to decrypt')
      return
    }

    try {
      setError(null)
      let decrypted: any

      switch (activeTab) {
        case 'recipe':
          decrypted = encryptionUtils.decryptRecipe(encryptedData)
          break
        case 'batch':
          decrypted = encryptionUtils.decryptBatch(encryptedData)
          break
        case 'quality':
          decrypted = encryptionUtils.decryptQuality(encryptedData)
          break
        default:
          decrypted = encryptionUtils.decryptRecipe(encryptedData)
      }

      setDecryptedData(decrypted)
      setSuccess(`${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} data decrypted successfully`)
    } catch (err) {
      setError(`Decryption failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setDecryptedData(null)
    }
  }

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Failed to copy to clipboard')
    }
  }

  const clearAll = () => {
    setEncryptedData(null)
    setDecryptedData(null)
    setError(null)
    setSuccess(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h3 className="text-2xl font-bold flex items-center justify-center gap-2">
          <Database className="h-6 w-6 text-green-600" />
          Production Data Encryption Demo
        </h3>
        <p className="text-gray-600">
          Test AES-256 encryption for sensitive whiskey production data including recipes, batch parameters, and quality metrics
        </p>
      </div>

      {/* Data Type Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Select Production Data Type
          </CardTitle>
          <CardDescription>
            Choose the type of production data to encrypt/decrypt
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="recipe" className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Recipe Data
                <Badge variant="outline">Proprietary</Badge>
              </TabsTrigger>
              <TabsTrigger value="batch" className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Batch Data
                <Badge variant="outline">Confidential</Badge>
              </TabsTrigger>
              <TabsTrigger value="quality" className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Quality Data
                <Badge variant="outline">Regulated</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="recipe" className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-2">Proprietary Recipe Formulation</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Contains sensitive proprietary information including ingredient ratios, mashing protocols, and production parameters.
                </p>
                <pre className="text-xs bg-white p-3 rounded border overflow-auto max-h-40">
                  {JSON.stringify(sampleRecipeData, null, 2)}
                </pre>
              </div>
            </TabsContent>

            <TabsContent value="batch" className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-2">Confidential Batch Parameters</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Production data including actual yields, process parameters, and quality metrics for batch tracking.
                </p>
                <pre className="text-xs bg-white p-3 rounded border overflow-auto max-h-40">
                  {JSON.stringify(sampleBatchData, null, 2)}
                </pre>
              </div>
            </TabsContent>

            <TabsContent value="quality" className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-2">Regulated Quality Control Data</h4>
                <p className="text-sm text-gray-600 mb-3">
                  TTB compliance data, test results, and regulatory documentation requiring secure storage.
                </p>
                <pre className="text-xs bg-white p-3 rounded border overflow-auto max-h-40">
                  {JSON.stringify(sampleQualityData, null, 2)}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Encryption Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Encryption Controls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <Button onClick={handleEncrypt} className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Encrypt Data
            </Button>
            <Button 
              onClick={handleDecrypt} 
              variant="outline" 
              disabled={!encryptedData}
              className="flex items-center gap-2"
            >
              <Unlock className="h-4 w-4" />
              Decrypt Data
            </Button>
            <Button onClick={clearAll} variant="destructive" size="sm">
              Clear All
            </Button>
          </div>

          {/* Status Messages */}
          {error && (
            <Alert className="mb-4 border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-700">{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="mb-4 border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700">{success}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Encrypted Data Display */}
      {encryptedData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-red-600" />
              Encrypted Data
            </CardTitle>
            <CardDescription>
              AES-256 encrypted production data with metadata
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Metadata */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <div className="text-xs text-gray-500">Algorithm</div>
                <div className="font-mono text-sm">{encryptedData.metadata.algorithm}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Classification</div>
                <Badge variant="outline">{encryptedData.metadata.classification}</Badge>
              </div>
              <div>
                <div className="text-xs text-gray-500">Data Type</div>
                <div className="font-mono text-xs">{encryptedData.metadata.dataType}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Encrypted At
                </div>
                <div className="font-mono text-xs">
                  {new Date(encryptedData.metadata.encryptedAt).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Encrypted Content */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Encrypted Content:</h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy(JSON.stringify(encryptedData, null, 2))}
                  className="flex items-center gap-2"
                >
                  {copied ? <CheckCircle className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              <Textarea
                value={JSON.stringify(encryptedData, null, 2)}
                readOnly
                className="font-mono text-xs"
                rows={12}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Decrypted Data Display */}
      {decryptedData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Unlock className="h-5 w-5 text-green-600" />
              Decrypted Data
            </CardTitle>
            <CardDescription>
              Successfully decrypted production data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Decrypted Content:</h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy(JSON.stringify(decryptedData, null, 2))}
                  className="flex items-center gap-2"
                >
                  {copied ? <CheckCircle className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              <Textarea
                value={JSON.stringify(decryptedData, null, 2)}
                readOnly
                className="font-mono text-xs bg-green-50"
                rows={12}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Technical Details */}
      <Card>
        <CardHeader>
          <CardTitle>Encryption Implementation Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-2">Encryption Specifications:</h4>
              <ul className="space-y-1 text-sm">
                <li><strong>Algorithm:</strong> AES-256-CBC</li>
                <li><strong>Key Length:</strong> 256 bits</li>
                <li><strong>IV Length:</strong> 128 bits (random per encryption)</li>
                <li><strong>Authentication:</strong> HMAC-SHA256</li>
                <li><strong>Key Derivation:</strong> PBKDF2 (100,000 iterations)</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Data Classifications:</h4>
              <ul className="space-y-1 text-sm">
                <li><strong>Proprietary:</strong> Recipe formulations, trade secrets</li>
                <li><strong>Confidential:</strong> Production data, yields, costs</li>
                <li><strong>Regulated:</strong> TTB compliance, quality metrics</li>
                <li><strong>Internal:</strong> Standard operational data</li>
                <li><strong>Public:</strong> General information, no encryption needed</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 