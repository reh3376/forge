# Scheduling Access Control

## Overview
This document outlines the comprehensive role-based access control (RBAC) system for the Production Scheduling functionality in the MES UI application.

## Access Levels

The scheduling system implements a hierarchical access control model with four distinct levels:

### 1. Admin Level
**Roles:** 
- `e&t.admin` (Engineering & Technology - Admin)
- `operations.distillery.leadership` (Operations - Distillery Leadership)

**Permissions:**
- Full administrative access to all scheduling functions
- Can approve schedule changes and production orders
- Can create, edit, and delete production orders
- Can manage the entire schedule queue
- Can override system restrictions
- Can access all scheduling reports and analytics

**UI Features:**
- All action buttons visible and enabled
- Can reorder queue items
- Can approve pending changes
- Access to advanced scheduling tools

### 2. Management Level
**Roles:**
- `operations.distillery.supervisor` (Operations - Distillery Supervisor)
- `e&t.controls` (Engineering & Technology - Controls)

**Permissions:**
- Can create and modify production orders
- Can manage schedule queue (reorder, edit)
- Can view all scheduling data
- Cannot approve major changes (requires admin approval)

**UI Features:**
- Create Order button visible
- Queue management controls enabled
- Edit capabilities for existing orders
- Limited approval workflows

### 3. Operational Level
**Roles:**
- `operations.distillery.shiftlead` (Operations - Distillery Shift Lead)

**Permissions:**
- Can view all scheduling information
- Can make basic modifications to schedules
- Can update order status and progress
- Cannot create new orders or major queue changes

**UI Features:**
- View-focused interface
- Basic edit capabilities
- Status update controls
- Limited queue modifications

### 4. Read-Only Level
**Roles:**
- `operations.distillery.operator` (Operations - Distillery Operator)
- `e&t.developer` (Engineering & Technology - Developer)
- `maintenance.technician` (Maintenance - Technician)

**Permissions:**
- View-only access to scheduling information
- Can see production orders and queue status
- Cannot modify any scheduling data

**UI Features:**
- All action buttons hidden or disabled
- Information display only
- No edit capabilities
- Queue shown as "(View only)"

## Route Protection

### Main Scheduling Page (`/scheduling`)
- **Required Access Level**: Read-only minimum
- **Allowed Roles**: All roles with scheduling access
- **Fallback**: Redirects to `/auth-demo` if access denied

### Scheduling Operations
Different operations within the scheduling page require different permission levels:

- **View**: Read-only level minimum
- **Edit**: Operational level minimum  
- **Manage**: Management level minimum
- **Create**: Management level minimum
- **Approve**: Admin level only

## Implementation Details

### Route Guard Component
The `SchedulingRouteGuard` component provides granular access control:

```tsx
<SchedulingRouteGuard requiredLevel="readonly" operation="view">
  {/* Scheduling content */}
</SchedulingRouteGuard>
```

### Permission Checking
The `SchedulingPermissions` utility provides role-based permission checking:

```typescript
// Check if user can edit schedules
const canEdit = SchedulingPermissions.canEditSchedule(userRoles)

// Get user's access level
const accessLevel = SchedulingPermissions.getAccessLevel(userRoles)

// Check specific operations
const canManageQueue = SchedulingPermissions.canManageQueue(userRoles)
```

### UI Conditional Rendering
Action buttons and controls are conditionally rendered based on permissions:

```tsx
{canCreateOrders && (
  <Button onClick={() => setIsCreateOrderWizardOpen(true)}>
    Create Order
  </Button>
)}
```

## Configuration Files

### Role Permissions Mapping
- **File**: `lib/auth-config.ts`
- **Key Section**: `rolePermissions` object
- **Scheduling Permissions**: `VIEW_SCHEDULE`, `EDIT_SCHEDULE`

### Route Access Control
- **File**: `lib/rbac.ts`
- **Key Sections**: 
  - `ROUTE_ACCESS_CONTROL` object
  - `SCHEDULING_ACCESS_LEVELS` configuration
  - `SchedulingPermissions` utility

### Navigation Configuration
- **File**: `components/ui/permission-aware-layout.tsx`
- **Key Section**: `permissionBasedNavigation` array
- **Scheduling Entry**: Defines required roles and permissions

## User Experience

### Access Level Display
Users can see their current access level in the scheduling interface:
- Badge showing access level (Admin, Management, Operational, Read-only)
- User identification display
- Clear indication of available actions

### Permission-Based UI
- Action buttons appear/disappear based on permissions
- Descriptive text indicates access level ("View only" vs "Drag to reorder")
- Tooltips and help text explain permission requirements

### Error Handling
- Clear error messages for insufficient permissions
- Graceful fallbacks for unauthorized actions
- Redirect to appropriate authentication pages

## Security Considerations

### Authentication Requirements
- All scheduling access requires valid authentication
- JWT tokens or MSAL authentication supported
- Demo mode available for development/testing

### Permission Validation
- Server-side permission validation required
- Client-side checks for UI optimization only
- API endpoints must validate user permissions

### Audit Trail
- All scheduling actions should be logged
- User identification included in all operations
- Permission level recorded for audit purposes

## Testing

### Role Testing
To test different access levels:

1. **Admin Access**: Log in with `e&t.admin` role
2. **Management Access**: Log in with `operations.distillery.supervisor` role  
3. **Operational Access**: Log in with `operations.distillery.shiftlead` role
4. **Read-Only Access**: Log in with `operations.distillery.operator` role

### Permission Verification
1. Verify appropriate UI elements are visible/hidden
2. Test that restricted actions are properly blocked
3. Confirm error messages are clear and helpful
4. Validate that access level badges display correctly

## Development Guidelines

### Adding New Scheduling Features
1. Define required permission level in `SchedulingPermissions`
2. Add appropriate role checks in UI components
3. Update route protection if needed
4. Test with all access levels

### Modifying Access Levels
1. Update `SCHEDULING_ACCESS_LEVELS` configuration
2. Modify permission checking functions
3. Update UI conditional rendering
4. Update documentation

### Best Practices
- Always check permissions before rendering UI elements
- Provide clear feedback about access restrictions
- Use the `SchedulingRouteGuard` for page-level protection
- Implement graceful degradation for limited access users

## Troubleshooting

### Common Issues
1. **User can't see scheduling menu**: Check if user has any scheduling role
2. **Access denied on scheduling page**: Verify user authentication and role assignment
3. **Actions not available**: Check user's access level against required permissions
4. **Permission errors**: Verify role configuration in auth system

### Debug Information
The scheduling page displays:
- Current user access level
- User identification
- Available permissions (via UI elements)

This information helps diagnose permission-related issues during development and testing. 