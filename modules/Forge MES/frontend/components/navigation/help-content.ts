// Help content data for navigation components
// This is separated from the client component to avoid bundler issues

export interface HelpContent {
  title: string
  description: string
  shortcuts?: string[]
  tips?: string[]
  relatedActions?: Array<{
    label: string
    action: () => void
  }>
}

// Predefined help content for common navigation elements
export const navigationHelpContent = {
  sidebar: {
    title: 'Sidebar Navigation',
    description: 'Access different sections of the application and customize your workspace.',
    shortcuts: ['Ctrl + B'],
    tips: [
      'Click section headers to expand/collapse',
      'Drag the sidebar edge to resize',
      'Use keyboard shortcuts for quick navigation'
    ],
    relatedActions: [
      {
        label: 'Toggle Sidebar',
        action: () => {
          const event = new CustomEvent('toggle-sidebar')
          window.dispatchEvent(event)
        }
      }
    ]
  },
  breadcrumbs: {
    title: 'Breadcrumb Navigation',
    description: 'Shows your current location and allows quick navigation to parent pages.',
    tips: [
      'Click any breadcrumb to navigate to that page',
      'Breadcrumbs update automatically as you navigate',
      'Use the home icon to return to dashboard'
    ]
  },
  layoutSelector: {
    title: 'Layout Options',
    description: 'Customize your workspace layout for optimal productivity.',
    tips: [
      'Choose from sidebar left, right, full-width, or split view',
      'Your layout preference is saved automatically',
      'Different layouts work better for different tasks'
    ]
  },
  keyboardShortcuts: {
    title: 'Keyboard Shortcuts',
    description: 'Use keyboard shortcuts to navigate quickly and efficiently.',
    shortcuts: ['Shift + ?'],
    tips: [
      'Press Shift + ? to see all available shortcuts',
      'Shortcuts work globally except when typing in inputs',
      'Use Alt + letter for quick navigation'
    ]
  }
}

// Context-sensitive help hook
export function useContextHelp(context: string) {
  const getHelpContent = (context: string): HelpContent | null => {
    switch (context) {
      case 'sidebar':
        return navigationHelpContent.sidebar
      case 'breadcrumbs':
        return navigationHelpContent.breadcrumbs
      case 'layout':
        return navigationHelpContent.layoutSelector
      case 'shortcuts':
        return navigationHelpContent.keyboardShortcuts
      default:
        return null
    }
  }

  return {
    getHelpContent: () => getHelpContent(context),
    hasHelp: () => getHelpContent(context) !== null
  }
}
