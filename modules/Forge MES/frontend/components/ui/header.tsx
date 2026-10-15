import React from 'react'
import Link from 'next/link'
import { AuthButton } from '@/components/auth/auth-button'
import { ThemeToggle } from '@/components/theme-toggle'
import { MainNav } from '@/components/navigation/main-nav'
import { MobileNav } from '@/components/navigation/mobile-nav'
import { SidebarToggle } from '@/components/navigation/sidebar-toggle'
import { LayoutSelector } from '@/components/layout/layout-selector'
import { KeyboardShortcutsTrigger } from '@/components/navigation/keyboard-shortcuts-dialog'
import { HelpTooltip } from '@/components/navigation/help-tooltip'
import { navigationHelpContent } from '@/components/navigation/help-content'
import { LogoAuto } from '@/components/ui/logo'

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center pl-4 pr-0 w-full">
        {/* Mobile Navigation - far left on mobile */}
        <MobileNav />
        
        {/* Logo and Brand */}
        <div className="flex items-center space-x-4">
          {/* Desktop-only sidebar toggle */}
          <div className="hidden md:block">
            <SidebarToggle />
          </div>
          <Link href="/" className="flex items-center space-x-3">
            <LogoAuto 
              variant="horizontal" 
              size="md" 
              priority={true}
              className="h-8 w-auto"
            />
            <div className="hidden sm:flex flex-col">
              <span className="text-xs text-muted-foreground leading-none">MES</span>
            </div>
          </Link>
        </div>

        {/* Desktop Navigation - Centered */}
        <div className="absolute left-1/2 transform -translate-x-1/2">
          <MainNav className="hidden md:flex" />
        </div>

        {/* Spacer to push right controls to the edge */}
        <div className="flex-1" />

        {/* Right side controls - pushed to the right edge */}
        <div className="flex items-center space-x-2">
          {/* Desktop-only controls */}
          <div className="hidden md:flex items-center space-x-2">
            <HelpTooltip 
              content={navigationHelpContent.keyboardShortcuts}
              side="bottom"
            />
            <KeyboardShortcutsTrigger />
            <LayoutSelector mode="dropdown" />
          </div>
          
          {/* Always visible controls (mobile and desktop) */}
          <ThemeToggle />
          <AuthButton />
        </div>
      </div>
    </header>
  )
} 