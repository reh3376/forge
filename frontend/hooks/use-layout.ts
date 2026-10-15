'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  LayoutType, 
  LayoutPreferences, 
  DEFAULT_PREFERENCES, 
  getLayoutConfig,
  isValidLayoutType 
} from '@/lib/layout'

const STORAGE_KEY = 'workspace-layout-preferences'

export function useLayout() {
  const [preferences, setPreferences] = useState<LayoutPreferences>(DEFAULT_PREFERENCES)
  const [isLoading, setIsLoading] = useState(true)
  const [isMounted, setIsMounted] = useState(false)

  // Set mounted state to prevent hydration issues
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Load preferences from localStorage only after mounting
  useEffect(() => {
    if (!isMounted) return
    
    setIsLoading(true)
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      console.log('📖 Loading layout preferences:', { stored })
      
      if (stored) {
        const parsed = JSON.parse(stored) as LayoutPreferences
        
        // Validate the stored layout type
        if (isValidLayoutType(parsed.currentLayout)) {
          console.log('✅ Loaded valid layout preferences:', parsed)
          setPreferences(parsed)
        } else {
          // Invalid layout, use defaults
          console.warn('⚠️ Invalid stored layout, using defaults')
          setPreferences(DEFAULT_PREFERENCES)
        }
      } else {
        // No stored preferences, use defaults
        console.log('📖 No stored preferences, using defaults')
        setPreferences(DEFAULT_PREFERENCES)
      }
    } catch (error) {
      console.warn('Failed to load layout preferences:', error)
      setPreferences(DEFAULT_PREFERENCES)
    } finally {
      setIsLoading(false)
    }
  }, [isMounted])

  // Save preferences to localStorage whenever they change (only after initial load)
  useEffect(() => {
    if (!isMounted || isLoading) return
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
      console.log('💾 Saved layout preferences:', preferences)
    } catch (error) {
      console.warn('Failed to save layout preferences:', error)
    }
  }, [preferences, isMounted, isLoading])

  // Get current layout configuration
  const currentConfig = getLayoutConfig(preferences.currentLayout)

  // Derived state
  const shouldShowSidebar = currentConfig.showSidebar
  const sidebarCollapsed = preferences.sidebarCollapsed
  const splitViewRatio = preferences.splitViewRatio

  // Update layout
  const setLayout = useCallback((layoutType: LayoutType) => {
    console.log('🔄 Setting layout to:', layoutType)
    
    if (!isValidLayoutType(layoutType)) {
      console.warn('⚠️ Invalid layout type:', layoutType)
      return
    }

    setPreferences(prev => {
      const newPrefs = {
        ...prev,
        currentLayout: layoutType
      }
      console.log('🔄 Layout preferences updated:', newPrefs)
      return newPrefs
    })

    // Force a small delay to ensure state has updated before dispatching event
    setTimeout(() => {
      // Dispatch custom event for components that need to react to layout changes
      if (typeof window !== 'undefined') {
        const event = new CustomEvent('layout-changed', {
          detail: { layoutType, config: getLayoutConfig(layoutType) }
        })
        console.log('🔄 Dispatching layout-changed event:', event.detail)
        window.dispatchEvent(event)
      }
    }, 0)
  }, [])

  // Toggle sidebar collapsed state
  const toggleSidebarCollapsed = useCallback(() => {
    setPreferences(prev => ({
      ...prev,
      sidebarCollapsed: !prev.sidebarCollapsed
    }))
  }, [])

  // Set sidebar collapsed state
  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setPreferences(prev => ({
      ...prev,
      sidebarCollapsed: collapsed
    }))
  }, [])

  // Update split view ratio
  const setSplitViewRatio = useCallback((ratio: number) => {
    const clampedRatio = Math.max(0.2, Math.min(0.8, ratio))
    setPreferences(prev => ({
      ...prev,
      splitViewRatio: clampedRatio
    }))
  }, [])

  // Reset to defaults
  const resetLayout = useCallback(() => {
    console.log('🔄 Resetting layout to defaults')
    setPreferences(DEFAULT_PREFERENCES)
    
    // Clear localStorage
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (error) {
      console.warn('Failed to clear layout preferences:', error)
    }
  }, [])

  return {
    // State
    preferences,
    currentLayout: preferences.currentLayout,
    currentConfig,
    isLoading,
    isMounted,
    
    // Derived state
    shouldShowSidebar,
    sidebarCollapsed,
    splitViewRatio,
    
    // Actions
    setLayout,
    toggleSidebarCollapsed,
    setSidebarCollapsed,
    setSplitViewRatio,
    resetLayout
  }
} 