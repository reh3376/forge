# Recipe Management Access Control

## Overview
This document outlines the access control configuration for Recipe Management functionality in the MES UI application.

## Role-Based Access Control

### Roles with Recipe Management Access

The following roles have access to recipe management functionality:

#### 1. Engineering & Technology - Admin (`e&t.admin`)
- **Access Level**: Full access to all recipe management features
- **Permissions**: All permissions (includes all recipe permissions)
  - `VIEW_RECIPES`
  - `EDIT_RECIPES` 
  - `CREATE_RECIPES`
  - `APPROVE_RECIPES`
- **Navigation**: Recipe Management menu item visible
- **Routes**: Can access all recipe management routes

#### 2. Engineering & Technology - Controls (`e&t.controls`)
- **Access Level**: Full operational access
- **Permissions**:
  - `VIEW_RECIPES`
  - `EDIT_RECIPES`
  - `CREATE_RECIPES`
- **Navigation**: Recipe Management menu item visible
- **Routes**: Can access all recipe management routes except approval workflows

#### 3. Engineering & Technology - Developer (`e&t.developer`)
- **Access Level**: Read-only access
- **Permissions**:
  - `VIEW_RECIPES`
- **Navigation**: Recipe Management menu item visible
- **Routes**: Can view recipes but cannot create or edit

#### 4. Operations - Distillery Leadership (`operations.distillery.leadership`)
- **Access Level**: Full operational access with approval authority
- **Permissions**:
  - `VIEW_RECIPES`
  - `EDIT_RECIPES`
  - `CREATE_RECIPES`
  - `APPROVE_RECIPES`
- **Navigation**: Recipe Management menu item visible
- **Routes**: Can access all recipe management routes

#### 5. Operations - Distillery Supervisor (`operations.distillery.supervisor`)
- **Access Level**: Operational access without approval authority
- **Permissions**:
  - `VIEW_RECIPES`
  - `EDIT_RECIPES`
- **Navigation**: Recipe Management menu item visible
- **Routes**: Can view and edit recipes but cannot create new ones

## Route Protection

### Main Recipe Management Page (`/recipe-management`)
- **Required Permission**: `VIEW_RECIPES`
- **Allowed Roles**: All roles listed above
- **Fallback**: Redirects to `/auth-demo` if access denied

### Create Recipe Page (`/recipe-management/create`)
- **Required Permission**: `CREATE_RECIPES`
- **Allowed Roles**: 
  - `e&t.admin`
  - `e&t.controls`
  - `operations.distillery.leadership`
- **Fallback**: Redirects to `/auth-demo` if access denied

## Navigation Menu

The Recipe Management menu item is visible to users with any of the following roles:
- `e&t.admin`
- `e&t.controls`
- `e&t.developer`
- `operations.distillery.leadership`
- `operations.distillery.supervisor`

## Configuration Files

### Role Permissions Mapping
- **File**: `lib/auth-config.ts`
- **Key Section**: `rolePermissions` object
- **ET Admin**: Has `Object.values(ManufacturingPermission)` (all permissions)

### Route Access Control
- **File**: `lib/rbac.ts`
- **Key Section**: `ROUTE_ACCESS_CONTROL` object
- **Recipe Management**: Lists all allowed roles

### Navigation Configuration
- **File**: `components/ui/permission-aware-layout.tsx`
- **Key Section**: `permissionBasedNavigation` array
- **Recipe Management**: Defines required roles and permissions

## Verification

To verify that the `e&t.admin` role has access to recipe management:

1. **Permission Check**: The role has all permissions including recipe permissions
2. **Route Access**: The role is listed in the route access control
3. **Navigation**: The role is included in the navigation configuration
4. **Page Guards**: Both main and create pages check for appropriate permissions

## Testing

To test recipe management access:

1. Log in with a user assigned the `e&t.admin` role
2. Verify the "RECIPE MANAGEMENT" menu item is visible in the sidebar
3. Click on the menu item to navigate to `/recipe-management`
4. Verify the page loads without access denied errors
5. Click "Create New Recipe" to test create access
6. Verify the create recipe wizard loads properly

## Troubleshooting

If the `e&t.admin` role cannot access recipe management:

1. **Check Role Assignment**: Verify the user has the `e&t.admin` role in Azure AD
2. **Check Token Claims**: Verify the role appears in the JWT token claims
3. **Check Permission Mapping**: Verify `rolePermissions` includes recipe permissions
4. **Check Route Configuration**: Verify route access control includes the role
5. **Check Navigation**: Verify navigation configuration includes the role 