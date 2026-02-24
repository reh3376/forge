'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import React from 'react'
import { ManufacturingInputValidationDemo } from '@/components/ui/manufacturing-input-validation'
import { ProductionDataEncryptionDemo } from '@/components/ui/production-data-encryption'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Shield, Lock, CheckCircle, AlertTriangle, Zap, Database } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EncryptionTestCard } from '@/components/security/encryption-test-card'

export default function SecurityDemoPage() {
  return (
    <div className="container mx-auto p-6 space-y-8">
      {/* Page Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-2">
          <Shield className="h-8 w-8 text-blue-600" />
          <h1 className="text-4xl font-bold">Advanced Security Features</h1>
        </div>
        <p className="text-lg text-gray-600 max-w-3xl mx-auto">
          Comprehensive security implementation for whiskey production MES, including input validation, 
          data encryption, sanitization, and protection against common security vulnerabilities.
        </p>
      </div>

      {/* Security Implementation Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Security Implementation Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="font-medium">Task 23.1: Manufacturing-Specific Input Validation</span>
                <Badge variant="default" className="bg-green-600">Complete</Badge>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="font-medium">Task 23.2: Production Data Encryption</span>
                <Badge variant="default" className="bg-green-600">Complete</Badge>
              </div>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3 border rounded-lg">
                  <Lock className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                  <h3 className="font-semibold text-sm">Input Validation</h3>
                  <p className="text-xs text-gray-600">Manufacturing-specific validation for recipe codes, batch IDs, proof values, mash bills, and production parameters.</p>
                  <div className="flex flex-wrap gap-1 mt-2 justify-center">
                    <Badge variant="outline" className="text-xs">Recipe Codes</Badge>
                    <Badge variant="outline" className="text-xs">Batch IDs</Badge>
                    <Badge variant="outline" className="text-xs">Proof Values</Badge>
                  </div>
                </div>
                <div className="p-3 border rounded-lg">
                  <Database className="h-8 w-8 mx-auto mb-2 text-green-600" />
                  <h3 className="font-semibold text-sm">Data Encryption</h3>
                  <p className="text-xs text-gray-600">AES-256 encryption for sensitive production data including recipes, batch formulations, and quality metrics.</p>
                  <div className="flex flex-wrap gap-1 mt-2 justify-center">
                    <Badge variant="outline" className="text-xs">AES-256</Badge>
                    <Badge variant="outline" className="text-xs">Key Management</Badge>
                    <Badge variant="outline" className="text-xs">HMAC Auth</Badge>
                  </div>
                </div>
                <div className="p-3 border rounded-lg">
                  <Zap className="h-8 w-8 mx-auto mb-2 text-purple-600" />
                  <h3 className="font-semibold text-sm">Real-time Feedback</h3>
                  <p className="text-xs text-gray-600">Immediate validation and encryption feedback helps users understand format requirements and security constraints.</p>
                  <div className="flex flex-wrap gap-1 mt-2 justify-center">
                    <Badge variant="outline" className="text-xs">Live Validation</Badge>
                    <Badge variant="outline" className="text-xs">Error Messages</Badge>
                    <Badge variant="outline" className="text-xs">Format Hints</Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Security Enhancements */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Upcoming Security Enhancements
          </CardTitle>
          <CardDescription>Additional security features planned for implementation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold mb-2">Task 23.3: Content Security Policy</h4>
              <p className="text-sm text-gray-600 mb-2">CSP headers to prevent code injection attacks, especially important for factory floor display systems.</p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Task 23.4: Session Security</h4>
              <p className="text-sm text-gray-600 mb-2">Secure session management with proper token handling, rotation, and timeout mechanisms.</p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Task 23.5: Security Headers</h4>
              <p className="text-sm text-gray-600 mb-2">Implementation of security headers for HTTPS enforcement, clickjacking protection, and content type validation.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Features Demo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            Interactive Security Features
          </CardTitle>
          <CardDescription>
            Test and explore the security features implemented for whiskey production data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="input-validation" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="input-validation">Input Validation & XSS Protection</TabsTrigger>
              <TabsTrigger value="data-encryption">Production Data Encryption</TabsTrigger>
            </TabsList>
            
            <TabsContent value="input-validation">
              <ManufacturingInputValidationDemo />
            </TabsContent>
            
            <TabsContent value="data-encryption">
              <ProductionDataEncryptionDemo />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Implementation Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Implementation Notes</CardTitle>
          <CardDescription>Technical details about the security implementation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Input Validation Details */}
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Manufacturing Data Validation Patterns:
              </h4>
              <div className="space-y-2 text-sm">
                <div><strong>Recipe Code:</strong> <code>/^[A-Z]{3}-\d{2}-\d{2}-\d{2}-\d{2}-R\d{2}$/</code></div>
                <div><strong>Batch ID:</strong> <code>/^BATCH-\d{4}-\d{2}-\d{2}-\d{3}$/</code></div>
                <div><strong>Mash Bill:</strong> <code>/^\d{2}-\d{2}-\d{2}-\d{2}$/</code> (must total 100%)</div>
                <div><strong>Equipment ID:</strong> <code>{'/^[A-Z]{2,10}\\d{2}$/'}</code></div>
              </div>
            </div>

            {/* Encryption Details */}
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Database className="h-4 w-4" />
                Production Data Encryption:
              </h4>
              <div className="space-y-2 text-sm">
                <div><strong>Algorithm:</strong> AES-256-CBC with HMAC authentication</div>
                <div><strong>Key Derivation:</strong> PBKDF2 with 100,000 iterations</div>
                <div><strong>Data Types:</strong> Recipes, batches, quality control, business intelligence</div>
                <div><strong>Key Management:</strong> Environment-specific key rotation support</div>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-3">Security Libraries Used:</h4>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <strong>Zod:</strong> Runtime type validation and schema enforcement
              </li>
              <li className="flex items-start gap-2">
                <strong>DOMPurify:</strong> XSS protection through HTML sanitization
              </li>
              <li className="flex items-start gap-2">
                <strong>Node.js Crypto:</strong> AES encryption and cryptographic operations
              </li>
              <li className="flex items-start gap-2">
                <strong>Custom Validators:</strong> Manufacturing-specific business rule validation
              </li>
              <li className="flex items-start gap-2">
                <strong>Input Sanitizers:</strong> Character filtering and format enforcement
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-3">Validation Ranges for Manufacturing:</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div><strong>Temperature:</strong> -20°F to 250°F</div>
              <div><strong>Proof Value:</strong> 0% to 200% ABV</div>
              <div><strong>pH Value:</strong> 0 to 14 (2 decimal places)</div>
              <div><strong>Barrel Quantity:</strong> 1 to 1000 barrels</div>
              <div><strong>Volume:</strong> 0 to 5000 gallons</div>
              <div><strong>Duration:</strong> 0 to 720 minutes</div>
            </div>
          </div>

          {/* Additional Encryption Test Interface */}
          <div className="space-y-6">
            <EncryptionTestCard />
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 