'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { isMac, formatKeyboardShortcut } from '@/lib/platform-utils'

export interface KeyboardShortcut {
  key: string
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  metaKey?: boolean
  description: string
  action: () => void
  category: string
}

export interface KeyboardShortcutCategory {
  name: string
  shortcuts: KeyboardShortcut[]
}

export function useKeyboardShortcuts() {
  const router = useRouter()
  const [isClient, setIsClient] = useState(false)
  const [isMacPlatform, setIsMacPlatform] = useState(false)

  // Set up client-side detection
  useEffect(() => {
    setIsClient(true)
    setIsMacPlatform(isMac())
  }, [])

  // Define shortcuts with stable reference
  const shortcuts: KeyboardShortcut[] = useMemo(() => {
    if (!isClient) return [] // Don't define shortcuts until client-side
    
    return [
      // Navigation shortcuts - using Option/Alt + Shift to avoid conflicts
      {
        key: 'd',
        altKey: true,
        shiftKey: true,
        description: 'Go to Dashboard',
        action: () => {
          console.log('🎯 Navigation shortcut triggered: Dashboard')
          router.push('/')
        },
        category: 'Navigation'
      },
      {
        key: 'r',
        altKey: true,
        shiftKey: true,
        description: 'Go to Recipe Management',
        action: () => {
          console.log('🎯 Navigation shortcut triggered: Recipe Management')
          router.push('/recipe-management')
        },
        category: 'Navigation'
      },
      {
        key: 's',
        altKey: true,
        shiftKey: true,
        description: 'Go to Scheduling',
        action: () => {
          console.log('🎯 Navigation shortcut triggered: Scheduling')
          router.push('/scheduling')
        },
        category: 'Navigation'
      },
      {
        key: 'c',
        altKey: true,
        shiftKey: true,
        description: 'Go to Configuration',
        action: () => {
          console.log('🎯 Navigation shortcut triggered: Configuration')
          router.push('/configuration')
        },
        category: 'Navigation'
      },
      // Layout shortcuts - using Cmd/Ctrl + Shift to avoid conflicts
      {
        key: 'b',
        shiftKey: true,
        ...(isMacPlatform ? { metaKey: true } : { ctrlKey: true }),
        description: 'Toggle Sidebar',
        action: () => {
          console.log('🎯 Layout shortcut triggered: Toggle Sidebar')
          const event = new CustomEvent('toggle-sidebar')
          window.dispatchEvent(event)
          toast.info('Sidebar toggle triggered')
        },
        category: 'Layout'
      },
      {
        key: 'p',
        shiftKey: true,
        ...(isMacPlatform ? { metaKey: true } : { ctrlKey: true }),
        description: 'Open Command Palette',
        action: () => {
          console.log('🎯 Search shortcut triggered: Command Palette')
          const event = new CustomEvent('open-command-palette')
          window.dispatchEvent(event)
          toast.info('Command palette triggered')
        },
        category: 'Search'
      },
      // Alternative navigation using just Alt (Option) with less common letters
      {
        key: 'j',
        altKey: true,
        description: 'Quick Dashboard',
        action: () => {
          console.log('🎯 Quick navigation: Dashboard')
          router.push('/')
        },
        category: 'Quick Navigation'
      },
      {
        key: 'u',
        altKey: true,
        description: 'Quick Recipe Management',
        action: () => {
          console.log('🎯 Quick navigation: Recipe Management')
          router.push('/recipe-management')
        },
        category: 'Quick Navigation'
      },
      // Help shortcuts
      {
        key: '?',
        shiftKey: true,
        description: 'Show Keyboard Shortcuts',
        action: () => {
          console.log('🎯 Help shortcut triggered: Show Shortcuts')
          const event = new CustomEvent('show-shortcuts-help')
          window.dispatchEvent(event)
        },
        category: 'Help'
      },
      {
        key: 'Escape',
        description: 'Close Modals/Overlays',
        action: () => {
          console.log('🎯 General shortcut triggered: Close Overlays')
          const event = new CustomEvent('close-overlays')
          window.dispatchEvent(event)
          toast.info('Close overlays triggered')
        },
        category: 'General'
      }
    ]
  }, [router, isMacPlatform, isClient])

  // Group shortcuts by category
  const shortcutCategories: KeyboardShortcutCategory[] = useMemo(() => {
    return shortcuts.reduce((acc, shortcut) => {
      const existingCategory = acc.find(cat => cat.name === shortcut.category)
      if (existingCategory) {
        existingCategory.shortcuts.push(shortcut)
      } else {
        acc.push({
          name: shortcut.category,
          shortcuts: [shortcut]
        })
      }
      return acc
    }, [] as KeyboardShortcutCategory[])
  }, [shortcuts])

  // Handle keyboard events - use useCallback with stable dependencies
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement ||
      (event.target as HTMLElement)?.contentEditable === 'true'
    ) {
      return
    }

    // Debug logging
    console.log('🔍 Keyboard event:', {
      key: event.key,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      platform: isMacPlatform ? 'Mac' : 'Other',
      shortcutsCount: shortcuts.length
    })

    // Find matching shortcut
    const matchingShortcut = shortcuts.find(shortcut => {
      const matches = (
        shortcut.key.toLowerCase() === event.key.toLowerCase() &&
        !!shortcut.ctrlKey === event.ctrlKey &&
        !!shortcut.altKey === event.altKey &&
        !!shortcut.shiftKey === event.shiftKey &&
        !!shortcut.metaKey === event.metaKey
      )
      
      if (matches) {
        console.log('✅ Found matching shortcut:', shortcut.description)
      }
      
      return matches
    })

    if (matchingShortcut) {
      console.log('🚀 Executing shortcut:', matchingShortcut.description)
      event.preventDefault()
      event.stopPropagation()
      matchingShortcut.action()
    } else {
      console.log('❌ No matching shortcut found')
    }
  }, [shortcuts, isMacPlatform])

  // Set up event listeners - only recreate when shortcuts actually change
  useEffect(() => {
    if (!isClient || shortcuts.length === 0) return // Don't set up listeners until we have shortcuts
    
    console.log('🎧 Setting up keyboard event listeners', {
      platform: isMacPlatform ? 'Mac' : 'Other',
      shortcutsCount: shortcuts.length
    })
    
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      console.log('🧹 Cleaning up keyboard event listeners')
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown, isClient, shortcuts.length])

  // Utility functions
  const getShortcutString = useCallback((shortcut: KeyboardShortcut): string => {
    return formatKeyboardShortcut({
      ctrl: shortcut.ctrlKey || false,
      alt: shortcut.altKey || false,
      shift: shortcut.shiftKey || false,
      meta: shortcut.metaKey || false,
      key: shortcut.key
    })
  }, [])

  const getShortcutsByCategory = useCallback((category: string): KeyboardShortcut[] => {
    return shortcuts.filter(shortcut => shortcut.category === category)
  }, [shortcuts])

  return {
    shortcuts,
    shortcutCategories,
    getShortcutString,
    getShortcutsByCategory,
    isMac: isMacPlatform,
    isClient
  }
} 