# Layout Components Migration Guide

## Overview

The deprecated layout components have been removed from `components/ui/layout.tsx`. This guide helps you migrate to the modern layout and navigation system.

## What Changed

### Removed Components
- `MESSidebar` - Deprecated sidebar component
- `MESHeader` - Deprecated header component
- `PageContainer` sidebar/header functionality - The `showSidebar` and `showHeader` props are no longer supported

### Modern Alternatives
- `components/ui/header.tsx` - New header component with modern navigation
- `components/navigation/sidebar.tsx` - New sidebar component
- `components/layout/workspace-layout.tsx` - Modern layout system with sidebar support
- `hooks/use-sidebar.ts` - Sidebar state management
- `hooks/use-navigation.ts` - Navigation state management

## Migration Steps

### 1. Replace MESHeader with Header

**Before (Deprecated):**
```tsx
import { MESHeader } from '@/components/ui/layout'

export default function MyLayout() {
  return (
    <div>
      <MESHeader 
        productionStatus={{
          activeLines: 3,
          totalLines: 5,
          currentShift: 'Day Shift',
          efficiency: 87
        }}
      />
      <main>Content</main>
    </div>
  )
}
```

**After (Recommended):**
```tsx
import { Header } from '@/components/ui/header'

export default function MyLayout() {
  return (
    <div>
      <Header />
      <main>Content</main>
    </div>
  )
}
```

### 2. Replace PageContainer with WorkspaceLayout

**Before (Deprecated):**
```tsx
import { PageContainer } from '@/components/ui/layout'

export default function MyPage() {
  return (
    <PageContainer showSidebar={true} showHeader={true}>
      <div>My content</div>
    </PageContainer>
  )
}
```

**After (Recommended):**
```tsx
import { WorkspaceLayout } from '@/components/layout/workspace-layout'

export default function MyPage() {
  return (
    <WorkspaceLayout>
      <div>My content</div>
    </WorkspaceLayout>
  )
}
```

### 3. Using PageContainer without Header/Sidebar

If you don't need header or sidebar functionality, you can continue using `PageContainer`:

```tsx
import { PageContainer } from '@/components/ui/layout'

export default function MyPage() {
  return (
    <PageContainer>
      <div>My content</div>
    </PageContainer>
  )
}
```

### 4. Custom Layout Implementation

If you need a custom sidebar, use the new sidebar components directly:

```tsx
import { Sidebar } from '@/components/navigation/sidebar'
import { useSidebar } from '@/hooks/use-sidebar'

export default function MyLayout({ children }: { children: React.ReactNode }) {
  const { isOpen } = useSidebar()
  
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className={cn(
        "flex-1 transition-all duration-300",
        isOpen ? "md:ml-64" : "md:ml-16"
      )}>
        {children}
      </main>
    </div>
  )
}
```

## Features of the New Layout System

### Header Component Features
1. **Modern Navigation**
   - Integrated main navigation with active state indicators
   - Mobile-responsive navigation with hamburger menu
   - Sidebar toggle integration

2. **Enhanced Controls**
   - Layout selector for switching between different layouts
   - Keyboard shortcuts trigger
   - Help tooltips with contextual information
   - Theme toggle and authentication controls

3. **Responsive Design**
   - Sticky positioning with backdrop blur
   - Mobile-first navigation patterns
   - Adaptive spacing and sizing

### Sidebar Component Features
1. **Responsive Design**
   - Automatically adapts to mobile and desktop
   - Collapsible on desktop
   - Overlay on mobile

2. **State Management**
   - Persistent state using localStorage
   - Keyboard shortcuts support
   - Section collapse/expand functionality

3. **Accessibility**
   - Proper ARIA labels
   - Keyboard navigation
   - Screen reader support

4. **Customization**
   - Configurable position (left/right)
   - Theme support
   - Custom navigation sections

## Layout System Integration

The new sidebar integrates with the layout system:

```tsx
import { useLayout } from '@/hooks/use-layout'

// Layout automatically determines sidebar visibility and position
const { shouldShowSidebar, currentConfig } = useLayout()
```

## Troubleshooting

### Hydration Issues
If you experience hydration mismatches, ensure you're using the `HydrationBoundary`:

```tsx
import { HydrationBoundary } from '@/components/layout/hydration-boundary'
import { SidebarSkeleton } from '@/components/navigation/sidebar-skeleton'

<HydrationBoundary fallback={<SidebarSkeleton position="left" />}>
  <Sidebar />
</HydrationBoundary>
```

### State Not Persisting
Check that localStorage is available and the `useSidebar` hook is properly initialized:

```tsx
const { isLoaded } = useSidebar()

if (!isLoaded) {
  return <SidebarSkeleton />
}
```

## Related Files

- `components/ui/header.tsx` - Main header component
- `components/navigation/main-nav.tsx` - Desktop navigation
- `components/navigation/mobile-nav.tsx` - Mobile navigation
- `components/navigation/sidebar.tsx` - Main sidebar component
- `components/layout/workspace-layout.tsx` - Layout wrapper
- `hooks/use-sidebar.ts` - Sidebar state management
- `hooks/use-navigation.ts` - Navigation state management
- `hooks/use-layout.ts` - Layout configuration
- `lib/navigation.ts` - Navigation configuration

## Need Help?

If you encounter issues during migration, check:
1. The layout debug page at `/layout-debug`
2. Browser console for sidebar state logs
3. The existing implementations in the codebase for reference 