'use client'

import React, { useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  ManufacturingValidator, 
  ManufacturingInputSanitizer,
  ManufacturingData,
  ValidationError
} from '@/lib/validation'
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Shield,
  Beaker,
  Factory,
  BarChart3,
  Thermometer,
  Package
} from 'lucide-react'

// Individual field validation component
interface ValidationFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  validator: (input: string) => { isValid: boolean; error: string | undefined; sanitized?: string }
  sanitizer?: (input: string) => string
  icon?: React.ReactNode
  examples?: string[]
}

function ValidationField({ 
  label, 
  value, 
  onChange, 
  placeholder, 
  validator, 
  sanitizer,
  icon,
  examples 
}: ValidationFieldProps) {
  const [touched, setTouched] = useState(false)
  const [validationResult, setValidationResult] = useState<{ isValid: boolean; error: string | undefined; sanitized?: string }>({ isValid: true, error: undefined })

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value
    let processedValue = inputValue

    // Apply sanitization if provided
    if (sanitizer) {
      processedValue = sanitizer(inputValue)
    }

    // Run validation
    const result = validator(processedValue)
    setValidationResult(result)

    // Update parent with sanitized value if available
    onChange(result.sanitized || processedValue)
  }, [validator, sanitizer, onChange])

  const handleBlur = () => {
    setTouched(true)
  }

  const showError = touched && !validationResult.isValid
  const showSuccess = touched && validationResult.isValid && value.length > 0

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <Label htmlFor={label.toLowerCase().replace(/\s+/g, '-')}>{label}</Label>
        {showSuccess && <CheckCircle className="h-4 w-4 text-green-500" />}
        {showError && <XCircle className="h-4 w-4 text-red-500" />}
      </div>
      
      <Input
        id={label.toLowerCase().replace(/\s+/g, '-')}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={`${showError ? 'border-red-500' : showSuccess ? 'border-green-500' : ''}`}
      />
      
      {showError && validationResult.error && (
        <p className="text-sm text-red-500 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          {validationResult.error}
        </p>
      )}
      
      {examples && examples.length > 0 && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium">Examples:</span> {examples.join(', ')}
        </div>
      )}
    </div>
  )
}

// Manufacturing input validation demo component
export function ManufacturingInputValidationDemo() {
  const [formData, setFormData] = useState<Partial<ManufacturingData>>({
    recipeCode: '',
    batchId: '',
    mashBill: '',
  })

  const [overallValidation, setOverallValidation] = useState<{
    isValid: boolean
    errors: ValidationError[]
  }>({ isValid: true, errors: [] })

  const validateOverall = useCallback(() => {
    const result = ManufacturingValidator.validateManufacturingData(formData)
    setOverallValidation(result)
  }, [formData])

  const handleNumericChange = (field: keyof ManufacturingData, value: string) => {
    const numericValue = value === '' ? undefined : parseFloat(value)
    setFormData(prev => ({ ...prev, [field]: numericValue }))
  }

  const sampleData: Partial<ManufacturingData> = {
    recipeCode: 'DWL-75-21-04-00-v01',
    batchId: 'BATCH-2025-05-25-001',
    proofValue: 140.5,
    mashBill: '75-21-04-00',
    temperature: 180,
    barrelQuantity: 25
  }

  const loadSampleData = () => {
    setFormData(sampleData)
  }

  const clearData = () => {
    setFormData({
      recipeCode: '',
      batchId: '',
      mashBill: '',
    })
    setOverallValidation({ isValid: true, errors: [] })
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-blue-600" />
            <CardTitle>Manufacturing Input Validation</CardTitle>
          </div>
          <CardDescription>
            Real-time validation and sanitization for whiskey production data inputs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Button onClick={loadSampleData} variant="outline" size="sm">
              Load Sample Data
            </Button>
            <Button onClick={clearData} variant="outline" size="sm">
              Clear All
            </Button>
            <Button onClick={validateOverall} variant="default" size="sm">
              Validate Form
            </Button>
          </div>
          
          {/* Overall validation status */}
          {overallValidation.errors.length > 0 && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-medium">Validation Errors Found:</div>
                <ul className="mt-1 space-y-1">
                  {overallValidation.errors.map((error, index) => (
                    <li key={index} className="text-sm">
                      <strong>{error.field}:</strong> {error.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          
          {overallValidation.isValid && Object.values(formData).some(v => v !== '' && v !== undefined) && (
            <Alert className="mb-4 border-green-500">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700">
                All manufacturing data is valid and ready for production use.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Validation Forms */}
      <Tabs defaultValue="production" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="production">Production Data</TabsTrigger>
          <TabsTrigger value="process">Process Parameters</TabsTrigger>
          <TabsTrigger value="security">Security Testing</TabsTrigger>
        </TabsList>

        {/* Production Data Tab */}
        <TabsContent value="production" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Beaker className="h-5 w-5 text-amber-600" />
                <CardTitle className="text-lg">Recipe & Batch Information</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ValidationField
                  label="Recipe Code"
                  value={formData.recipeCode || ''}
                  onChange={(value) => setFormData(prev => ({ ...prev, recipeCode: value }))}
                  placeholder="Enter recipe code"
                  validator={ManufacturingValidator.validateRecipeCode}
                  sanitizer={ManufacturingInputSanitizer.sanitizeRecipeCode}
                  icon={<Factory className="h-4 w-4 text-blue-500" />}
                  examples={['DWL-75-21-04-00-v01', 'WHT-60-40-00-00-v02', 'RYE-95-05-00-00-v01']}
                />
                
                <ValidationField
                  label="Batch ID"
                  value={formData.batchId || ''}
                  onChange={(value) => setFormData(prev => ({ ...prev, batchId: value }))}
                  placeholder="Enter batch ID"
                  validator={ManufacturingValidator.validateBatchId}
                  sanitizer={ManufacturingInputSanitizer.sanitizeBatchId}
                  icon={<Package className="h-4 w-4 text-green-500" />}
                  examples={['BATCH-2025-05-25-001', 'BATCH-2025-05-25-002']}
                />
                
                <ValidationField
                  label="Mash Bill"
                  value={formData.mashBill || ''}
                  onChange={(value) => setFormData(prev => ({ ...prev, mashBill: value }))}
                  placeholder="Enter mash bill percentages"
                  validator={ManufacturingValidator.validateMashBill}
                  icon={<BarChart3 className="h-4 w-4 text-orange-500" />}
                  examples={['75-21-04-00', '60-40-00-00', '95-05-00-00']}
                />
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Beaker className="h-4 w-4 text-purple-500" />
                    <Label htmlFor="proof-value">Proof Value (%)</Label>
                  </div>
                  <Input
                    id="proof-value"
                    type="number"
                    step="0.1"
                    min="0"
                    max="200"
                    value={formData.proofValue || ''}
                    onChange={(e) => handleNumericChange('proofValue', e.target.value)}
                    placeholder="Enter proof percentage"
                  />
                  <div className="text-xs text-muted-foreground">
                    Range: 0-200% ABV, max 1 decimal place
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Process Parameters Tab */}
        <TabsContent value="process" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Thermometer className="h-5 w-5 text-red-500" />
                <CardTitle className="text-lg">Process Control Parameters</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Thermometer className="h-4 w-4 text-red-500" />
                    <Label htmlFor="temperature">Temperature (°F)</Label>
                  </div>
                  <Input
                    id="temperature"
                    type="number"
                    min="-20"
                    max="250"
                    value={formData.temperature || ''}
                    onChange={(e) => handleNumericChange('temperature', e.target.value)}
                    placeholder="Enter temperature"
                  />
                  <div className="text-xs text-muted-foreground">
                    Range: -20°F to 250°F for distillery operations
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-amber-600" />
                    <Label htmlFor="barrel-quantity">Barrel Quantity</Label>
                  </div>
                  <Input
                    id="barrel-quantity"
                    type="number"
                    min="1"
                    max="1000"
                    value={formData.barrelQuantity || ''}
                    onChange={(e) => handleNumericChange('barrelQuantity', e.target.value)}
                    placeholder="Enter number of barrels"
                  />
                  <div className="text-xs text-muted-foreground">
                    Range: 1-1000 barrels per production batch
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Testing Tab */}
        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-red-600" />
                <CardTitle className="text-lg">Input Security & Sanitization</CardTitle>
              </div>
              <CardDescription>
                Test malicious input patterns to verify sanitization effectiveness
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Security Testing:</strong> Try entering potentially malicious inputs like HTML tags, 
                  JavaScript code, or special characters. The system will sanitize them automatically.
                </AlertDescription>
              </Alert>
              
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label>Test Recipe Code Sanitization</Label>
                  <Input
                    placeholder="Try: <script>alert('xss')</script>DWL-75-21"
                    onChange={(e) => {
                      const sanitized = ManufacturingInputSanitizer.sanitizeRecipeCode(e.target.value)
                      e.target.value = sanitized
                    }}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Test Batch ID Sanitization</Label>
                  <Input
                    placeholder="Try: BATCH<img src=x>2025-05-25"
                    onChange={(e) => {
                      const sanitized = ManufacturingInputSanitizer.sanitizeBatchId(e.target.value)
                      e.target.value = sanitized
                    }}
                  />
                </div>
              </div>
              
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">Security Features:</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">XSS Protection</Badge>
                    <span>HTML/Script tag removal</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Input Sanitization</Badge>
                    <span>Character filtering</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Format Validation</Badge>
                    <span>Manufacturing standards</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Real-time Feedback</Badge>
                    <span>Immediate validation</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default ManufacturingInputValidationDemo 