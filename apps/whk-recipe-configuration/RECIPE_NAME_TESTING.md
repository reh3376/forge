# Recipe Name Functionality - Testing Guide

This document describes the comprehensive testing suite for the new recipe name functionality in the lot service.

## 🧪 Test Coverage Overview

The testing suite includes:

1. **Unit Tests** - Test individual methods and functions
2. **Integration Tests** - Test service interactions with database
3. **Controller Tests** - Test HTTP endpoint functionality  
4. **End-to-End Tests** - Test complete API workflows
5. **Manual Test Script** - Interactive testing tool

## 📁 Test Files Structure

```
apps/whk-recipe-configuration/src/lot/
├── lot.service.spec.ts              # Unit tests for LotService
├── lot.controller.spec.ts           # Enhanced controller tests
├── lot.integration.spec.ts          # Integration tests
└── test-recipe-name-functionality.js # Manual test script

apps/whk-recipe-configuration/
├── jest-e2e.config.js              # E2E test configuration
├── src/test-setup-e2e.ts           # E2E test setup
└── package.json                    # Updated with test scripts
```

## 🚀 Running Tests

### Unit Tests
```bash
# Run all lot service unit tests
npm test -- lot.service.spec.ts

# Run with coverage
npm test -- lot.service.spec.ts --coverage
```

### Integration Tests  
```bash
# Run enhanced controller tests
npm test -- lot.controller.spec.ts
```

### Integration Tests
```bash
# Run integration test suite
npm test -- lot.integration.spec.ts
```

### End-to-End Tests
```bash
# Run E2E tests (when implemented)
npm run test:e2e

# Note: E2E configuration ready, tests can be added as needed
```

### Manual Testing
```bash
# Run interactive test script
node test-recipe-name-functionality.js

# Prerequisites:
# - API server running on http://localhost:3000
# - Valid test data in database
```

## 🎯 Test Coverage Areas

### 1. Whiskey Type Detection (`lot.service.spec.ts`)

Tests the automatic whiskey type detection from recipe names:

- ✅ **MaltWhiskey** detection from "Single Malt", "MALT"
- ✅ **WheatedBourbon** detection from "Wheat Bourbon"  
- ✅ **WheatWhiskey** detection from "Wheat Whiskey"
- ✅ **RyeWhiskey** detection from "Rye Whiskey"
- ✅ **FourGrainBourbon** detection from "Four Grain Bourbon", "4 Grain Bourbon"
- ✅ **FourGrainWhiskey** detection from "Four Grain Whiskey"
- ✅ **Default to RyeBourbon** for unknown types

### 2. Whiskey Type Mapping (`lot.service.spec.ts`)

Tests mapping from lot whiskey types to recipe whiskey types:

- ✅ `AmericanSingleMalt` → `MaltWhiskey`
- ✅ `RyeBourbon` → `RyeBourbon`
- ✅ `WheatedBourbon` → `WheatedBourbon`
- ✅ `WheatWhiskey` → `WheatWhiskey`
- ✅ `RyeWhiskey` → `RyeWhiskey`
- ✅ `CornBourbon` → `RyeBourbon` (default mapping)
- ✅ `CornWhiskey` → `RyeBourbon` (default mapping)

### 3. Recipe Processing (`lot.service.spec.ts`)

Tests the recipe input processing logic:

- ✅ **String input** treated as recipe name
- ✅ **Object with connect.id** treated as recipe ID
- ✅ **Object with id** treated as recipe ID  
- ✅ **Invalid input** throws appropriate error
- ✅ **Whiskey type** passed through correctly

### 4. Recipe Creation (`lot.service.spec.ts`)

Tests automatic recipe creation when recipe doesn't exist:

- ✅ **Find existing recipe** by name and return ID
- ✅ **Create new recipe** when not found
- ✅ **Create default customer** if none exists
- ✅ **Create associated item** for the recipe
- ✅ **Apply correct whiskey type** based on detection/mapping
- ✅ **Proper error handling** for invalid scenarios

### 5. Lot Creation Integration (`lot.service.spec.ts`, `lot.controller.spec.ts`)

Tests lot creation with recipe names:

- ✅ **Create lot with recipeName** parameter
- ✅ **Create lot with recipe ID** (backward compatibility)
- ✅ **Auto-create recipe** when name doesn't exist
- ✅ **Link to existing recipe** when name exists
- ✅ **Error when neither** recipe nor recipeName provided
- ✅ **Proper whiskey type** handling in all scenarios

### 6. Lot Updates Integration (`lot.service.spec.ts`, `lot.controller.spec.ts`)

Tests lot updates with recipe names:

- ✅ **Update lot with recipeName** parameter
- ✅ **Update lot with recipe ID** (backward compatibility)  
- ✅ **Skip recipe processing** when neither provided
- ✅ **Create new recipe** when updating with new name
- ✅ **Link to existing recipe** when updating with existing name

### 7. Integration Workflows (`lot.integration.spec.ts`)

Tests complete service workflows with mocked dependencies:

- ✅ **Create lot with new recipe name** → auto-creates recipe
- ✅ **Create lot with existing recipe name** → links to existing
- ✅ **Update lot with recipe name** → creates/links recipes
- ✅ **Error handling** for invalid requests
- ✅ **Whiskey type detection** integration
- ✅ **Recipe creation flow** verification

## 🧩 Key Test Scenarios

### Scenario 1: New Recipe Auto-Creation
```javascript
// Input
{
  recipeName: "American Single Malt Recipe",
  whiskeyType: "AmericanSingleMalt",
  // ... other lot data
}

// Expected Behavior
// 1. Check if recipe "American Single Malt Recipe" exists
// 2. Recipe not found → create new recipe
// 3. Create default customer if needed
// 4. Create item for recipe  
// 5. Detect/map whiskey type: AmericanSingleMalt → MaltWhiskey
// 6. Create recipe with proper whiskey type
// 7. Create lot linked to new recipe
```

### Scenario 2: Existing Recipe Reuse
```javascript
// Input  
{
  recipeName: "Existing Recipe Name",
  // ... other lot data
}

// Expected Behavior
// 1. Check if recipe "Existing Recipe Name" exists
// 2. Recipe found → use existing recipe ID
// 3. Create lot linked to existing recipe
// 4. No new recipe/item/customer creation
```

### Scenario 3: Backward Compatibility
```javascript
// Input (existing client code)
{
  recipe: { connect: { id: "recipe-123" } },
  // ... other lot data  
}

// Expected Behavior
// 1. Process recipe ID as before
// 2. Create lot linked to specified recipe
// 3. No changes to existing functionality
```

## 🔧 Test Data Requirements

### For E2E Tests:
- Test database with proper schema
- Valid customer records
- Valid item records  
- Valid production order records
- Proper foreign key relationships

### For Unit Tests:
- Mocked Prisma service
- Mocked RabbitMQ producer
- Mocked Winston logger
- Isolated test environment

## 🐛 Debugging Test Failures

### Common Issues:

1. **Database Connection Errors** (E2E tests)
   - Ensure test database is running
   - Check connection string in `.env.test`
   - Verify schema is up to date

2. **Foreign Key Constraint Errors** 
   - Check test data setup order
   - Ensure all required relationships exist
   - Verify cleanup order in teardown

3. **Mock Configuration Issues** (Unit tests)
   - Verify all Prisma methods are mocked
   - Check mock return values match expected types
   - Ensure mocks are reset between tests

4. **Whiskey Type Detection Failures**
   - Check recipe name patterns in test data
   - Verify case-insensitive matching works
   - Ensure default fallback behavior

## 📊 Coverage Reports

Generate coverage reports to ensure comprehensive testing:

```bash
# Generate detailed coverage report
npm test -- --coverage --coverageDirectory=coverage

# View coverage report
open coverage/lcov-report/index.html
```

### Target Coverage Metrics:
- **Statements**: > 90%
- **Branches**: > 85%  
- **Functions**: > 95%
- **Lines**: > 90%

## 🚦 Continuous Integration

Add to CI/CD pipeline:

```yaml
# Example GitHub Actions step
- name: Run Recipe Name Tests
  run: |
    npm test -- lot.service.spec.ts
    npm test -- lot.controller.spec.ts
    npm run test:e2e -- lot.e2e.spec.ts
```

## 📝 Test Maintenance

### When Adding New Features:
1. Add corresponding unit tests
2. Update integration tests if needed
3. Add E2E scenarios for new workflows
4. Update manual test script with new cases
5. Update this documentation

### When Modifying Existing Code:
1. Update affected test cases
2. Verify all tests still pass
3. Update mock expectations if needed
4. Re-run coverage analysis
5. Update documentation if behavior changes

---

## 🎉 Summary

This comprehensive testing suite ensures the recipe name functionality:

- ✅ **Works correctly** in all scenarios
- ✅ **Maintains backward compatibility** with existing code
- ✅ **Handles edge cases** and error conditions
- ✅ **Provides good coverage** of the codebase
- ✅ **Can be easily maintained** and extended

Run the tests regularly during development and before deploying to ensure the functionality remains robust and reliable. 