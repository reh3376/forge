/**
 * Platform detection and keyboard shortcut utilities
 */

// Detect if user is on Mac - use function to avoid SSR issues
export const isMac = () => typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0

// Detect if user is on Windows - use function to avoid SSR issues
export const isWindows = () => typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('WIN') >= 0

// Detect if user is on Linux - use function to avoid SSR issues
export const isLinux = () => typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('LINUX') >= 0

/**
 * Get platform-appropriate modifier key symbols
 */
export const getModifierSymbols = () => ({
  ctrl: isMac() ? '⌃' : 'Ctrl',
  alt: isMac() ? '⌥' : 'Alt', 
  shift: isMac() ? '⇧' : 'Shift',
  meta: isMac() ? '⌘' : 'Meta',
  escape: isMac() ? '⎋' : 'Esc'
})

/**
 * Format a keyboard shortcut string for the current platform
 */
export const formatKeyboardShortcut = (keys: {
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  meta?: boolean
  key: string
}): string => {
  const symbols = getModifierSymbols()
  const parts: string[] = []
  
  if (keys.ctrl) parts.push(symbols.ctrl)
  if (keys.alt) parts.push(symbols.alt)
  if (keys.shift) parts.push(symbols.shift)
  if (keys.meta) parts.push(symbols.meta)
  
  // Format key name
  let keyName = keys.key.toUpperCase()
  if (keyName === 'ESCAPE') keyName = symbols.escape
  if (keyName === '?') keyName = '?'
  
  parts.push(keyName)
  
  // Use different separators for Mac vs other platforms
  return parts.join(isMac() ? '' : ' + ')
}

/**
 * Get the primary modifier key for the current platform
 * Returns 'metaKey' for Mac, 'ctrlKey' for others
 */
export const getPrimaryModifier = (): 'metaKey' | 'ctrlKey' => {
  return isMac() ? 'metaKey' : 'ctrlKey'
}

/**
 * Check if a keyboard event matches the expected modifiers for the current platform
 */
export const matchesModifiers = (
  event: KeyboardEvent,
  expected: {
    ctrl?: boolean
    alt?: boolean
    shift?: boolean
    meta?: boolean
    primary?: boolean // Uses Cmd on Mac, Ctrl on others
  }
): boolean => {
  const actualCtrl = expected.primary ? (isMac() ? event.metaKey : event.ctrlKey) : event.ctrlKey
  const actualMeta = expected.primary ? false : event.metaKey
  
  return (
    !!expected.ctrl === actualCtrl &&
    !!expected.alt === event.altKey &&
    !!expected.shift === event.shiftKey &&
    !!expected.meta === actualMeta
  )
} 