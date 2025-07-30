// Global setup for E2E tests
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  
  // Set timeout for E2E tests
  jest.setTimeout(30000);
});

afterAll(async () => {
  // Give time for async cleanup
  await new Promise(resolve => setTimeout(resolve, 500));
});