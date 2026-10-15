"use client"

import React, { useContext, useEffect, useState } from 'react'
import { FactoryAccessibilityContext } from './accessibility'

interface FactoryAccessibilityProviderProps {
  children: React.ReactNode
  defaultGloveMode?: boolean
  defaultHighContrast?: boolean
  defaultSoundEnabled?: boolean
  defaultFontSize?: 'small' | 'normal' | 'large'
}

interface FactoryAccessibilityState {
  gloveMode: boolean
  highContrast: boolean
  soundEnabled: boolean
  fontSize: 'small' | 'normal' | 'large'
  setGloveMode: (enabled: boolean) => void
  setHighContrast: (enabled: boolean) => void
  setSoundEnabled: (enabled: boolean) => void
  setFontSize: (size: 'small' | 'normal' | 'large') => void
  resetToDefaults: () => void
  exportSettings: () => string
  importSettings: (settings: string) => boolean
}

const STORAGE_KEY = 'mes-ui-accessibility'

export function FactoryAccessibilityProvider({ 
  children,
  defaultGloveMode = false,
  defaultHighContrast = false,
  defaultSoundEnabled = true,
  defaultFontSize = 'normal' 
}: FactoryAccessibilityProviderProps) {
  const [gloveMode, setGloveModeState] = useState(defaultGloveMode)
  const [highContrast, setHighContrastState] = useState(defaultHighContrast)
  const [soundEnabled, setSoundEnabledState] = useState(defaultSoundEnabled)
  const [fontSize, setFontSizeState] = useState<'small' | 'normal' | 'large'>(defaultFontSize)
  const [isLoaded, setIsLoaded] = useState(false)

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const settings = JSON.parse(stored)
        setGloveModeState(settings.gloveMode ?? defaultGloveMode)
        setHighContrastState(settings.highContrast ?? defaultHighContrast)
        setSoundEnabledState(settings.soundEnabled ?? defaultSoundEnabled)
        setFontSizeState(settings.fontSize ?? defaultFontSize)
      }
    } catch (error) {
      console.warn('Failed to load accessibility settings:', error)
    } finally {
      setIsLoaded(true)
    }
  }, [defaultGloveMode, defaultHighContrast, defaultSoundEnabled, defaultFontSize])

  // Save settings to localStorage whenever they change
  useEffect(() => {
    if (!isLoaded) return
    
    try {
      const settings = {
        gloveMode,
        highContrast,
        soundEnabled,
        fontSize
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch (error) {
      console.warn('Failed to save accessibility settings:', error)
    }
  }, [gloveMode, highContrast, soundEnabled, fontSize, isLoaded])

  const setGloveMode = (enabled: boolean) => {
    setGloveModeState(enabled)
  }

  const setHighContrast = (enabled: boolean) => {
    setHighContrastState(enabled)
  }

  const setSoundEnabled = (enabled: boolean) => {
    setSoundEnabledState(enabled)
  }

  const setFontSize = (size: 'small' | 'normal' | 'large') => {
    setFontSizeState(size)
  }

  const resetToDefaults = () => {
    setGloveModeState(defaultGloveMode)
    setHighContrastState(defaultHighContrast)
    setSoundEnabledState(defaultSoundEnabled)
    setFontSizeState(defaultFontSize)
  }

  const exportSettings = () => {
    const settings = {
      gloveMode,
      highContrast,
      soundEnabled,
      fontSize,
      exportedAt: new Date().toISOString()
    }
    return JSON.stringify(settings, null, 2)
  }

  const importSettings = (settingsJson: string): boolean => {
    try {
      const settings = JSON.parse(settingsJson)
      
      if (typeof settings.gloveMode === 'boolean') {
        setGloveModeState(settings.gloveMode)
      }
      if (typeof settings.highContrast === 'boolean') {
        setHighContrastState(settings.highContrast)
      }
      if (typeof settings.soundEnabled === 'boolean') {
        setSoundEnabledState(settings.soundEnabled)
      }
      if (['small', 'normal', 'large'].includes(settings.fontSize)) {
        setFontSizeState(settings.fontSize)
      }
      
      return true
    } catch (error) {
      console.warn('Failed to import accessibility settings:', error)
      return false
    }
  }

  const contextValue: FactoryAccessibilityState = {
    gloveMode,
    highContrast,
    soundEnabled,
    fontSize,
    setGloveMode,
    setHighContrast,
    setSoundEnabled,
    setFontSize,
    resetToDefaults,
    exportSettings,
    importSettings
  }

  // Apply font size to document root
  useEffect(() => {
    if (!isLoaded) return

    const fontSizeMap = {
      small: '14px',
      normal: '16px',
      large: '18px'
    }
    
    document.documentElement.style.fontSize = fontSizeMap[fontSize]
    
    return () => {
      document.documentElement.style.fontSize = ''
    }
  }, [fontSize, isLoaded])

  // Apply high contrast mode to document
  useEffect(() => {
    if (!isLoaded) return

    if (highContrast) {
      document.documentElement.classList.add('factory-high-contrast')
    } else {
      document.documentElement.classList.remove('factory-high-contrast')
    }
    
    return () => {
      document.documentElement.classList.remove('factory-high-contrast')
    }
  }, [highContrast, isLoaded])

  return (
    <FactoryAccessibilityContext.Provider value={contextValue}>
      {children}
    </FactoryAccessibilityContext.Provider>
  )
}

export function useFactoryAccessibility(): FactoryAccessibilityState {
  const context = useContext(FactoryAccessibilityContext)
  
  if (!context) {
    throw new Error('useFactoryAccessibility must be used within a FactoryAccessibilityProvider')
  }
  
  return context as FactoryAccessibilityState
}

// Higher-order component for automatic accessibility wrapping
export function withFactoryAccessibility<P extends object>(
  Component: React.ComponentType<P>
) {
  return function WrappedComponent(props: P) {
    const { gloveMode, highContrast } = useFactoryAccessibility()
    
    return (
      <div 
        className={`factory-accessibility-wrapper ${gloveMode ? 'glove-mode' : ''} ${highContrast ? 'high-contrast' : ''}`}
        data-glove-mode={gloveMode}
        data-high-contrast={highContrast}
      >
        <Component {...props} />
      </div>
    )
  }
}

// Hook for keyboard navigation enhancements
export function useFactoryKeyboard() {
  const { gloveMode } = useFactoryAccessibility()
  
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Enhanced keyboard navigation for glove mode
      if (gloveMode) {
        // Make Tab navigation more visible
        if (event.key === 'Tab') {
          document.body.classList.add('keyboard-navigation')
        }
        
        // Add support for Enter key on focusable elements
        if (event.key === 'Enter') {
          const target = event.target as HTMLElement
          if (target.matches('button, [role="button"], [tabindex="0"]')) {
            target.click()
          }
        }
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        setTimeout(() => {
          document.body.classList.remove('keyboard-navigation')
        }, 3000)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
    }
  }, [gloveMode])
}

// Component for accessibility status announcements
export function AccessibilityStatusAnnouncer() {
  const { gloveMode, highContrast, soundEnabled, fontSize } = useFactoryAccessibility()
  const [announcement, setAnnouncement] = useState('')
  
  useEffect(() => {
    const settings = []
    if (gloveMode) settings.push('Glove mode enabled')
    if (highContrast) settings.push('High contrast mode enabled')
    if (!soundEnabled) settings.push('Sound alerts disabled')
    if (fontSize !== 'normal') settings.push(`Font size set to ${fontSize}`)
    
    if (settings.length > 0) {
      setAnnouncement(`Accessibility settings: ${settings.join(', ')}`)
    } else {
      setAnnouncement('Standard accessibility settings')
    }
  }, [gloveMode, highContrast, soundEnabled, fontSize])
  
  return (
    <div 
      aria-live="polite" 
      aria-atomic="true" 
      className="sr-only"
    >
      {announcement}
    </div>
  )
} 