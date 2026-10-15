<p align="right">
  <a href="https://amplication.com" target="_blank">
    <img alt="amplication-logo" height="70" alt="Amplication Logo" src="https://amplication.com/images/logo.svg"/>
  </a>
</p>

# Introduction

This service was generated with Amplication. The server-side of the generated project. This component provides the different backend services - i.e., REST API, GraphQL API, authentication, authorization, logging, data validation and the connection to the database. Additional information about the server component and the architecture around it, can be found on the [documentation](https://docs.amplication.com/guides/getting-started) site.

# Getting started

## Step 1: Configuration

Configuration for the server component can be provided through the use of environment variables. These can be passed to the application via the use of the `.env` file in the base directory of the generated service. Below a table can be found which show the different variables that can be passed - these are the variables which exist by default, through the use of plugins additional integrations could require additional values. These values are provided default values after generation, change them to the desired values.

| Variable             | Description                                  | Value                                                               |
| -------------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| BCRYPT_SALT          | the string used for hashing                  | [random-string]                                                     |
| COMPOSE_PROJECT_NAME | the identifier of the service plus prefix    | amp\_[service-identifier]                                           |
| PORT                 | the port on which to run the server          | 3000                                                                |
| DB_URL               | the connection url for the database          | [db-provider]://[username]:[password]@localhost:[db-port]/[db-name] |
| DB_PORT              | the port used by the database instance       | [db-provider-port]                                                  |
| DB_USER              | the username used to connect to the database | [username]                                                          |
| DB_PASSWORD          | the password used to connect to the database | [password]                                                          |
| DB_NAME              | the name of the database                     | [service-name] / [project-name]                                     |
| JWT_SECRET_KEY       | the secret used to sign the json-web token   | [secret]                                                            |
| JWT_EXPIRATION       | the expiration time for the json-web token   | 2d                                                                  |

> **Note**
> Amplication generates default values and stores them under the .env file. It is advised to use some form of secrets manager/vault solution when using in production.

## Step 2: DotEnv Vault (Environment variables)

We utilize the [DotEnv Vault](https://dotenv.org/) platform to store the environment variables in a secure and easily manageable way for different environments.

### Local Development

From the root of the app directory (in this case `backend`) run the following command to start the dotenv vault:

`npx dotenv-vault@latest pull`

### Staging

From the root of the app directory (in this case `backend`) run the following command to start the dotenv vault:
`npx dotenv-vault@latest pull staging .env`

### Production

From the root of the app directory (in this case `backend`) run the following command to start the dotenv vault:
`npx dotenv-vault@latest pull production .env`

Please see their documentation for more information.

## Step 3.1: Scripts - pre-requisites

After configuration of the server the next step would be to run the application. Before running the server side of the component, make sure that the different pre-requisites are met - i.e., node.js [^16.x], npm, docker. After the setup of the pre-requisites the server component can be started.

```sh
# installation of the dependencies
$ npm install

# generate the prisma client
$ npm run prisma:generate
```

## Step 3.2: Scripts - local development

```sh
# start the database where the server component will connect to
$ npm run docker:dev

# initialize the database
$ npm run db:dev:init

# start the server component
$ npm run start
```

By default, your app comes with one user with the username and password configured in
`.env` file. See step 2 for more details.

## Step 3.3: Scripts - container based development

```shell
# start the server component as a docker container
$ npm run compose:up
```

## 4 - Database Restoration for Local Development

If you are developing locally and need to restore the database, you can use the following command:

Note you must have the `psql` command installed on your machine.

- [Guide](https://www.timescale.com/blog/how-to-install-psql-on-mac-ubuntu-debian-windows/)

Commands:

```sh
dropdb -h localhost -p 5432 -U admin whk-mes # drop if exists
createdb -h localhost -p 5432 -U admin whk-mes # create new db
psql -h localhost -p 5432 -d whk-mes -U admin -f <pathToMy.sqlFileToRestore> # Restore from .sql file
```

# QuickStart application

```bash
npm install
npm run prisma:generate
npm run docker:dev
npm run db:dev:uselotsofcautionclean
npm run db:prod:deploy
npm run seed
npm run start
```

# Start up guide for csv loader

```bash
# navigate to the whk-mes-csv-loader directory  for 'development' and navigate to the 'prod' directory for 'production' within the whk-mes-csv-loader directory

# for development
node index.js

# for production once you are in the prod directory
node  prod-index.js
```

# Scheduling System

This application includes a comprehensive scheduling system for production orders in the manufacturing process. The scheduling system consists of two main modules:

## Schedule Order Module

The Schedule Order module manages the creation and maintenance of production schedules. It provides APIs for:

- Creating and updating schedule orders
- Managing timing information for different production phases
- Synchronizing data with production orders
- Managing resource allocation

[View Schedule Order API Documentation](./src/scheduleOrder/README.md)

## Schedule Order Queue Module

The Schedule Order Queue module manages the prioritization and sequencing of schedule orders. It provides APIs for:

- Adding production orders to the scheduling queue
- Changing the priority of schedule orders
- Activating, completing, and deactivating scheduled orders
- Managing operational areas for schedule orders

[View Schedule Order Queue API Documentation](./src/scheduleOrderQueue/README.md)

## Key Features of the Scheduling System

- **Comprehensive Phase Timing**: Automatically calculates start times and durations for mashing, fermentation, distillation, and barreling phases
- **Bidirectional Synchronization**: Changes to scheduling data are synchronized between schedule orders and production orders
- **Status Management**: State transitions are managed and synchronized between related entities
- **Resource Allocation**: Tracks estimated resource utilization like barrels and proof gallons

## Production Phase Timing

The scheduling system uses the following default durations for production phases:

| Phase            | Default Duration     |
| ---------------- | -------------------- |
| Mashing          | 8 hours              |
| Fermentation     | 72 hours (3 days)    |
| Distillation     | 12 hours             |
| Total Production | 92 hours (~3.8 days) |

These phases occur sequentially, with each phase starting immediately after the completion of the previous phase. The system calculates a complete timeline when a production order is added to the queue, starting from the provided start date.

## Production Quantity Calculations

The system performs these automatic calculations for production quantities:

- **Total Barrels** = Barrels Per Fermenter × Planned Fermenters
- **Total Proof Gallons** = Proof Gallons Per Barrel × Total Barrels

These calculations help estimate production volumes and resource requirements.

## Example Flow

1. Create a production order (via Production Order API)
2. Add the production order to the schedule queue (via `/scheduleOrderQueues/add-production-order-to-queue/:id`)
3. Update timing information as needed (via `/scheduleOrders/:id`)
4. Progress the schedule order through its lifecycle using the queue management endpoints
5. Complete the schedule order when production is finished

# WHK Recipe Configuration API

## Development Mode Authentication Bypass

When `NODE_ENV=development` is set in your environment variables, the authentication system will automatically bypass JWT validation for requests that don't include an Authorization header. This makes development and testing much easier while still allowing authentication to work when provided.

### How it works:

1. **Development Mode (`NODE_ENV=development`)**:

   - ✅ Requests without Authorization header: **Allowed**
   - ✅ Requests with valid Authorization header: **Validated and allowed**
   - ❌ Requests with invalid Authorization header: **Rejected**

2. **Production Mode (any other `NODE_ENV`)**:

   - ❌ Requests without Authorization header: **Rejected**
   - ✅ Requests with valid Authorization header: **Validated and allowed**
   - ❌ Requests with invalid Authorization header: **Rejected**

3. **Public Routes (marked with `@Public()` decorator)**:
   - ✅ Always allowed regardless of environment or authentication

### Setting up Development Mode:

1. Create a `.env` file in the project root (if it doesn't exist)
2. Add the following line:
   ```
   NODE_ENV=development
   ```
3. Restart your NestJS application

### Example Usage:

```bash
# In development mode, these requests will work without authentication:
curl http://localhost:3000/api/recipes
curl http://localhost:3000/api/users

# You can still use authentication if needed:
curl -H "Authorization: Bearer your-jwt-token" http://localhost:3000/api/recipes
```

### Security Note:

⚠️ **Important**: This bypass only works when `NODE_ENV=development`. In production, staging, or any other environment, authentication is always required (unless the route is marked as `@Public()`).

## Authentication Guards

The application uses two main authentication guards:

- **`DefaultAuthGuard`**: For REST API endpoints
- **`GqlDefaultAuthGuard`**: For GraphQL resolvers

Both guards support the development mode bypass functionality described above.

# Permissions and Access Control

This application uses a sophisticated role-based access control (RBAC) system with optimized permission management. The system has been optimized to reduce the grants file size by 72.6% while maintaining full functionality.

## Permission System Overview

The application uses **nest-access-control** with an optimized permission service that implements role inheritance to dramatically reduce permission duplication.

### Key Components

- **`OptimizedPermissionService`**: Manages role inheritance and permission resolution
- **`ACLModule`**: Configures the access control system
- **`@UseRoles()` decorators**: Applied to controllers and resolvers to enforce permissions

### Role Hierarchy

The system uses a 3-tier role hierarchy:

#### Base Roles (Full Permissions)

- **`admin`**: Full access to all resources with create, read, update, delete permissions
- **`operationsDistilleryOperator`**: Read-only access to all resources
- **`user`**: Read-own access to all resources

#### Inherited Roles

Roles that inherit permissions from base roles:

**Admin Group** (inherits from `admin`):

- `manager`
- `operator`
- `supervisor`

**Operations Group** (inherits from `operationsDistilleryOperator`):

- `eTAdmin`
- `eTDeveloper`
- `operationDistilleryOperator`
- `operationsDistilleryLeadership`
- `operationsDistilleryShiftlead`
- `operationsDistillerySupervisor`

### Permission Actions

The system supports these permission actions:

- **`create:any`**: Create any resource
- **`read:any`**: Read any resource
- **`update:any`**: Update any resource
- **`delete:any`**: Delete any resource
- **`read:own`**: Read only resources owned by the user

### Resource Naming Convention

⚠️ **Important**: All resource names use **PascalCase** to match the resolver expectations:

- ✅ `"ProductionOrder"` (correct)
- ❌ `"productionOrder"` (incorrect)

## Adding New Permissions

### Method 1: Adding a New Resource

When adding a new resource to the system, you need to update the `OptimizedPermissionService`:

1. **Edit the service file**: `src/auth/optimized-permission.service.ts`

2. **Add the resource to each base role** in the `basePermissions` object:

```typescript
// In the constructor, add to each base role:
"admin": [
  // ... existing permissions ...
  { "resource": "NewResource", "action": "create:any", "attributes": "*" },
  { "resource": "NewResource", "action": "read:any", "attributes": "*" },
  { "resource": "NewResource", "action": "update:any", "attributes": "*" },
  { "resource": "NewResource", "action": "delete:any", "attributes": "*" }
],
"operationsDistilleryOperator": [
  // ... existing permissions ...
  { "resource": "NewResource", "action": "read:any", "attributes": "*" }
],
"user": [
  // ... existing permissions ...
  { "resource": "NewResource", "action": "read:own", "attributes": "*" }
]
```

3. **Apply the permission decorator** to your controller/resolver:

```typescript
@UseRoles({
  resource: "NewResource",
  action: "read",
  possession: "any"
})
async findMany() {
  // Your implementation
}
```

### Method 2: Adding a New Role

To add a completely new role:

1. **Determine inheritance**: Decide if the role should inherit from an existing base role or be a new base role

2. **For inherited roles**, add to `roleInheritance`:

```typescript
roleInheritance: {
  // ... existing mappings ...
  "newRole": "admin" // or "operationsDistilleryOperator" or "user"
}
```

3. **For base roles**, add to `basePermissions`:

```typescript
basePermissions: {
  // ... existing roles ...
  "newBaseRole": [
    { "resource": "SomeResource", "action": "read:any", "attributes": "*" },
    // ... define all permissions for this role
  ]
}
```

### Method 3: Adding Unique Permissions

For role-specific permissions that don't fit the inheritance model:

```typescript
uniquePermissions: {
  "admin": [
    { "resource": "EnzymeConfiguration", "action": "read:any", "attributes": "*" }
  ],
  "specialRole": [
    { "resource": "SpecialResource", "action": "special:action", "attributes": "*" }
  ]
}
```

## Testing Permissions

### Debug Script

Use the provided debug script to test permissions:

```bash
# Test the optimized permission service
node debug-permissions.js
```

### Manual Testing

```typescript
// Test if a role has a specific permission
const service = new OptimizedPermissionService();
const hasPermission = service.hasPermission(
  "admin",
  "ProductionOrder",
  "read:any"
);
console.log(hasPermission); // true
```

### Verify Full Grants Generation

```typescript
// Generate the full grants array for nest-access-control
const service = new OptimizedPermissionService();
const fullGrants = service.generateFullGrants();
console.log(`Total permissions: ${fullGrants.length}`);
```

## Optimization Statistics

The current optimization provides:

- **Original size**: ~2,698 permission entries
- **Optimized size**: ~740 permission entries
- **Reduction**: 72.6% smaller
- **Roles supported**: 11 total roles
- **Resources covered**: 50+ resources

## Troubleshooting

### Common Issues

1. **"Forbidden resource" errors**:

   - Check resource name casing (must be PascalCase)
   - Verify the user's role has the required permission
   - Ensure the application has been restarted after permission changes

2. **Case sensitivity issues**:

   - Resource names in `OptimizedPermissionService` must match exactly what's used in `@UseRoles()` decorators
   - Use PascalCase for all resource names

3. **Permission not found**:
   - Check if the role inherits from the correct base role
   - Verify the permission exists in the base role's permissions
   - Check for typos in resource or action names

### Debugging Commands

```bash
# Check what permissions a role has
node -e "
const service = require('./src/auth/optimized-permission.service').OptimizedPermissionService;
const s = new service();
console.log(s.getPermissionsForRole('admin'));
"

# Verify resource exists
grep -r "ProductionOrder" src/auth/optimized-permission.service.ts
```

## Migration from Original System

If you need to revert to the original grants system:

1. **Restore original ACL module**:

```typescript
// In src/auth/acl.module.ts
import { grants } from "./grants.json";

@Module({
  imports: [AccessControlModule.forRoles(grants)],
  exports: [AccessControlModule],
})
export class ACLModule {}
```

2. **Update imports** to remove `OptimizedPermissionService`

3. **Restart the application**

The optimized system is fully backward compatible and generates the same permission structure as the original system.

# Production Order Wizard Endpoint

## Overview

The Production Order Wizard endpoint provides a comprehensive way to create production orders from frontend wizard data with complex payload structures.

## Endpoint

```
POST /productionOrders/createFromWizard
```

## Features

- **Item Number Generation**: Automatically generates item numbers using the format: `CUS-%%-%%-%%-%%-53-04-4-4-0-120-R01`

  - CUS = customer code from customer record & recipe
  - %%-%%-%%-%% = mash bill derived from recipe BOM
  - 53-04-4-4-0 = barrel record info (only for barrel container type)
  - 120 = final (entry) proof
  - R01 = item revision

- **BOM Creation**: Creates BOM records from wizard BOM items array
- **Item Management**: Creates or finds items with generated item numbers
- **Schedule Integration**: Creates schedule orders and queue entries
- **Bin Configuration**: Links bin configurations to production orders
- **Comprehensive Error Handling**: Validates all referenced entities

## Request Payload

```json
{
  "productionOrder": {
    "orderName": "PRO-20250602016",
    "quantity": 500,
    "units": "clyd1ofse0049fd459dm45878",
    "priority": "medium",
    "startDate": "2025-06-01",
    "endDate": "2025-06-06",
    "customerCode": "CUST001",
    "notes": "Special batch for premium whiskey",
    "finalProof": 120,
    "containerType": "LargeBarrel",
    "fermenters": 7,
    "cooks": 14,
    "totalGrainLoad": 3500,
    "estBblsPerFerm": 75,
    "estPGsPerBshl": 2.8,
    "estPGsPerBbl": 50,
    "upperControlLimit": 525,
    "lowerControlLimit": 475
  },
  "recipe": {
    "id": "cm8vv2gu600zkbseoolyfhz6x",
    "Recipe": "Premium Bourbon Mash",
    "whiskeyType": "Bourbon"
  },
  "bomItems": [
    {
      "id": "bom-item-1",
      "itemCode": "CORN-001",
      "name": "Yellow Corn",
      "quantity": 2000,
      "unit": "lbs",
      "category": "Grain",
      "itemGroup": "RM-GR"
    }
  ],
  "binConfigurations": {
    "sil110ConfigId": "config-sil110-001",
    "sil115ConfigId": "config-sil115-001",
    "sil120ConfigId": "config-sil120-001",
    "totalCooks": 14,
    "totalFermenters": 7,
    "cooksPerFermenter": 2,
    "entryProof": 120,
    "proofGallonsPerBarrel": 50,
    "barrelsPerFermenter": 75
  },
  "scheduleOrder": {
    "estimatedStart": "2025-06-01T08:00:00Z",
    "estimatedEnd": "2025-06-06T17:00:00Z",
    "totalBarrels": 525,
    "totalProofGallons": 26250,
    "duration": 120,
    "durationUnits": "hours"
  },
  "metadata": {
    "createdBy": "user@example.com",
    "source": "production-order-wizard",
    "version": "1.0"
  }
}
```

## Response

```json
{
  "productionOrder": {
    /* ProductionOrder object */
  },
  "item": {
    /* Created/found Item object */
  },
  "bom": {
    /* Created BOM object */
  },
  "scheduleOrder": {
    /* Created ScheduleOrder object */
  },
  "scheduleOrderQueue": {
    /* Created ScheduleOrderQueue object */
  }
}
```

## Error Responses

- **400 Bad Request**: Invalid input data or validation errors
- **404 Not Found**: Referenced entities (recipe, customer, etc.) not found

## Implementation Details

### Service Methods

- `createProductionOrderFromWizard()`: Main orchestration method
- `generateItemNumber()`: Creates formatted item numbers
- `getMashBillFromRecipe()`: Extracts mash bill from recipe BOM
- `createOrFindItem()`: Item management
- `createBomFromWizardItems()`: BOM creation from wizard data
- `createScheduleOrderFromWizard()`: Schedule order creation
- `createProductionOrderFromWizardData()`: Final production order creation

### Database Models Used

- ProductionOrder
- Item
- BOM/BomItem
- Customer
- Recipe/RecipeBom
- ScheduleOrder/ScheduleOrderQueue
- Units/UnitLookup

### Validation

- Recipe existence
- Customer code validation
- Units validation
- Container type requirements
- Required field validation via DTOs
