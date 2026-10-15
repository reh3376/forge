'use client'

import { useState, useEffect, useCallback } from 'react'

interface UseSidebarOptions {
  defaultOpen?: boolean
  storageKey?: string
}

interface SidebarState {
  isOpen: boolean
  collapsedSections: string[]
}

export function useSidebar(options: UseSidebarOptions = {}) {
  const { 
    defaultOpen = true, 
    storageKey = 'mes-ui-sidebar-state' 
  } = options

  // Initialize state with SSR-safe defaults
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [isLoaded, setIsLoaded] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  // Track when component is mounted to prevent hydration issues
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Debug logging for state changes
  useEffect(() => {
    if (isMounted) {
      console.log('🔄 useSidebar: State changed:', { isOpen, isLoaded, storageKey })
    }
  }, [isOpen, isLoaded, storageKey, isMounted])

  // Load state from localStorage only after mounting
  useEffect(() => {
    if (!isMounted) return

    console.log('🔄 useSidebar: Initial load effect running', { storageKey })
    
    try {
      const stored = localStorage.getItem(storageKey)
      console.log('🔄 useSidebar: Retrieved from localStorage:', stored)
      
      if (stored) {
        const state: SidebarState = JSON.parse(stored)
        console.log('🔄 useSidebar: Parsed state:', state)
        setIsOpen(state.isOpen ?? defaultOpen)
        setCollapsedSections(new Set(state.collapsedSections || []))
      }
    } catch (error) {
      console.warn('Failed to load sidebar state from localStorage:', error)
      // Reset to defaults on error
      setIsOpen(defaultOpen)
      setCollapsedSections(new Set())
    } finally {
      // Always set isLoaded to true after attempting to load
      console.log('🔄 useSidebar: Setting isLoaded to true')
      setIsLoaded(true)
    }
  }, [storageKey, defaultOpen, isMounted])

  // Save state to localStorage whenever it changes (only after initial load)
  useEffect(() => {
    if (!isLoaded || !isMounted) return

    try {
      const state: SidebarState = {
        isOpen,
        collapsedSections: Array.from(collapsedSections)
      }
      localStorage.setItem(storageKey, JSON.stringify(state))
    } catch (error) {
      console.warn('Failed to save sidebar state to localStorage:', error)
    }
  }, [isOpen, collapsedSections, storageKey, isLoaded, isMounted])

  // Toggle sidebar open/closed
  const toggle = useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  // Open sidebar
  const open = useCallback(() => {
    setIsOpen(true)
  }, [])

  // Close sidebar
  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  // Toggle section collapsed state
  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections(prev => {
      const newSet = new Set(prev)
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId)
      } else {
        newSet.add(sectionId)
      }
      return newSet
    })
  }, [])

  // Check if section is collapsed
  const isSectionCollapsed = useCallback((sectionId: string) => {
    return collapsedSections.has(sectionId)
  }, [collapsedSections])

  // Expand section
  const expandSection = useCallback((sectionId: string) => {
    setCollapsedSections(prev => {
      const newSet = new Set(prev)
      newSet.delete(sectionId)
      return newSet
    })
  }, [])

  // Collapse section
  const collapseSection = useCallback((sectionId: string) => {
    setCollapsedSections(prev => new Set(prev).add(sectionId))
  }, [])

  // Expand all sections
  const expandAll = useCallback(() => {
    setCollapsedSections(new Set())
  }, [])

  // Collapse all sections
  const collapseAll = useCallback((sectionIds: string[]) => {
    setCollapsedSections(new Set(sectionIds))
  }, [])

  // Listen for keyboard shortcut events
  useEffect(() => {
    const handleToggleSidebar = () => {
      toggle()
    }

    window.addEventListener('toggle-sidebar', handleToggleSidebar)
    
    return () => {
      window.removeEventListener('toggle-sidebar', handleToggleSidebar)
    }
  }, [toggle])

  return {
    isOpen,
    isLoaded,
    isMounted,
    collapsedSections: Array.from(collapsedSections),
    toggle,
    open,
    close,
    toggleSection,
    isSectionCollapsed,
    expandSection,
    collapseSection,
    expandAll,
    collapseAll
  }
} 