# JWT Authentication Testing Guide

This guide explains how to test the JWT authentication system in the MES UI application.

## Overview

The application uses JWT (JSON Web Token) authentication to secure API calls. The authentication flow works as follows:

1. **User Login**: User enters username/password in the login form
2. **Token Generation**: Backend validates credentials and returns a JWT token
3. **Token Storage**: Frontend stores the JWT token in localStorage
4. **API Requests**: All subsequent API calls include the JWT token in the Authorization header
5. **Token Validation**: Backend validates the JWT token for each protected endpoint

## Test Pages

### 1. JWT Demo Page (`/jwt-demo`)

**Purpose**: Basic JWT authentication demonstration
**URL**: `http://localhost:3000/jwt-demo`

**Features**:
- Simple login form
- User information display
- Token status indicator
- Logout functionality

### 2. Auth Test Page (`/auth-test`)

**Purpose**: Comprehensive authentication testing with API calls
**URL**: `http://localhost:3000/auth-test`

**Features**:
- JWT login form
- User authentication status
- REST API test (recipes endpoint)
- GraphQL API test (recipes query via unified client)
- Token refresh functionality
- Detailed error reporting

### 3. API Client Test Page (`/api-client-test`)

**Purpose**: Test various API clients and endpoints
**URL**: `http://localhost:3000/api-client-test`

**Features**:
- Multiple API endpoint testing
- Authentication status display
- Error handling demonstration

### 4. Schedule Order Queue Testing (`/scheduling`)

**Purpose**: Test the schedule order queue move functionality with JWT authentication
**URL**: `http://localhost:3000/scheduling`

**Features**:
- View schedule order queue
- Move items up/down in the queue (requires authentication)
- Real-time queue updates
- Authentication error handling

**Testing Steps**:
1. Navigate to `/scheduling`
2. Log in using JWT credentials (if not already logged in)
3. Look for the schedule table with up/down arrow buttons
4. Try moving items up or down in the queue
5. Verify that moves work when authenticated
6. Verify that appropriate error messages appear when not authenticated

## Testing Scenarios

### Scenario 1: Basic Login Flow
1. Go to `/jwt-demo` or `/auth-test`
2. Enter credentials: `mes` / `password` (or your configured credentials)
3. Click "Login"
4. Verify user information is displayed
5. Verify token is stored in localStorage

### Scenario 2: API Authentication
1. Go to `/auth-test`
2. Log in with valid credentials
3. Click "Test REST API" - should succeed
4. Click "Test GraphQL API" - should succeed
5. Log out
6. Try API tests again - should fail with authentication errors

### Scenario 3: Schedule Queue Operations
1. Go to `/scheduling`
2. Ensure you're logged in (check auth status)
3. Look for schedule order queue items
4. Try moving items up/down using the arrow buttons
5. Verify operations succeed when authenticated
6. Log out and try again - should see "Authentication required" errors

### Scenario 4: Token Refresh
1. Log in and wait for token to near expiration
2. Perform an API operation
3. Verify token is automatically refreshed
4. Verify operation succeeds

## Environment Variables

For testing, ensure these environment variables are set:

```bash
# Backend API URLs
NEXT_PUBLIC_MES_API_URL=http://localhost:3001
NEXT_PUBLIC_MES_GRAPHQL_URL=http://localhost:3000/graphql

# JWT Credentials (for testing)
MES_USERNAME=mes
MES_PASSWORD=password
```

## Troubleshooting

### Common Issues

1. **"Unauthorized" errors**:
   - Check if user is logged in
   - Verify JWT token exists in localStorage
   - Check if token has expired
   - Verify backend is running and accessible

2. **"Failed to move item up/down"**:
   - Ensure user is authenticated
   - Check browser console for detailed error messages
   - Verify backend API endpoints are working
   - Check network tab for request/response details

3. **GraphQL errors**:
   - Verify GraphQL endpoint is accessible
   - Check if authentication headers are being sent
   - Look for CORS issues in browser console

### Debug Steps

1. **Check Authentication Status**:
   ```javascript
   // In browser console
   localStorage.getItem('jwt_token')
   ```

2. **Monitor Network Requests**:
   - Open browser DevTools → Network tab
   - Look for Authorization headers in requests
   - Check response status codes

3. **Console Logging**:
   - Check browser console for authentication-related logs
   - Look for JWT token refresh attempts
   - Monitor API request/response logs

## Expected Behavior

### When Authenticated:
- All API calls should include `Authorization: Bearer <token>` header
- Schedule queue move operations should succeed
- GraphQL queries should return data
- REST API calls should return data

### When Not Authenticated:
- API calls should return 401 Unauthorized
- Schedule queue operations should show "Authentication required" message
- User should be prompted to log in

## Test Script

A Node.js test script is available at `scripts/test-jwt-auth.js` for automated testing:

```bash
# Run the test script
node scripts/test-jwt-auth.js
```

This script tests:
- Login endpoint
- Token validation
- GraphQL query with authentication
- Error handling for invalid tokens 