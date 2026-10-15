'use client'

import { formatKeyboardShortcut } from '@/lib/platform-utils'

interface KeyboardShortcutDisplayProps {
  keys: {
    ctrl?: boolean
    alt?: boolean
    shift?: boolean
    meta?: boolean
    primary?: boolean // Uses Cmd on Mac, Ctrl on others
    key: string
  }
  className?: string
}

export function KeyboardShortcutDisplay({ keys, className = '' }: KeyboardShortcutDisplayProps) {
  // Handle the primary modifier shorthand
  const modifiers = keys.primary 
    ? { 
        alt: keys.alt || false,
        shift: keys.shift || false,
        key: keys.key,
        // Use platform-appropriate primary modifier
        ...(typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0 
          ? { meta: true, ctrl: false } 
          : { ctrl: true, meta: false }
        )
      }
    : {
        ctrl: keys.ctrl || false,
        alt: keys.alt || false,
        shift: keys.shift || false,
        meta: keys.meta || false,
        key: keys.key
      }

  const shortcutString = formatKeyboardShortcut(modifiers)

  return (
    <kbd className={`px-1 py-0.5 bg-muted rounded text-xs font-mono ${className}`}>
      {shortcutString}
    </kbd>
  )
} 