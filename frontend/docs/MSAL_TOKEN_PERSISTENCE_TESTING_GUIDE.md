# MSAL Token Persistence Testing Guide

## Overview

This guide helps you test and verify that MSAL token persistence is working correctly. The implementation is complete, but you need to properly configure Azure AD to see it in action.

## Quick Test Steps

### 1. Check Current Token Status

Visit the debug page to inspect your current localStorage:
```
http://localhost:3000/debug/token-inspection
```

This page will show you:
- How many MSAL tokens are stored in localStorage
- Whether tokens are valid or expired
- Token expiration times and freshness
- Detailed token information including claims

### 2. Test Token Persistence (With Azure AD)

**Prerequisites:**
- Azure AD tenant and app registration
- `.env.local` file with proper Azure configuration
- `NEXT_PUBLIC_DISABLE_DEV_MODE=true` to disable demo mode

**Steps:**
1. **Login with Azure AD**: Use the real Azure AD login (not demo mode)
2. **Verify Token Storage**: Check the debug page to see valid tokens in localStorage
3. **Close Browser Tab**: Close the tab completely
4. **Reopen Application**: Navigate back to the application
5. **Verify Session Restoration**: You should be automatically logged in without needing to re-authenticate

### 3. Test Token Expiration Handling

**Steps:**
1. **Login with Azure AD**: Authenticate normally
2. **Wait for Token Expiration**: Tokens typically expire after 1 hour
3. **Check Debug Page**: You should see expired tokens marked as "EXPIRED"
4. **Trigger Cleanup**: Use the "Clean Up Expired Tokens" button
5. **Verify Cleanup**: Expired tokens should be removed from localStorage

## Understanding the Debug Output

### Console Logs to Look For

When the application starts, look for these console messages:

**✅ Token Persistence Working:**
```
🔍 MSAL localStorage Token Inspection
Found X MSAL keys in localStorage
📊 Token Storage Summary: { hasValidTokens: true, ... }
✅ Found valid tokens in localStorage - token persistence is working
🔄 Silent token acquisition successful - session restored
✅ MSAL Token Persistence Working! User session restored from localStorage
```

**❌ No Azure Configuration:**
```
🔄 Azure AD not configured - skipping MSAL token persistence check
💡 To test MSAL token persistence:
   1. Create .env.local file with Azure AD credentials
   ...
```

**⚠️ Expired Tokens:**
```
⚠️ Found expired tokens in localStorage - these should be cleaned up
🔍 Token validation failed: ["Token has expired"]
🧹 Starting expired token cleanup...
```

### Debug Page Indicators

The debug page shows several key indicators:

1. **Token Count**: Number of MSAL keys in localStorage
2. **Storage Size**: Total size of MSAL data
3. **Has Valid Tokens**: Whether any tokens are still valid
4. **Has Expired Tokens**: Whether cleanup is needed

## Common Issues and Solutions

### Issue: "No MSAL data found in localStorage"

**Cause**: User has never logged in with Azure AD, or localStorage was cleared.

**Solution**: 
- Ensure Azure AD is properly configured
- Login with real Azure AD credentials (not demo mode)
- Check that `NEXT_PUBLIC_DISABLE_DEV_MODE=true`

### Issue: "Found MSAL tokens but none are valid"

**Cause**: All tokens have expired.

**Solution**:
- Use the "Clean Up Expired Tokens" button
- Login again to get fresh tokens
- Check token expiration times in the debug page

### Issue: "Token validation failed"

**Cause**: Token structure is invalid or claims are missing.

**Solution**:
- Clear localStorage completely
- Re-login with Azure AD
- Check Azure AD app registration configuration

## Azure AD Configuration Requirements

For token persistence to work, you need:

### Environment Variables (.env.local)
```bash
# Azure AD Configuration
NEXT_PUBLIC_AZURE_CLIENT_ID=your-client-id
NEXT_PUBLIC_AZURE_TENANT_ID=your-tenant-id

# Disable demo mode to use real Azure AD
NEXT_PUBLIC_DISABLE_DEV_MODE=true
```

### Azure AD App Registration
- **Platform**: Single-page application (SPA)
- **Redirect URIs**: Include your development and production URLs
- **Token configuration**: Include optional claims if needed
- **API permissions**: Appropriate permissions for your application

## Expected Behavior

### Successful Token Persistence

1. **Login**: User authenticates with Azure AD
2. **Token Storage**: MSAL stores tokens in localStorage
3. **Session Restoration**: On page reload/reopen, user is automatically authenticated
4. **Token Refresh**: Tokens are refreshed before expiration (5-minute threshold)
5. **Cleanup**: Expired tokens are automatically removed

### Token Lifecycle

1. **Initial Login**: Fresh tokens stored in localStorage
2. **Silent Refresh**: Tokens refreshed 5 minutes before expiration
3. **Cross-Tab Sync**: Authentication state synchronized across browser tabs
4. **Expiration Handling**: Expired tokens cleaned up automatically
5. **Logout**: All tokens cleared from localStorage

## Debugging Commands

### Browser Console Commands

You can also test token management directly in the browser console:

```javascript
// Inspect tokens
tokenManager.inspectLocalStorageTokens()

// Clean up expired tokens
tokenManager.cleanupExpiredTokens()

// Check if current account needs refresh
needsProactiveRefresh(account)

// Get time until expiration
getTimeUntilExpiration(account)
```

### Development Server Logs

Watch the development server console for detailed authentication flow logs:

```bash
npm run dev
```

Look for the 🔄, 🔍, ✅, and ⚠️ emoji prefixes in the logs to track the authentication flow.

## Troubleshooting Checklist

- [ ] Azure AD is properly configured in `.env.local`
- [ ] `NEXT_PUBLIC_DISABLE_DEV_MODE=true` is set
- [ ] Development server was restarted after environment changes
- [ ] Browser localStorage is not being cleared by extensions or settings
- [ ] Azure AD app registration allows SPA authentication
- [ ] Network connectivity allows Azure AD communication
- [ ] Browser allows localStorage usage (not in private/incognito mode)

## Success Criteria

Token persistence is working correctly when:

1. ✅ User can close and reopen browser tabs without re-authentication
2. ✅ Debug page shows valid tokens in localStorage
3. ✅ Console logs show successful session restoration
4. ✅ Expired tokens are automatically cleaned up
5. ✅ Authentication state is synchronized across browser tabs
6. ✅ Tokens are refreshed before expiration

If all these criteria are met, MSAL token persistence is functioning as designed! 