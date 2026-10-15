export type LayoutType = 'sidebar-left' | 'sidebar-right' | 'full-width' | 'split-view'

export interface LayoutConfig {
  id: LayoutType
  name: string
  description: string
  icon: string
  sidebarPosition?: 'left' | 'right'
  showSidebar: boolean
  contentWidth: 'full' | 'contained'
  splitView?: boolean
}

export const LAYOUT_CONFIGS: Record<LayoutType, LayoutConfig> = {
  'sidebar-left': {
    id: 'sidebar-left',
    name: 'Sidebar Left',
    description: 'Traditional layout with sidebar on the left',
    icon: 'PanelLeft',
    sidebarPosition: 'left',
    showSidebar: true,
    contentWidth: 'full'
  },
  'sidebar-right': {
    id: 'sidebar-right',
    name: 'Sidebar Right',
    description: 'Sidebar positioned on the right side',
    icon: 'PanelRight',
    sidebarPosition: 'right',
    showSidebar: true,
    contentWidth: 'full'
  },
  'full-width': {
    id: 'full-width',
    name: 'Full Width',
    description: 'Maximum content area without sidebar',
    icon: 'Maximize',
    showSidebar: false,
    contentWidth: 'full'
  },
  'split-view': {
    id: 'split-view',
    name: 'Split View',
    description: 'Dual-pane layout for enhanced productivity',
    icon: 'Columns',
    sidebarPosition: 'left',
    showSidebar: true,
    contentWidth: 'full',
    splitView: true
  }
}

export const DEFAULT_LAYOUT: LayoutType = 'full-width'

export interface LayoutPreferences {
  currentLayout: LayoutType
  sidebarCollapsed: boolean
  splitViewRatio?: number
  customSettings?: Record<string, unknown>
}

export const DEFAULT_PREFERENCES: LayoutPreferences = {
  currentLayout: DEFAULT_LAYOUT,
  sidebarCollapsed: false,
  splitViewRatio: 0.5
}

// Utility functions
export function getLayoutConfig(layoutType: LayoutType): LayoutConfig {
  return LAYOUT_CONFIGS[layoutType]
}

export function isValidLayoutType(layout: string): layout is LayoutType {
  return Object.keys(LAYOUT_CONFIGS).includes(layout)
}

export function getLayoutClass(layout: LayoutType): string {
  const config = getLayoutConfig(layout)
  const classes = ['layout-container']
  
  if (config.showSidebar) {
    classes.push(`sidebar-${config.sidebarPosition}`)
  } else {
    classes.push('no-sidebar')
  }
  
  if (config.contentWidth === 'full') {
    classes.push('content-full-width')
  }
  
  if (config.splitView) {
    classes.push('split-view')
  }
  
  return classes.join(' ')
}

export function getContentClasses(layout: LayoutType, sidebarCollapsed: boolean): string {
  const config = getLayoutConfig(layout)
  const classes = ['main-content']
  
  if (config.showSidebar && !sidebarCollapsed) {
    classes.push('with-sidebar')
    classes.push(`sidebar-${config.sidebarPosition}`)
  }
  
  if (config.contentWidth === 'full') {
    classes.push('full-width')
  }
  
  return classes.join(' ')
} 