'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, XCircle, AlertTriangle, ExternalLink, Copy } from 'lucide-react'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

interface ConfigStep {
  id: string
  title: string
  description: string
  status: 'pending' | 'completed' | 'warning' | 'error'
  details: string[]
  links?: Array<{ text: string; url: string }>
}

export default function AzureConfigChecker() {
  const [checkedSteps, setCheckedSteps] = useState<Set<string>>(new Set())

  const toggleStep = (stepId: string) => {
    const newChecked = new Set(checkedSteps)
    if (newChecked.has(stepId)) {
      newChecked.delete(stepId)
    } else {
      newChecked.add(stepId)
    }
    setCheckedSteps(newChecked)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const configSteps: ConfigStep[] = [
    {
      id: 'app-registration',
      title: '1. Create App Registration',
      description: 'Set up the basic app registration in Azure Portal',
      status: checkedSteps.has('app-registration') ? 'completed' : 'pending',
      details: [
        'Go to Azure Portal → App registrations',
                  'Click &quot;New registration&quot;',
                 'Set Name: &quot;MES UI Application&quot; (or your preferred name)',
         'Set Redirect URI: &quot;Single-page application (SPA)&quot; → http://localhost:4000',
        'Note down Application (client) ID and Directory (tenant) ID'
      ],
      links: [
        { text: 'Azure Portal - App Registrations', url: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade' }
      ]
    },
    {
      id: 'app-roles',
      title: '2. Create App Roles',
      description: 'Define the exact manufacturing roles in your app registration',
      status: checkedSteps.has('app-roles') ? 'completed' : 'pending',
      details: [
        'In your app registration, go to "App roles"',
        'Click "Create app role" for each role below:',
        '• Display name: "E&T Admin", Value: "e&t.admin", Allowed: Users/Groups',
        '• Display name: "E&T Controls", Value: "e&t.controls", Allowed: Users/Groups',
        '• Display name: "E&T Developer", Value: "e&t.developer", Allowed: Users/Groups',
        '• Display name: "Operations Leadership", Value: "operations.distillery.leadership", Allowed: Users/Groups',
        '• Display name: "Operations Supervisor", Value: "operations.distillery.supervisor", Allowed: Users/Groups',
        '• Display name: "Operations Shift Lead", Value: "operations.distillery.shiftlead", Allowed: Users/Groups',
        '• Display name: "Operations Operator", Value: "operations.distillery.operator", Allowed: Users/Groups',
        '• Display name: "Maintenance Leadership", Value: "maintenance.leadership", Allowed: Users/Groups',
        '• Display name: "Maintenance Technician", Value: "maintenance.technician", Allowed: Users/Groups'
      ]
    },
    {
      id: 'token-config',
      title: '3. Configure Token Claims (CRITICAL)',
      description: 'Add roles claim to ID tokens - this is the most commonly missed step',
      status: checkedSteps.has('token-config') ? 'completed' : 'error',
      details: [
        'In your app registration, go to "Token configuration"',
        'Click "Add optional claim"',
        'Select "ID" token type',
        'Find and check "roles" in the list',
        'Click "Add"',
        'If prompted about Microsoft Graph permissions, click "Turn on the Microsoft Graph profile permission"',
        'ALSO ADD: Click "Add groups claim" if using nested groups',
        'Select "Security groups" and "Groups assigned to the application"'
      ],
      links: [
        { text: 'Microsoft Docs - Token Configuration', url: 'https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-app-roles-in-apps#configure-token-claims' }
      ]
    },
    {
      id: 'api-permissions',
      title: '4. Set API Permissions',
      description: 'Grant necessary Microsoft Graph permissions',
      status: checkedSteps.has('api-permissions') ? 'completed' : 'pending',
      details: [
        'In your app registration, go to "API permissions"',
        'Ensure these permissions are present:',
        '• Microsoft Graph → User.Read (Delegated)',
        '• Microsoft Graph → openid (Delegated)',
        '• Microsoft Graph → profile (Delegated)',
        'Click "Grant admin consent for [Your Organization]"',
        'Verify all permissions show "Granted" status'
      ]
    },
    {
      id: 'enterprise-app',
      title: '5. Assign Users to Roles',
      description: 'Assign users/groups to the app roles in Enterprise Applications',
      status: checkedSteps.has('enterprise-app') ? 'completed' : 'pending',
      details: [
        'Go to Azure Portal → Enterprise applications',
        'Find and select your application (same name as app registration)',
        'Go to "Users and groups"',
        'Click "Add user/group"',
        'Select users or groups',
        'Click "Select a role" and choose appropriate manufacturing role',
        'Click "Assign"',
        'Repeat for all users who need access'
      ],
      links: [
        { text: 'Azure Portal - Enterprise Applications', url: 'https://portal.azure.com/#view/Microsoft_AAD_IAM/StartboardApplicationsMenuBlade/~/AppAppsPreview' }
      ]
    },
    {
      id: 'nested-groups',
      title: '6. Handle Nested Groups (If Applicable)',
      description: 'Configure for users in subgroups of assigned groups',
      status: checkedSteps.has('nested-groups') ? 'completed' : 'warning',
      details: [
        'If users are in subgroups of groups assigned to app roles:',
        'Option 1 (Recommended): Assign users directly to app roles instead of through groups',
        'Option 2: In Token configuration, ensure "Groups assigned to the application" is selected',
        'Option 3: Use Microsoft Graph API to resolve nested group membership',
        'Note: Direct app role assignment is more reliable than nested group inheritance'
      ],
      links: [
        { text: 'Microsoft Q&A - Nested Groups', url: 'https://learn.microsoft.com/en-us/answers/questions/2182044/how-to-retrieve-role-claims-in-the-idtokenclaims-o' }
      ]
    },
    {
      id: 'environment-vars',
      title: '7. Configure Environment Variables',
      description: 'Set up your local environment configuration',
      status: checkedSteps.has('environment-vars') ? 'completed' : 'pending',
      details: [
        'Create/update .env.local file with:',
        'NEXT_PUBLIC_AZURE_AD_CLIENT_ID=your-client-id-here',
        'NEXT_PUBLIC_AZURE_AD_TENANT_ID=your-tenant-id-here',
        'NEXT_PUBLIC_AZURE_REDIRECT_URI=http://localhost:4000',
        'NEXT_PUBLIC_AZURE_LOGOUT_URI=http://localhost:4000/',
        'NEXT_PUBLIC_DISABLE_DEV_MODE=true',
        'NEXT_PUBLIC_ENABLE_DEMO_USER=false'
      ]
    },
    {
      id: 'test-config',
      title: '8. Test Configuration',
      description: 'Verify everything is working correctly',
      status: checkedSteps.has('test-config') ? 'completed' : 'pending',
      details: [
        'Visit /debug/role-debug in your application',
        'Login with a test user assigned to app roles',
        'Verify roles appear in "Role Sources Analysis"',
        'Check that roles are in the "Valid Manufacturing Roles" section',
        'If no roles appear, revisit steps 3-5 above'
      ]
    }
  ]

  const getStatusIcon = (status: ConfigStep['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />
      default:
        return <div className="h-5 w-5 border-2 border-gray-300 rounded-full" />
    }
  }

  const getStatusBadge = (status: ConfigStep['status']) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-500">Completed</Badge>
      case 'warning':
        return <Badge variant="secondary" className="bg-yellow-500">Needs Attention</Badge>
      case 'error':
        return <Badge variant="destructive">Critical</Badge>
      default:
        return <Badge variant="outline">Pending</Badge>
    }
  }

  const completedCount = checkedSteps.size
  const totalSteps = configSteps.length
  const progressPercentage = (completedCount / totalSteps) * 100

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Azure Configuration Checker</h1>
        <p className="text-gray-600 mb-4">
          Follow this checklist to ensure your Azure app registration is properly configured for role-based authentication.
        </p>
        
        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
            style={{ width: `${progressPercentage}%` }}
          ></div>
        </div>
        <p className="text-sm text-gray-600">
          Progress: {completedCount} of {totalSteps} steps completed ({Math.round(progressPercentage)}%)
        </p>
      </div>

      {/* Critical Information Alert */}
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5" />
            Most Common Issue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-700 mb-2">
            <strong>Step 3 (Token Configuration)</strong> is the most commonly missed step. 
            If you can login but see no roles, this is likely the issue.
          </p>
          <p className="text-sm text-red-600">
            You must explicitly add the "roles" claim to your ID tokens in the Azure Portal.
          </p>
        </CardContent>
      </Card>

      {/* Configuration Steps */}
      {configSteps.map((step) => (
        <Card key={step.id} className="relative">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-3">
                <button
                  onClick={() => toggleStep(step.id)}
                  className="flex items-center gap-2"
                >
                  {getStatusIcon(step.status)}
                  {step.title}
                </button>
                {getStatusBadge(step.status)}
              </CardTitle>
            </div>
            <CardDescription>{step.description}</CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {step.details.map((detail, index) => (
                <div key={index} className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                  <p className="text-sm">
                    {detail.includes('NEXT_PUBLIC_') ? (
                      <span className="font-mono bg-gray-100 px-1 rounded">
                        {detail}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-2 h-6 w-6 p-0"
                          onClick={() => copyToClipboard(detail)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </span>
                    ) : (
                      detail
                    )}
                  </p>
                </div>
              ))}
            </div>

            {step.links && (
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-2">Helpful Links:</p>
                <div className="space-y-1">
                  {step.links.map((link, index) => (
                    <a
                      key={index}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {link.text}
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t pt-4">
              <Button
                onClick={() => toggleStep(step.id)}
                variant={checkedSteps.has(step.id) ? "default" : "outline"}
                size="sm"
              >
                {checkedSteps.has(step.id) ? "Mark as Incomplete" : "Mark as Complete"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Next Steps */}
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="text-green-700">Next Steps</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-green-700">
            <p>After completing all steps above:</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span>Visit <code className="bg-green-100 px-1 rounded">/debug/role-debug</code> to test your configuration</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span>Check browser console for MSAL debug logs</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span>Use jwt.io to inspect your ID token for the roles claim</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 