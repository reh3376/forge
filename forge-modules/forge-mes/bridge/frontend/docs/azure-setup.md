# Azure AD Setup for Whiskey House MES

The authentication system is currently in development mode because Azure AD is not configured. To enable real Azure authentication and disable the auto-login demo user, follow these steps:

## Quick Option: Enable Demo User for Testing

If you want to test the application with a demo user without setting up Azure AD, create a `.env.local` file with:

```env
# Enable demo user functionality (requires explicit sign-in)
NEXT_PUBLIC_ENABLE_DEMO_USER=true
```

This will show a "Sign In with Demo User" button alongside the Azure AD sign-in button. The demo user will not auto-login - you must click the button to sign in.

## Disable Demo User (Production Mode)

To disable demo user functionality entirely, set:

```env
# Disable demo user functionality
NEXT_PUBLIC_ENABLE_DEMO_USER=false
# OR
NEXT_PUBLIC_DISABLE_DEV_MODE=true
```

**Note**: If Azure AD is not configured and demo user is disabled, the Azure AD sign-in button will be shown but will fail when clicked.

## Full Setup: Configure Azure AD

### Step 1: Create Azure AD App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Click **New registration**
4. Fill in the details:
   - **Name**: Whiskey House MES
   - **Supported account types**: Accounts in this organizational directory only
   - **Redirect URI**: Web - `http://localhost:3000` (for development)

### Step 2: Configure App Registration

After creating the app registration:

1. Go to **Authentication** tab
2. Add these redirect URIs:
   - `http://localhost:3000` (development)
   - `https://your-production-domain.com` (production)
3. Under **Implicit grant and hybrid flows**, enable:
   - **Access tokens**
   - **ID tokens**
4. Set **Logout URL** to `http://localhost:3000` (development)

### Step 3: Get Required Values

From your app registration overview page, copy:
- **Application (client) ID**
- **Directory (tenant) ID**

### Step 4: Create Environment File

Create a `.env.local` file in your project root with:

```env
# Required: Your Azure AD Application (client) ID
NEXT_PUBLIC_AZURE_AD_CLIENT_ID=your-client-id-here

# Required: Your Azure AD Directory (tenant) ID
NEXT_PUBLIC_AZURE_AD_TENANT_ID=your-tenant-id-here

# Optional: Custom redirect URI (defaults to current origin)
# NEXT_PUBLIC_AZURE_AD_REDIRECT_URI=http://localhost:3000

# Optional: Custom post-logout redirect URI (defaults to current origin)
# NEXT_PUBLIC_AZURE_AD_POST_LOGOUT_REDIRECT_URI=http://localhost:3000
```

### Step 5: Configure User Roles (Optional)

To assign manufacturing roles to users:

1. In Azure AD, go to **Enterprise applications**
2. Find your Whiskey House MES app
3. Go to **Users and groups**
4. Assign users and add custom roles like:
   - `operations.distillery.supervisor`
   - `operations.distillery.operator`
   - `e&t.admin`
   - etc.

### Step 6: Restart Development Server

After creating the `.env.local` file:

```bash
npm run dev
```

The system will automatically detect the Azure configuration and disable development mode.

## Troubleshooting

- **Still seeing demo user**: Make sure both `NEXT_PUBLIC_AZURE_AD_CLIENT_ID` and `NEXT_PUBLIC_AZURE_AD_TENANT_ID` are set
- **Login redirect issues**: Verify redirect URIs match exactly in Azure AD
- **Permission errors**: Check that your Azure AD user has the correct role assignments

## Development Mode Toggle

If you need to temporarily re-enable development mode for testing, you can:
1. Comment out the environment variables in `.env.local`
2. Restart the development server
3. The system will automatically fall back to development mode 