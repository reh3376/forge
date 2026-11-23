# Authentication Fix - MSAL Initialization Error

## Problem
The application was encountering a `BrowserAuthError: uninitialized_public_client_application` error when trying to search for customers. This occurred because:

1. No environment variables were configured for Azure AD authentication
2. The MSAL (Microsoft Authentication Library) instance was being created even when Azure was not configured
3. The `getMsalConfig()` function throws an error when `NEXT_PUBLIC_AZURE_AD_CLIENT_ID` is missing
4. This prevented the application from falling back to demo mode properly

## Solution
The fix involved several changes to prevent MSAL initialization when Azure is not configured:

### 1. Updated `getMsalInstance()` function
- Added a check for `isAzureActuallyConfigured()` before creating MSAL instance
- Throws a clear error message when Azure is not configured

### 2. Updated `getAuthToken()` function
- Added proper error handling for when Azure is not configured
- Returns `null` for demo mode when Azure configuration is missing
- Prevents MSAL calls when not needed

### 3. Updated `isAuthenticated()` function
- Added try-catch block to handle authentication check errors
- Properly falls back to demo mode when Azure is not configured

## Quick Fix - Demo Mode Setup

To quickly resolve this issue and use demo mode:

1. **Run the setup script:**
   ```bash
   ./setup-demo-mode.sh
   ```

2. **Restart your development server:**
   ```bash
   # Stop current server (Ctrl+C)
   npm run dev
   ```

3. **The application will now use demo mode** instead of trying to initialize MSAL

## Alternative - Manual Setup

If you prefer to set up the environment manually, create a `.env.local` file with:

```env
# Demo mode configuration
NEXT_PUBLIC_DISABLE_DEV_MODE=false
NEXT_PUBLIC_ENABLE_DEMO_USER=true

# API Configuration
NEXT_PUBLIC_MES_API_URL=http://localhost:3000/api
NEXT_PUBLIC_MES_GRAPHQL_URL=http://localhost:3000/graphql
NEXT_PUBLIC_WMS_GRAPHQL_URL=http://localhost:3020/graphql
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
```

## Production Azure Setup

For production use with actual Azure AD authentication, you'll need to configure these environment variables:

```env
NEXT_PUBLIC_AZURE_CLIENT_ID=your-azure-client-id
NEXT_PUBLIC_AZURE_TENANT_ID=your-azure-tenant-id
NEXT_PUBLIC_AZURE_REDIRECT_URI=http://localhost:4000/dashboard
NEXT_PUBLIC_AZURE_LOGOUT_URI=http://localhost:4000/
```

See `azure-env-template.txt` for the complete list of required Azure environment variables.

## How It Works

The authentication system now:

1. **Checks if Azure is configured** using `isAzureActuallyConfigured()`
2. **Uses MSAL authentication** when Azure credentials are properly configured
3. **Falls back to demo mode** when Azure is not configured
4. **Prevents MSAL initialization errors** by checking configuration before creating instances
5. **Provides clear error messages** when configuration issues occur

## Testing

After applying the fix:

1. The customer search should work without MSAL errors
2. The application should use demo mode authentication
3. You should see console messages indicating demo mode is active
4. Authentication state should be handled by `NonMSALAuthProvider`

## Files Modified

- `lib/auth-context.tsx` - Updated `getMsalInstance()` function
- `lib/auth-utils.ts` - Updated `getAuthToken()` and `isAuthenticated()` functions
- `setup-demo-mode.sh` - New script for easy demo mode setup 