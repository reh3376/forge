# Microsoft Entra ID Setup for Whiskey House of Kentucky MES

This document provides step-by-step instructions for setting up Microsoft Entra ID (formerly Azure Active Directory) authentication for the Manufacturing Execution System (MES).

## Prerequisites

- Microsoft Entra ID tenant (Azure Active Directory)
- Global Administrator or Application Administrator role in Entra ID
- Node.js application with MSAL libraries installed

## Application Registration Steps

### 1. Register the Application

1. Navigate to the [Microsoft Entra admin center](https://entra.microsoft.com/)
2. Go to **Identity** > **Applications** > **App registrations**
3. Click **New registration**
4. Configure the registration:
   - **Name**: `Whiskey House of Kentucky MES`
   - **Supported account types**: 
     - Select **Accounts in this organizational directory only (Single tenant)**
   - **Redirect URI**: 
     - Type: **Single-page application (SPA)**
     - URI: `http://localhost:3000` (for development)
     - Add production URI when deploying: `https://your-production-domain.com`

### 2. Configure Authentication

1. In the app registration, go to **Authentication**
2. Under **Single-page application**, ensure your redirect URIs are listed:
   - `http://localhost:3000` (development)
   - `https://your-production-domain.com` (production)
3. Under **Advanced settings**:
   - **Allow public client flows**: No
   - **Live SDK support**: No
4. Under **Implicit grant and hybrid flows** (leave unchecked for SPA):
   - Access tokens: Unchecked
   - ID tokens: Unchecked

### 3. API Permissions

1. Go to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph**
4. Select **Delegated permissions**
5. Add the following permissions:
   - `User.Read` (Default - allows reading user profile)
   - `openid` (Default - allows OpenID Connect sign-in)
   - `profile` (Default - allows reading user's basic profile)
   - `Directory.Read.All` (Optional - for reading group memberships)

6. Click **Grant admin consent** for your organization

### 4. Application Roles (Distillery-Specific)

1. Go to **App roles**
2. Click **Create app role** for each distillery role:

#### Engineering & Technology - Admin Role
- **Display name**: `E&T Admin`
- **Allowed member types**: Users/Groups
- **Value**: `e&t.admin`
- **Description**: `Full system administration and technical oversight access`

#### Engineering & Technology - Controls Role
- **Display name**: `E&T Controls`
- **Allowed member types**: Users/Groups
- **Value**: `e&t.controls`
- **Description**: `Controls engineering and system configuration access`

#### Engineering & Technology - Developer Role
- **Display name**: `E&T Developer`
- **Allowed member types**: Users/Groups
- **Value**: `e&t.developer`
- **Description**: `Development and system integration access`

#### Operations - Distillery Leadership Role
- **Display name**: `Operations Distillery Leadership`
- **Allowed member types**: Users/Groups
- **Value**: `operations.distillery.leadership`
- **Description**: `Distillery operations leadership and approval authority`

#### Operations - Distillery Supervisor Role
- **Display name**: `Operations Distillery Supervisor`
- **Allowed member types**: Users/Groups
- **Value**: `operations.distillery.supervisor`
- **Description**: `Distillery operations supervision and management`

#### Operations - Distillery Shift Lead Role
- **Display name**: `Operations Distillery Shift Lead`
- **Allowed member types**: Users/Groups
- **Value**: `operations.distillery.shiftlead`
- **Description**: `Shift leadership and quality oversight`

#### Operations - Distillery Operator Role
- **Display name**: `Operations Distillery Operator`
- **Allowed member types**: Users/Groups
- **Value**: `operations.distillery.operator`
- **Description**: `Basic distillery operations and data entry`

#### Maintenance - Leadership Role
- **Display name**: `Maintenance Leadership`
- **Allowed member types**: Users/Groups
- **Value**: `maintenance.leadership`
- **Description**: `Maintenance leadership and scheduling authority`

#### Maintenance - Technician Role
- **Display name**: `Maintenance Technician`
- **Allowed member types**: Users/Groups
- **Value**: `maintenance.technician`
- **Description**: `Maintenance execution and equipment service`

### 5. Certificates & Secrets (Not Required for SPA)

For single-page applications using MSAL.js, client secrets are not required and should not be used for security reasons.

## User and Group Assignment

### 1. Create Security Groups (Recommended)

1. Go to **Identity** > **Groups** > **All groups**
2. Click **New group**
3. Create groups for each role:
   - `E&T-Admins`
   - `E&T-Controls`
   - `E&T-Developers`
   - `Operations-Distillery-Leadership`
   - `Operations-Distillery-Supervisors`
   - `Operations-Distillery-ShiftLeads`
   - `Operations-Distillery-Operators`
   - `Maintenance-Leadership`
   - `Maintenance-Technicians`

### 2. Assign Users to Groups

1. Add appropriate users to each group based on their manufacturing roles
2. Users can be members of multiple groups for role inheritance

### 3. Assign Groups to App Roles

1. Go back to your app registration
2. Go to **Overview** and click on the link under **Managed application in local directory**
3. Go to **Users and groups**
4. Click **Add user/group**
5. Select the appropriate groups and assign them to their corresponding app roles

## Environment Configuration

After completing the app registration, update your environment variables:

```bash
# Copy the Application (client) ID from the app registration Overview page
NEXT_PUBLIC_AZURE_AD_CLIENT_ID=12345678-1234-1234-1234-123456789012

# Copy the Directory (tenant) ID from the app registration Overview page
NEXT_PUBLIC_AZURE_AD_TENANT_ID=87654321-4321-4321-4321-210987654321

# Construct the authority URL using your tenant ID
NEXT_PUBLIC_AZURE_AD_AUTHORITY=https://login.microsoftonline.com/87654321-4321-4321-4321-210987654321

# Set your application URLs
NEXT_PUBLIC_AZURE_AD_REDIRECT_URI=http://localhost:3000
NEXT_PUBLIC_AZURE_AD_POST_LOGOUT_REDIRECT_URI=http://localhost:3000
```

## Testing the Configuration

### 1. Verify App Registration

- Ensure the application appears in your Entra ID app registrations
- Confirm all redirect URIs are correctly configured
- Verify API permissions are granted

### 2. Test Authentication Flow

1. Start your development server
2. Navigate to the login page
3. Attempt to sign in with a test user
4. Verify the user is redirected back to your application
5. Check that user information and roles are correctly retrieved

### 3. Role-Based Access Testing

- Test with users assigned to different roles
- Verify that role-based permissions are working correctly
- Ensure unauthorized users cannot access protected resources

## Production Deployment Considerations

### 1. Update Redirect URIs

- Add your production domain to the redirect URIs
- Remove development URIs if not needed

### 2. Security Hardening

- Review and minimize API permissions
- Ensure groups and roles are properly configured
- Enable conditional access policies if required

### 3. Monitoring and Logging

- Enable sign-in logs in Entra ID
- Monitor for failed authentication attempts
- Set up alerts for suspicious activities

## Troubleshooting

### Common Issues

1. **AADSTS50011**: The redirect URI specified in the request does not match the redirect URIs configured for the application
   - **Solution**: Verify redirect URIs in app registration match your application URLs

2. **AADSTS65001**: The user or administrator has not consented to use the application
   - **Solution**: Grant admin consent for required permissions

3. **AADSTS90014**: The request body must contain the following parameter: 'scope'
   - **Solution**: Ensure scopes are properly configured in MSAL configuration

### Support Resources

- [Microsoft Entra ID Documentation](https://docs.microsoft.com/en-us/azure/active-directory/)
- [MSAL.js Documentation](https://docs.microsoft.com/en-us/azure/active-directory/develop/msal-js-initializing-client-applications)
- [Azure AD B2B Collaboration](https://docs.microsoft.com/en-us/azure/active-directory/external-identities/)

## Security Best Practices

1. **Principle of Least Privilege**: Assign minimum required permissions
2. **Regular Review**: Periodically review user assignments and permissions
3. **Conditional Access**: Implement conditional access policies for enhanced security
4. **Multi-Factor Authentication**: Require MFA for elevated roles
5. **Session Management**: Configure appropriate session timeouts for factory environments 