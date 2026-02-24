'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import React from 'react'
import { useAuth } from '@/lib/auth-context'
import { AuthButton } from '@/components/auth/auth-button'
import { DevAuthControls, useDevAuthControls } from '@/components/auth/dev-auth-controls'
import { UserDetailView } from '@/components/auth/user-detail-view'
import { KeyboardShortcutDisplay } from '@/components/ui/keyboard-shortcut-display'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Shield, User } from 'lucide-react'
import { PageContainer } from '@/components/ui/layout'

export default function UserDetailsPage() {
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
                Please sign in to view your user details and permissions
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
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">My Profile & Permissions</h1>
              <p className="text-muted-foreground">
                Your access rights and system capabilities
              </p>
            </div>
          </div>
          <AuthButton />
        </div>

        {/* User Detail View */}
        <UserDetailView showHeader={false} />
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