'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, XCircle, AlertTriangle, ExternalLink, Copy } from 'lucide-react'

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
        'Click "New registration"',
        'Set Name: "MES UI Application" (or your preferred name)',
        'Set Redirect URI: "Single-page application (SPA)" → http://localhost:4000',
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
        'Visit /diagnostics/role-debug in your application',
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Azure Configuration Checker</h1>
          <p className="text-muted-foreground">
            Step-by-step guide to configure Azure AD authentication for the MES UI
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">{completedCount}/{totalSteps}</div>
          <div className="text-sm text-muted-foreground">Steps Completed</div>
        </div>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration Progress</CardTitle>
          <CardDescription>
            Track your progress through the Azure AD setup process
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground mt-2">
            <span>0%</span>
            <span className="font-medium">{Math.round(progressPercentage)}% Complete</span>
            <span>100%</span>
          </div>
        </CardContent>
      </Card>

      {/* Configuration Steps */}
      <div className="space-y-4">
        {configSteps.map((step) => (
          <Card key={step.id} className="border-l-4 border-l-blue-500">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleStep(step.id)}
                    className="p-1"
                  >
                    {getStatusIcon(step.status)}
                  </Button>
                  <div>
                    <CardTitle className="text-lg">{step.title}</CardTitle>
                    <CardDescription>{step.description}</CardDescription>
                  </div>
                </div>
                {getStatusBadge(step.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {step.details.map((detail, index) => (
                  <div key={index} className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full mt-2 flex-shrink-0"></div>
                    <p className="text-sm">{detail}</p>
                    {detail.includes('NEXT_PUBLIC_') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(detail)}
                        className="p-1 ml-2"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              
              {step.links && (
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  {step.links.map((link, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      asChild
                    >
                      <a href={link.url} target="_blank" rel="noopener noreferrer">
                        {link.text}
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </a>
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle>Next Steps</CardTitle>
        </CardHeader>
        <CardContent>
          {completedCount === totalSteps ? (
            <div className="text-center space-y-2">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <h3 className="text-lg font-semibold text-green-600">Configuration Complete!</h3>
              <p className="text-muted-foreground">
                Your Azure AD configuration should now be working. Test the authentication flow and check the role assignments.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="font-semibold">What to do next:</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Complete the remaining configuration steps above</li>
                <li>Pay special attention to step 3 (Token Claims) - this is the most commonly missed step</li>
                <li>Test your configuration using the role debug page</li>
                <li>If you encounter issues, double-check steps 3-5</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 