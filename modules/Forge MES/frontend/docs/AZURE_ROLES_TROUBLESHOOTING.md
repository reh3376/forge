# Azure Roles Troubleshooting Guide

This guide helps diagnose and fix issues with Azure app registration roles not appearing in your application.

## Quick Diagnosis

Visit `/debug/role-debug` in your application to get a comprehensive analysis of your role configuration and token claims.

## Common Issues and Solutions

### 1. No Roles Found in Token Claims

**Symptoms:**
- User can log in successfully
- No roles appear in any token claim sources
- `extractedRoles` array is empty

**Causes & Solutions:**

#### A. App Roles Not Created in Azure
1. Go to Azure Portal → App registrations → Your app
2. Navigate to **App roles**
3. Create app roles with these exact values:
   ```
   e&t.admin
   e&t.controls
   e&t.developer
   operations.distillery.leadership
   operations.distillery.supervisor
   operations.distillery.shiftlead
   operations.distillery.operator
   maintenance.leadership
   maintenance.technician
   ```

#### B. Users Not Assigned to App Roles
1. Go to Azure Portal → Enterprise applications → Your app
2. Navigate to **Users and groups**
3. Click **Add user/group**
4. Assign users or groups to the appropriate app roles

#### C. Token Configuration Missing Roles Claim
1. Go to Azure Portal → App registrations → Your app
2. Navigate to **Token configuration**
3. Click **Add optional claim**
4. Select **ID** token type
5. Add the `roles` claim
6. Check **Turn on the Microsoft Graph profile permission**

### 2. Roles Found But Not Valid Manufacturing Roles

**Symptoms:**
- Roles appear in `extractedRoles` but not in `validRoles`
- Role values don't match expected manufacturing roles

**Causes & Solutions:**

#### A. Role Value Mismatch
Ensure Azure app role values exactly match the `ManufacturingRole` enum:

**Correct Values:**
```typescript
e&t.admin                           // Not: E&T Admin
operations.distillery.leadership    // Not: Operations Leadership
maintenance.technician              // Not: Maintenance Tech
```

#### B. Case Sensitivity Issues
Azure role values are case-sensitive. Use lowercase with dots and ampersands as shown above.

### 3. Roles in Groups Instead of App Roles

**Symptoms:**
- Roles appear in `groups` claim but not `roles` claim
- User is assigned to Azure AD groups rather than app roles

**Solutions:**

#### A. Use App Roles (Recommended)
Convert group-based assignments to app role assignments for better security and clarity.

#### B. Configure Group Claims (Alternative)
1. Go to Azure Portal → App registrations → Your app
2. Navigate to **Token configuration**
3. Click **Add groups claim**
4. Select appropriate group types
5. Update application code to check `groups` claim

### 4. Redirect URI Mismatch

**Symptoms:**
- Authentication fails or redirects incorrectly
- Roles not preserved after redirect

**Solution:**
1. Check your `.env.local` file:
   ```bash
   NEXT_PUBLIC_AZURE_REDIRECT_URI=http://localhost:4000
   NEXT_PUBLIC_AZURE_LOGOUT_URI=http://localhost:4000/
   ```
2. Ensure Azure app registration has matching redirect URIs
3. Update port numbers to match your development server

### 5. Token Refresh Issues

**Symptoms:**
- Roles appear initially but disappear after token refresh
- Intermittent role availability

**Solution:**
1. Ensure silent token refresh includes roles:
   ```typescript
   const silentRequest = {
     scopes: ['User.Read'],
     account: activeAccount,
     forceRefresh: true // Force new token with roles
   }
   ```

## Step-by-Step Azure Configuration

### 1. Create App Registration
1. Go to Azure Portal → App registrations
2. Click **New registration**
3. Set **Redirect URI** to your application URL
4. Note the **Application (client) ID** and **Directory (tenant) ID**

### 2. Configure App Roles
For each manufacturing role, create an app role:

1. Go to **App roles** → **Create app role**
2. Fill in:
   - **Display name**: Human-readable name (e.g., "E&T Admin")
   - **Allowed member types**: Users/Groups
   - **Value**: Exact enum value (e.g., "e&t.admin")
   - **Description**: Role description

### 3. Configure Token Claims
1. Go to **Token configuration**
2. Add optional claims:
   - **ID tokens**: roles, groups (if using groups)
   - **Access tokens**: roles (if needed)

### 4. Set API Permissions
1. Go to **API permissions**
2. Ensure these permissions are granted:
   - `User.Read` (Microsoft Graph)
   - `openid` (Microsoft Graph)
   - `profile` (Microsoft Graph)
3. Click **Grant admin consent**

### 5. Assign Users to Roles
1. Go to **Enterprise applications** → Your app
2. Navigate to **Users and groups**
3. Add users/groups and assign them to app roles

## Testing Your Configuration

### 1. Use the Debug Page
Visit `/debug/role-debug` to see:
- All token claims
- Role extraction results
- Possible role sources
- Configuration validation

### 2. Check Browser Console
Look for MSAL debug logs that show:
- Token acquisition success/failure
- Claims included in tokens
- Role extraction process

### 3. Verify Token Contents
Use a JWT decoder (like jwt.io) to inspect your ID token and verify:
- `roles` claim is present
- Role values match your app registration
- Token is not expired

## Common Error Messages

### "No roles found in any source"
- App roles not created in Azure
- User not assigned to any app roles
- Token configuration missing roles claim

### "Roles found but not valid manufacturing roles"
- Role values don't match ManufacturingRole enum
- Case sensitivity issues
- Typos in role values

### "AADSTS50011: Redirect URI mismatch"
- Redirect URI in .env.local doesn't match Azure app registration
- Port number mismatch

### "AADSTS65001: User consent required"
- API permissions not granted admin consent
- User needs to consent to application access

## Environment Configuration

Ensure your `.env.local` file has:

```bash
# Azure Configuration
NEXT_PUBLIC_AZURE_AD_CLIENT_ID=your-client-id
NEXT_PUBLIC_AZURE_AD_TENANT_ID=your-tenant-id
NEXT_PUBLIC_AZURE_REDIRECT_URI=http://localhost:4000
NEXT_PUBLIC_AZURE_LOGOUT_URI=http://localhost:4000/

# Development Controls
NEXT_PUBLIC_DISABLE_DEV_MODE=true
NEXT_PUBLIC_ENABLE_DEMO_USER=false
```

## Advanced Debugging

### 1. Enable Verbose MSAL Logging
The application already includes verbose MSAL logging. Check browser console for detailed authentication flow information.

### 2. Network Tab Analysis
1. Open browser DevTools → Network tab
2. Filter by "login.microsoftonline.com"
3. Check token response for roles claim

### 3. Token Inspection
1. Copy ID token from browser storage
2. Paste into jwt.io
3. Verify payload contains roles claim

## Getting Help

If you're still experiencing issues:

1. Use the `/debug/role-debug` page to gather diagnostic information
2. Check the browser console for MSAL error messages
3. Verify your Azure app registration configuration
4. Ensure users are properly assigned to app roles

## Security Notes

- Never expose client secrets in frontend applications
- Use app roles instead of groups for better security
- Regularly review user role assignments
- Monitor authentication logs for suspicious activity 