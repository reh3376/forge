'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Lock, 
  Unlock, 
  Key, 
  CheckCircle, 
  AlertTriangle,
  RotateCw
} from 'lucide-react'
import {
  productionEncryption,
  DataClassification,
  ManufacturingDataType,
  type EncryptedData
} from '@/lib/security/encryption'

interface KeyInfo {
  keyId: string
  version: string
  createdAt: string
  isActive: boolean
  rotatedAt?: string
  classification: DataClassification[]
}

export function EncryptionTestCard() {
  const [testData, setTestData] = useState('{"recipe": "DWL-75-21-04-00-v01", "proof": 140}')
  const [encryptedResult, setEncryptedResult] = useState<EncryptedData | null>(null)
  const [decryptedResult, setDecryptedResult] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [keyInfo, setKeyInfo] = useState<KeyInfo | null>(null)

  const handleEncrypt = () => {
    try {
      setError('')
      const data = JSON.parse(testData)
      const encrypted = productionEncryption.encryptProductionData(
        data,
        DataClassification.CONFIDENTIAL,
        ManufacturingDataType.RECIPE_FORMULATION
      )
      setEncryptedResult(encrypted)
    } catch (err) {
      setError(`Encryption failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleDecrypt = () => {
    if (!encryptedResult) {
      setError('No encrypted data available')
      return
    }
    
    try {
      setError('')
      const decrypted = productionEncryption.decryptProductionData(encryptedResult)
      setDecryptedResult(JSON.stringify(decrypted, null, 2))
    } catch (err) {
      setError(`Decryption failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleRotateKey = () => {
    try {
      setError('')
      const newKey = productionEncryption.rotateEncryptionKey(DataClassification.CONFIDENTIAL)
      setKeyInfo(newKey)
    } catch (err) {
      setError(`Key rotation failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const getKeyInfo = () => {
    try {
      const info = productionEncryption.getKeyInfo(DataClassification.CONFIDENTIAL)
      setKeyInfo(info)
    } catch (err) {
      setError(`Failed to get key info: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          Encryption Test Interface
        </CardTitle>
        <CardDescription>
          Test production data encryption with key management
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Test Data Input */}
        <div>
          <label className="text-sm font-medium">Test Data (JSON):</label>
          <Input
            value={testData}
            onChange={(e) => setTestData(e.target.value)}
            placeholder="Enter JSON data to encrypt"
            className="font-mono"
          />
        </div>

        {/* Control Buttons */}
        <div className="flex gap-2 flex-wrap">
          <Button onClick={handleEncrypt} className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Encrypt
          </Button>
          <Button 
            onClick={handleDecrypt} 
            variant="outline" 
            disabled={!encryptedResult}
            className="flex items-center gap-2"
          >
            <Unlock className="h-4 w-4" />
            Decrypt
          </Button>
          <Button onClick={getKeyInfo} variant="outline" size="sm">
            <Key className="h-4 w-4 mr-1" />
            Key Info
          </Button>
          <Button onClick={handleRotateKey} variant="outline" size="sm">
            <RotateCw className="h-4 w-4 mr-1" />
            Rotate Key
          </Button>
        </div>

        {/* Error Display */}
        {error && (
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-700">{error}</AlertDescription>
          </Alert>
        )}

        {/* Encrypted Data Display */}
        {encryptedResult && (
          <div className="space-y-2">
            <h4 className="font-semibold flex items-center gap-2">
              <Lock className="h-4 w-4 text-red-600" />
              Encrypted Result:
            </h4>
            <div className="bg-gray-50 p-3 rounded text-xs font-mono border">
              <div className="mb-2">
                <Badge variant="outline">{encryptedResult.metadata.classification}</Badge>
                <Badge variant="outline" className="ml-1">{encryptedResult.metadata.algorithm}</Badge>
              </div>
              <div className="break-all text-gray-700">
                {encryptedResult.encryptedContent.substring(0, 100)}...
              </div>
            </div>
          </div>
        )}

        {/* Decrypted Data Display */}
        {decryptedResult && (
          <div className="space-y-2">
            <h4 className="font-semibold flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              Decrypted Result:
            </h4>
            <div className="bg-green-50 p-3 rounded text-xs font-mono border border-green-200">
              {decryptedResult}
            </div>
          </div>
        )}

        {/* Key Information Display */}
        {keyInfo && (
          <div className="space-y-2">
            <h4 className="font-semibold">Key Information:</h4>
            <div className="bg-blue-50 p-3 rounded text-xs">
              <div><strong>Key ID:</strong> {keyInfo.keyId}</div>
              <div><strong>Version:</strong> {keyInfo.version}</div>
              <div><strong>Created:</strong> {new Date(keyInfo.createdAt).toLocaleString()}</div>
              <div><strong>Active:</strong> {keyInfo.isActive ? 'Yes' : 'No'}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
} 