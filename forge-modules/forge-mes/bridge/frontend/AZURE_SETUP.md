# Azure Entra ID Setup Guide

## Quick Setup

Your app already has Azure Entra ID authentication fully implemented! You just need to configure the environment variables.

### 1. Create Environment File

Create a `.env.local` file in your project root with these variables:

```env
# Azure Entra ID Configuration
NEXT_PUBLIC_AZURE_CLIENT_ID=your-frontend-client-id
NEXT_PUBLIC_AZURE_TENANT_ID=your-tenant-id
NEXT_PUBLIC_AZURE_REDIRECT_URI=http://localhost:3000/dashboard
NEXT_PUBLIC_AZURE_LOGOUT_URI=http://localhost:3000/

# Development Mode Controls
NEXT_PUBLIC_DISABLE_DEV_MODE=false
NEXT_PUBLIC_ENABLE_DEMO_USER=true
```

### 2. Replace with Your Values

From your working app, copy these values:
- `NEXT_PUBLIC_AZURE_CLIENT_ID` → Your frontend client ID
- `NEXT_PUBLIC_AZURE_TENANT_ID` → Your tenant ID
- Update redirect URIs to match your domain

### 3. Test the Setup

1. **Development Mode**: With `NEXT_PUBLIC_DISABLE_DEV_MODE=false`, you can test with demo users
2. **Production Mode**: Set `NEXT_PUBLIC_DISABLE_DEV_MODE=true` to force Azure authentication

### 4. Development Controls

Your app includes powerful development controls:
- Press `Ctrl+Shift+D` to toggle dev controls
- Switch between different manufacturing roles
- Test permission-based UI components

## What's Already Implemented

✅ **MSAL Provider** - Wraps your entire app  
✅ **Role-Based Access Control** - Manufacturing-specific roles and permissions  
✅ **Protected Routes** - Automatic authentication checks  
✅ **Permission Guards** - Component-level access control  
✅ **Development Mode** - Test without Azure credentials  
✅ **User Management** - Complete user profile and session handling  

## Manufacturing Roles Available

- **Engineering & Technology**: Admin, Controls, Developer
- **Operations**: Leadership, Supervisor, Shift Lead, Operator  
- **Maintenance**: Leadership, Technician

## Key Features

- **Automatic Token Refresh** - Handles token expiration
- **Session Management** - 8-hour factory shift sessions
- **Permission-Based Navigation** - Sidebar adapts to user role
- **Equipment Status Monitoring** - Role-based equipment access
- **Audit Logging** - Tracks user actions and access

## Testing

Visit `/auth-demo` to test all authentication features and role-based components.

## Troubleshooting

1. **Check Console** - Detailed logging shows configuration status
2. **Visit `/debug`** - Shows environment variables and auth state
3. **Dev Controls** - Use `Ctrl+Shift+D` to test different roles

Your authentication system is production-ready! 🚀 