# Dynamic Azure Authentication Redirects

This document explains how to use the dynamic redirect system for Azure AD authentication in the MES UI application.

## Overview

The dynamic redirect system allows users to be redirected back to their intended destination after Azure AD authentication, instead of always going to a fixed redirect URI like the dashboard or home page.

## Key Features

- **Automatic Intent Storage**: Automatically stores the user's intended destination when they encounter a protected route
- **Security Validation**: Validates redirect paths to prevent open redirect vulnerabilities
- **Expiration Handling**: Redirect intents expire after 10 minutes for security
- **Fallback Support**: Falls back to dashboard if no valid redirect intent exists
- **Cross-Tab Support**: Works across browser tabs and windows

## How It Works

1. **Intent Storage**: When a user tries to access a protected route while unauthenticated, the system stores their intended destination
2. **Authentication**: User is redirected to Azure AD for authentication
3. **Post-Login Redirect**: After successful authentication, user is redirected to their original intended destination
4. **Cleanup**: Redirect intent is cleared after successful redirect

## Implementation

### Core Components

#### 1. Auth Redirect Utility (`lib/auth-redirect.ts`)

Provides low-level functions for managing redirect intents:

```typescript
import { 
  storeRedirectIntent, 
  getRedirectIntent, 
  clearRedirectIntent,
  isValidRedirectPath 
} from '@/lib/auth-redirect'

// Store current location before login
storeRedirectIntent('/recipe-management/create')

// Retrieve stored intent after login
const intent = getRedirectIntent()
if (intent) {
  router.push(intent.path)
  clearRedirectIntent()
}
```

#### 2. Auth Context Integration (`lib/auth-context.tsx`)

The auth context automatically handles redirect intents:

- Stores current path before login (if not home/dashboard)
- Retrieves and redirects to stored intent after successful login
- Clears intent after redirect

#### 3. Route Guard Integration (`components/auth/route-guard.tsx`)

The RouteGuard component automatically stores redirect intent when showing the login prompt:

```typescript
// RouteGuard automatically stores the current path when user needs to authenticate
<RouteGuard config={{ requiresAuth: true }}>
  <ProtectedComponent />
</RouteGuard>
```

#### 4. Custom Hook (`hooks/use-auth-redirect.ts`)

Provides a convenient React hook for components:

```typescript
import { useAuthRedirect } from '@/hooks/use-auth-redirect'

function MyComponent() {
  const { 
    storeCurrentPath, 
    performRedirect, 
    hasStoredIntent 
  } = useAuthRedirect({
    autoStore: true, // Automatically store current path on mount
    fallbackPath: '/dashboard'
  })

  // Manual usage
  const handleProtectedAction = () => {
    if (!isAuthenticated) {
      storeCurrentPath()
      login()
    }
  }

  return (
    <button onClick={handleProtectedAction}>
      Access Protected Feature
    </button>
  )
}
```

## Usage Examples

### Example 1: Protected Route with RouteGuard

```typescript
// app/recipe-management/create/page.tsx
import { RouteGuard } from '@/components/auth/route-guard'

export default function CreateRecipePage() {
  return (
    <RouteGuard config={{ requiresAuth: true }}>
      <div>
        <h1>Create Recipe</h1>
        {/* Component content */}
      </div>
    </RouteGuard>
  )
}
```

When an unauthenticated user visits `/recipe-management/create`:
1. RouteGuard detects they need authentication
2. Stores `/recipe-management/create` as redirect intent
3. Shows login prompt
4. After login, user is redirected to `/recipe-management/create`

### Example 2: Manual Redirect Storage

```typescript
// components/navigation/nav-link.tsx
import { useAuth } from '@/lib/auth-context'
import { useAuthRedirect } from '@/hooks/use-auth-redirect'

function ProtectedNavLink({ href, children }) {
  const { isAuthenticated, login } = useAuth()
  const { storePath } = useAuthRedirect()

  const handleClick = (e) => {
    if (!isAuthenticated) {
      e.preventDefault()
      storePath(href)
      login()
    }
  }

  return (
    <Link href={href} onClick={handleClick}>
      {children}
    </Link>
  )
}
```

### Example 3: Conditional Redirect with Hook

```typescript
// components/dashboard/quick-actions.tsx
import { useAuthRedirect } from '@/hooks/use-auth-redirect'

function QuickActions() {
  const { performRedirect, hasStoredIntent } = useAuthRedirect()

  useEffect(() => {
    // After component mounts, check if user should be redirected
    if (hasStoredIntent()) {
      performRedirect()
    }
  }, [])

  return <div>Dashboard content...</div>
}
```

## Security Considerations

### Path Validation

The system validates redirect paths to prevent security vulnerabilities:

- **Allowed**: `/recipe-management/create`, `/dashboard`, `/scheduling`
- **Blocked**: `http://evil.com`, `javascript:alert()`, `//evil.com`

### Expiration

Redirect intents expire after 10 minutes to prevent:
- Stale redirects from old sessions
- Potential security issues with long-lived intents

### Storage

Redirect intents are stored in `sessionStorage` (not `localStorage`) to:
- Limit scope to current browser tab/window
- Automatically clear when browser is closed
- Prevent cross-session persistence

## Configuration

### Environment Variables

The redirect system uses the existing Azure AD configuration:

```env
# .env.local
NEXT_PUBLIC_AZURE_REDIRECT_URI=http://localhost:4000/dashboard
```

### Default Paths

Default redirect paths can be configured:

```typescript
// In your component
const { performRedirect } = useAuthRedirect({
  fallbackPath: '/custom-dashboard' // Custom fallback instead of /dashboard
})
```

## Troubleshooting

### Common Issues

1. **Redirect not working**: Check browser console for validation errors
2. **Always goes to dashboard**: Ensure path is being stored before login
3. **Redirect expires**: Intents expire after 10 minutes - this is by design

### Debug Information

Enable debug logging to see redirect flow:

```typescript
// The auth context logs redirect information to console
// Look for messages like:
// "Stored redirect intent: /recipe-management/create"
// "Found stored redirect intent, redirecting to: /recipe-management/create"
// "No valid redirect intent found, using fallback: /dashboard"
```

### Testing

Test the redirect system:

1. **Logout** from the application
2. **Navigate directly** to a protected route (e.g., `/recipe-management/create`)
3. **Login** when prompted
4. **Verify** you're redirected to the original route, not the dashboard

## Migration from Static Redirects

If you're migrating from static redirects:

1. **Remove hardcoded redirects** from login buttons/links
2. **Add RouteGuard** to protected routes
3. **Use the hook** for custom redirect logic
4. **Test thoroughly** to ensure all flows work correctly

The system is backward compatible - if no redirect intent is stored, it falls back to the dashboard as before. 