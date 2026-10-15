# MSAL Token Persistence Troubleshooting Guide

## Current Issue: Token Persistence Not Working

If you're experiencing issues with MSAL token persistence (users losing authentication when closing/reopening browser tabs), this guide will help you diagnose and fix the problem.

## Quick Diagnosis

### Step 1: Check Your Current Configuration

Open your browser's developer console and look for these log messages when the application starts:

```
🔄 Azure AD not configured - skipping MSAL token persistence check
💡 Currently running in development mode with demo users
💡 MSAL token persistence requires real Azure AD authentication
```

If you see these messages, **your Azure AD is not properly configured** and the app is running in demo mode. MSAL token persistence cannot work without real Azure authentication.

### Step 2: Verify Environment Configuration

Check if you have a `.env.local` file in your project root with proper Azure AD configuration:

```bash
# Check if .env.local exists
ls -la .env.local

# If it exists, check its contents (without revealing secrets)
grep "NEXT_PUBLIC_AZURE" .env.local
```

## Root Cause Analysis

### Why Token Persistence Isn't Working

The MSAL token persistence implementation is **correctly configured** with:
- ✅ `cacheLocation: 'localStorage'` for cross-session persistence
- ✅ Enhanced session restoration logic
- ✅ Comprehensive token validation
- ✅ Cross-tab synchronization
- ✅ Proactive token refresh

However, **token persistence requires actual Azure AD authentication**. If Azure AD isn't configured, the app runs in development mode with demo users, and there are no real MSAL tokens to persist.

## Solution: Configure Azure AD Authentication

### Step 1: Create Azure AD App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Click **New registration**
4. Configure:
   - **Name**: Your application name (e.g., "MES UI Development")
   - **Supported account types**: Accounts in this organizational directory only
   - **Redirect URI**: Web - `http://localhost:3000`
5. Click **Register**

### Step 2: Configure App Registration

After registration, note down:
- **Application (client) ID**
- **Directory (tenant) ID**

Then configure:
1. **Authentication** > **Redirect URIs**:
   - Add `http://localhost:3000`
   - Add `http://localhost:3000/dashboard` (if needed)
   
2. **Token configuration** > **Add optional claim**:
   - Token type: ID
   - Add: `groups`, `roles` (if using role-based access)

3. **API permissions**:
   - Microsoft Graph > User.Read (should be added by default)

### Step 3: Create Environment Configuration

Create a `.env.local` file in your project root:

```bash
# Azure Entra ID Configuration for MSAL Token Persistence
NEXT_PUBLIC_AZURE_CLIENT_ID=your-application-client-id-here
NEXT_PUBLIC_AZURE_TENANT_ID=your-directory-tenant-id-here
NEXT_PUBLIC_AZURE_REDIRECT_URI=http://localhost:3000
NEXT_PUBLIC_AZURE_LOGOUT_URI=http://localhost:3000/

# Force Azure authentication (disable demo mode)
NEXT_PUBLIC_DISABLE_DEV_MODE=true
NEXT_PUBLIC_ENABLE_DEMO_USER=false
```

**Replace the placeholder values** with your actual Azure AD app registration details.

### Step 4: Restart and Test

1. **Restart your development server**:
   ```bash
   npm run dev
   ```

2. **Check the console logs** - you should now see:
   ```
   🔄 Azure configured - starting enhanced session restoration
   ⚙️ MSAL Configuration
   Client ID: configured
   ```

3. **Test the authentication flow**:
   - Navigate to your application
   - Click the login button
   - Complete Azure AD authentication
   - Verify you're logged in

4. **Test token persistence**:
   - Close the browser tab
   - Reopen the application
   - You should remain logged in (check console for success messages)

## Verification Steps

### Console Log Indicators

**✅ Working Token Persistence:**
```
🔄 Enhanced session restoration starting...
🔄 Found accounts in localStorage cache: 1
🔄 MSAL keys in localStorage: 5 ["msal.account.xxx", "msal.idtoken.xxx", ...]
🔄 Silent token acquisition successful - session restored
✅ MSAL Token Persistence Working! User session restored from localStorage
```

**❌ Not Working (Azure not configured):**
```
🔄 Azure AD not configured - skipping MSAL token persistence check
💡 Currently running in development mode with demo users
```

**❌ Not Working (No cached tokens):**
```
🔄 Found accounts in localStorage cache: 0
🔄 MSAL keys in localStorage: 0 []
🔄 No MSAL data found in localStorage
```

### Browser Storage Verification

1. Open **Developer Tools** > **Application** > **Local Storage**
2. Look for keys starting with `msal.`
3. You should see entries like:
   - `msal.account.xxx`
   - `msal.idtoken.xxx`
   - `msal.client.info.xxx`

## Common Issues and Solutions

### Issue 1: "MSAL Configuration Error: NEXT_PUBLIC_AZURE_AD_CLIENT_ID is missing"

**Cause**: Environment variables not properly set or `.env.local` file missing.

**Solution**:
1. Verify `.env.local` file exists in project root
2. Check variable names are exactly: `NEXT_PUBLIC_AZURE_CLIENT_ID`, `NEXT_PUBLIC_AZURE_TENANT_ID`
3. Restart development server after changes

### Issue 2: "Token validation failed" or tokens immediately expire

**Cause**: Clock skew, invalid token configuration, or Azure AD app misconfiguration.

**Solution**:
1. Check system clock is accurate
2. Verify Azure AD app registration redirect URIs match exactly
3. Check token configuration in Azure AD includes required claims

### Issue 3: Silent token acquisition fails

**Cause**: Network issues, Azure AD service problems, or user account changes.

**Solution**:
1. Check network connectivity
2. Verify user account is still active
3. The app should gracefully fall back to cached tokens for offline scenarios

### Issue 4: Cross-tab synchronization not working

**Cause**: localStorage events not firing or being handled properly.

**Solution**:
1. Verify both tabs are on the same domain
2. Check browser console for cross-tab sync messages
3. Test with different browsers to isolate browser-specific issues

## Testing Scenarios

### Basic Token Persistence Test
1. Login with Azure AD
2. Close browser tab
3. Reopen application
4. Verify automatic login

### Cross-Tab Synchronization Test
1. Open application in two tabs
2. Login in one tab
3. Verify other tab automatically updates authentication state

### Token Refresh Test
1. Login and wait for token to near expiration (check console logs)
2. Verify automatic token refresh occurs
3. Confirm user remains logged in

### Offline Scenario Test
1. Login with Azure AD
2. Disconnect network
3. Refresh page
4. Verify cached token allows continued access

## Advanced Debugging

### Enable Verbose MSAL Logging

The application already includes verbose MSAL logging. Check console for detailed MSAL operations:

```
[timestamp] MSAL Info: message
[timestamp] MSAL Verbose: detailed operation info
```

### Inspect Token Claims

Use the debug pages to inspect token claims:
- Navigate to `/debug/auth-status`
- Check "Token Claims" section
- Verify roles and other claims are present

### Monitor Token Analytics

The application logs token analytics events. Check console for:
- `session_restoration_success`
- `session_restoration_failed`
- `token_validation_failed`

## Support

If you continue to experience issues after following this guide:

1. **Check console logs** for specific error messages
2. **Verify Azure AD configuration** matches exactly
3. **Test with a fresh browser profile** to eliminate cache issues
4. **Review network connectivity** to Azure AD endpoints

The MSAL token persistence implementation is robust and should work reliably once Azure AD is properly configured. 