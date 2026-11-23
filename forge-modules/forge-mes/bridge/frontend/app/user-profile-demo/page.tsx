'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import React from 'react'
import { useAuth } from '@/lib/auth-context'
import { AuthButton } from '@/components/auth/auth-button'
import { DevAuthControls, useDevAuthControls } from '@/components/auth/dev-auth-controls'
import { UserCard } from '@/components/auth/user-card'
import { UserDetailView } from '@/components/auth/user-detail-view'
import { UserDetailModal } from '@/components/auth/user-detail-modal'
import { KeyboardShortcutDisplay } from '@/components/ui/keyboard-shortcut-display'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Shield, User, Eye } from 'lucide-react'
import { PageContainer } from '@/components/ui/layout'

export default function UserProfileDemoPage() {
  const { 
    isAuthenticated, 
    user, 
    devMode
  } = useAuth()

  const { isVisible } = useDevAuthControls()

  if (!isAuthenticated) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center min-h-screen">
          <Card className="w-96">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2">
                <Shield className="h-6 w-6" />
                Authentication Required
              </CardTitle>
              <CardDescription>
                Please sign in to view the user profile components demo
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <AuthButton />
            </CardContent>
          </Card>
        </div>
        
        {/* Development Controls */}
        <DevAuthControls
          isVisible={isVisible}
          currentRole={user?.roles[0] || null}
          onRoleChange={devMode.setRole}
          onToggleAuth={devMode.setAuthenticated}
          isAuthenticated={isAuthenticated}
        />
        
        {/* Dev Controls Toggle Instructions */}
        {devMode.isEnabled && !isVisible && (
          <div className="fixed bottom-4 left-4 p-2 bg-yellow-100 dark:bg-yellow-900 border border-yellow-400 rounded text-xs text-yellow-800 dark:text-yellow-200">
            Press <kbd className="px-1 py-0.5 bg-yellow-200 dark:bg-yellow-800 rounded">Ctrl+Shift+D</kbd> for dev controls
          </div>
        )}
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <div className="container mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">User Profile Components Demo</h1>
              <p className="text-muted-foreground">
                Demonstration of user card and detail view components
              </p>
            </div>
          </div>
          <AuthButton />
        </div>

        {/* User Cards Demo */}
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold mb-4">User Card Variations</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Standard User Card */}
              <div>
                <h3 className="text-lg font-medium mb-3">Standard User Card</h3>
                <UserCard />
              </div>

              {/* Compact User Card */}
              <div>
                <h3 className="text-lg font-medium mb-3">Compact User Card</h3>
                <UserCard compact={true} />
              </div>
            </div>
          </div>

          {/* Modal Demo */}
          <div>
            <h2 className="text-2xl font-semibold mb-4">User Detail Modal</h2>
            <Card>
              <CardHeader>
                <CardTitle>Modal Trigger Examples</CardTitle>
                <CardDescription>
                  Different ways to trigger the user detail modal
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-4">
                  {/* Default Modal */}
                  <UserDetailModal />
                  
                  {/* Custom Button Modal */}
                  <UserDetailModal 
                    triggerText="View Full Profile"
                    triggerVariant="default"
                    triggerSize="default"
                  />
                  
                  {/* Icon Only Modal */}
                  <UserDetailModal 
                    trigger={
                      <Button variant="outline" size="icon">
                        <Eye className="h-4 w-4" />
                      </Button>
                    }
                  />
                  
                  {/* Link Style Modal */}
                  <UserDetailModal 
                    triggerText="See detailed permissions"
                    triggerVariant="link"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Inline Detail View */}
          <div>
            <h2 className="text-2xl font-semibold mb-4">Inline User Detail View</h2>
            <Card>
              <CardHeader>
                <CardTitle>Full User Details</CardTitle>
                <CardDescription>
                  Complete user information and permissions displayed inline
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UserDetailView showHeader={false} compact={false} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      
      {/* Development Controls */}
      <DevAuthControls
        isVisible={isVisible}
        currentRole={user?.roles[0] || null}
        onRoleChange={devMode.setRole}
        onToggleAuth={devMode.setAuthenticated}
        isAuthenticated={isAuthenticated}
      />
      
      {/* Dev Controls Toggle Instructions */}
      {devMode.isEnabled && !isVisible && (
        <div className="fixed bottom-4 left-4 p-2 bg-yellow-100 dark:bg-yellow-900 border border-yellow-400 rounded text-xs text-yellow-800 dark:text-yellow-200">
          Press <KeyboardShortcutDisplay 
            keys={{ primary: true, shift: true, key: 'D' }}
            className="bg-yellow-200 dark:bg-yellow-800"
          /> for dev controls
        </div>
      )}
    </PageContainer>
  )
} 