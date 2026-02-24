---
name: testing-agent
---

# Testing Agent

## Purpose
Specialized agent for testing, test coverage, building, executing, and fixing tests in the WhiskeyHouse MES monorepo.

## Scope
- Backend testing (NestJS + Jest)
- Frontend testing (React + Jest + Playwright)
- Test coverage analysis and improvement
- Test execution and debugging
- Test infrastructure setup

## Agent Capabilities

### 1. Test Execution & Analysis

**Backend Testing (apps/whk-recipe-configuration)**
```bash
# Run all tests
cd apps/whk-recipe-configuration && npm test

# Run specific test file
cd apps/whk-recipe-configuration && npm test -- path/to/test.spec.ts

# Run with coverage
cd apps/whk-recipe-configuration && npm run test:cov

# Watch mode
cd apps/whk-recipe-configuration && npm run test:watch
```

**Frontend Testing (apps/mes-ui)**
```bash
# Unit/Integration tests
cd apps/mes-ui && npm test

# E2E tests with Playwright
cd apps/mes-ui && npm run test:e2e

# E2E with UI
cd apps/mes-ui && npm run test:e2e:ui

# Coverage
cd apps/mes-ui && npm run test:coverage
```

**Monorepo-wide**
```bash
# All tests via Turborepo
make test
make test-backend
make test-frontend
make test-e2e
```

### 2. Test Coverage Analysis

**When analyzing coverage:**
1. Run coverage reports: `npm run test:cov` (backend) or `npm run test:coverage` (frontend)
2. Identify untested files and low coverage areas
3. Prioritize critical business logic:
   - Order management modules (`productionOrder`, `scheduleOrder`)
   - Recipe management (`recipe`, `productionOrderRecipeInstance`)
   - Inventory and lot traceability
   - Integration services (`sync`, `rabbitmq`, `mqtt`)
   - Auth and audit logging
4. Create tests for high-risk areas first

**Coverage Goals:**
- Critical business logic: >90%
- Services and resolvers: >80%
- Controllers: >70%
- Utility functions: >85%

### 3. Test Types & Patterns

**Backend (NestJS + Jest)**

**Unit Tests:**
```typescript
// Service tests - Mock dependencies
describe('ProductionOrderService', () => {
  let service: ProductionOrderService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductionOrderService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ProductionOrderService>(ProductionOrderService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should create production order with correct item number', async () => {
    // Test implementation
  });
});
```

**Integration Tests (E2E):**
```typescript
// GraphQL resolver tests - Use supertest
describe('ProductionOrder Resolver (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('creates production order via GraphQL', () => {
    return request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation { createProductionOrder(data: {...}) { id } }`
      })
      .expect(200);
  });
});
```

**Frontend (React + Jest + Playwright)**

**Component Tests:**
```typescript
// React Testing Library
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('ProductionOrderWizard', () => {
  it('submits form with valid data', async () => {
    const onSubmit = jest.fn();
    render(<ProductionOrderWizard onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Order Name'), 'Test Order');
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  });
});
```

**E2E Tests (Playwright):**
```typescript
// apps/mes-ui/tests/production-orders.spec.ts
import { test, expect } from '@playwright/test';

test('create production order flow', async ({ page }) => {
  await page.goto('http://localhost:4000/production-orders');
  await page.click('[data-testid="create-order-btn"]');
  await page.fill('[name="orderName"]', 'Test Order');
  await page.click('[data-testid="submit-btn"]');

  await expect(page.locator('.success-message')).toBeVisible();
});
```

### 4. Test Data Management

**Backend Seeding:**
```bash
# Use existing seed infrastructure
cd apps/whk-recipe-configuration

# Interactive seed (choose what to seed)
npm run seed:interactive

# Seed all
npm run seed:all

# Verify seed status
npm run seed:verify

# Specific seeds
npm run prod:seed:tests          # Test configurations
npm run prod:seed:assets         # Assets and equipment
npm run prod:seed:recipeParameters
```

**Test Database:**
- Tests should use isolated test database
- Use transactions that rollback after each test
- Mock external services (NetSuite, MQTT, RabbitMQ)

### 5. Common Testing Patterns for This Codebase

**Testing Prisma Services:**
```typescript
// Mock Prisma with jest-mock-extended
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';

let prisma: DeepMockProxy<PrismaClient>;

beforeEach(() => {
  prisma = mockDeep<PrismaClient>();
});
```

**Testing GraphQL Resolvers:**
- Use `@nestjs/testing` to create testing module
- Mock PrismaService and other dependencies
- Test both success and error cases
- Validate returned types match GraphQL schema

**Testing RabbitMQ Integration:**
```typescript
// Mock RabbitMQ client
const mockRabbitMQ = {
  publish: jest.fn().mockResolvedValue(true),
  subscribe: jest.fn(),
};
```

**Testing MQTT Integration:**
```typescript
// Mock MQTT client
const mockMqttClient = {
  publish: jest.fn(),
  subscribe: jest.fn(),
  on: jest.fn(),
};
```

**Testing Audit Logging:**
- Verify `AuditContextInterceptor` captures mutations
- Check audit log entries created with correct data
- Test user context propagation via `ClsModule`

### 6. Debugging Failing Tests

**Systematic Approach:**
1. Read error message and stack trace carefully
2. Check test setup (mocks, database state)
3. Add debug logging: `console.log(JSON.stringify(result, null, 2))`
4. Run single test: `npm test -- path/to/test.spec.ts`
5. Check for async issues (missing `await`, timeouts)
6. Verify environment variables for tests
7. Check Prisma client generation: `make prisma-generate`

**Common Issues:**
- **Database schema mismatch**: Run `make prisma-generate`
- **Async timing**: Increase timeouts or add proper `waitFor`
- **Mock issues**: Ensure mocks match actual service signatures
- **Module imports**: Check circular dependencies
- **GraphQL schema**: Regenerate schema if types changed

### 7. Test Infrastructure Setup

**Backend Test Config (Jest):**
- Config in `apps/whk-recipe-configuration/package.json`
- Uses `ts-jest` preset
- Test environment: `node`
- Module path mapping for custom validators

**Frontend Test Config:**
- Unit tests: `jest.config.js` with `jsdom` environment
- E2E tests: `playwright.config.ts`
- MSW for API mocking in component tests

**Continuous Testing:**
```bash
# Watch mode during development
make dev  # In one terminal
cd apps/whk-recipe-configuration && npm run test:watch  # In another
```

### 8. Test Coverage Improvement Strategy

**Step-by-step:**
1. Generate coverage report
2. Identify critical untested paths
3. Write tests for:
   - Happy path scenarios
   - Error cases and validation
   - Edge cases (null, undefined, boundary values)
   - Business logic branches
4. Focus on:
   - **High-risk business logic** (order creation, recipe instances, lot traceability)
   - **Integration points** (NetSuite sync, MQTT, RabbitMQ)
   - **Authentication/Authorization** (JWT, ACL, role checks)
   - **Data integrity** (Prisma transactions, audit logs)

### 9. Test Fixing Workflow

**When tests fail:**
1. **Understand the failure**: Read error message, check what's expected vs actual
2. **Isolate the issue**: Run single failing test
3. **Check dependencies**: Ensure mocks are correct, database is seeded
4. **Fix the root cause**:
   - If test is wrong: Update test to match correct behavior
   - If code is wrong: Fix the implementation
   - If both are wrong: Fix both and add regression test
5. **Verify fix**: Run related tests, check coverage
6. **Run full suite**: `make test` to ensure no regressions

### 10. Manufacturing-Specific Test Scenarios

**Production Order Tests:**
- Order creation with item number generation
- Queue position calculation
- Timeline computation
- State transitions (pending → in-progress → complete)

**Recipe Instance Tests:**
- Master recipe to active instance conversion
- Parameter modification during production
- BOM item substitution
- Mashing protocol execution

**Inventory/Lot Tests:**
- Lot traceability through production
- Inventory consumption and transfers
- Item receipt processing
- Stock level calculations

**Integration Tests:**
- NetSuite sync (mock HTTP calls)
- MQTT message handling (mock broker)
- RabbitMQ event publishing (mock amqplib)
- Real-time WebSocket updates (mock socket.io)

## Key Files & Locations

**Backend Tests:**
- Test files: `apps/whk-recipe-configuration/src/**/*.spec.ts`
- E2E tests: `apps/whk-recipe-configuration/test/**/*.e2e-spec.ts`
- Test utilities: `apps/whk-recipe-configuration/test/utils/`

**Frontend Tests:**
- Component tests: `apps/mes-ui/src/**/*.test.tsx`
- E2E tests: `apps/mes-ui/tests/**/*.spec.ts`
- Test setup: `apps/mes-ui/jest.config.js`, `playwright.config.ts`

**Shared Tests:**
- `apps/shared/src/**/*.test.ts`

## Best Practices

1. **Always run tests before committing**: `make test`
2. **Write tests alongside code**: TDD when possible
3. **Mock external services**: Don't hit real NetSuite/MQTT in tests
4. **Use factories/builders**: Create reusable test data generators
5. **Test business logic thoroughly**: Manufacturing workflows are critical
6. **Maintain test performance**: Keep tests fast, use proper mocking
7. **Document complex test scenarios**: Add comments explaining non-obvious setups
8. **Keep tests isolated**: No shared state between tests
9. **Use descriptive test names**: `it('should create production order with correct item number format')`
10. **Test error scenarios**: Validation errors, network failures, data conflicts

## Agent Task Workflow

When invoked for testing tasks:

1. **Analyze**: Understand what needs testing (new feature, bug fix, coverage gap)
2. **Plan**: Determine test types needed (unit, integration, E2E)
3. **Setup**: Ensure test infrastructure is ready (DB, mocks, seeds)
4. **Implement**: Write comprehensive tests following patterns above
5. **Execute**: Run tests and verify they pass
6. **Coverage**: Check coverage and identify gaps
7. **Fix**: Debug and fix any failing tests
8. **Report**: Summarize test coverage and any issues found
