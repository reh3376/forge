import { defineConfig, devices } from '@playwright/test'

/**
 * E2E Testing Configuration for Playwright
 * 
 * This configuration is specifically designed for end-to-end testing with:
 * - Authentication bypass enabled via environment variables
 * - Isolated test environment using Docker containers
 * - Comprehensive browser coverage including mobile
 * - Proper test setup and teardown
 */
export default defineConfig({
  testDir: './e2e',
  
  /* Global setup and teardown */
  globalSetup: require.resolve('./e2e/global-setup'),
  globalTeardown: require.resolve('./e2e/global-teardown'),
  
  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env['CI'],
  
  /* Retry on CI only */
  retries: process.env['CI'] ? 2 : 0,
  
  /* Opt out of parallel tests on CI */
  workers: process.env['CI'] ? 1 : 2,
  
  /* Reporter to use */
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/results.xml' }]
  ],
  
  /* Shared settings for all projects */
  use: {
    /* Base URL for E2E testing environment */
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] || 'http://localhost:4000',
    
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on failure */
    video: 'retain-on-failure',
    
    /* E2E Testing headers to ensure bypass is active */
    extraHTTPHeaders: {
      'X-E2E-Testing': 'true',
      'X-E2E-Auth-Bypass': 'true'
    },
    
    /* Ignore HTTPS errors in test environment */
    ignoreHTTPSErrors: true,
    
    /* Timeout for each action */
    actionTimeout: 10000,
    
    /* Timeout for navigation */
    navigationTimeout: 30000
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Use a consistent viewport for desktop testing
        viewport: { width: 1280, height: 720 }
      },
    },

    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 }
      },
    },

    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari'],
        viewport: { width: 1280, height: 720 }
      },
    },

    /* Test against mobile viewports */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },

    /* Test against branded browsers */
    {
      name: 'Microsoft Edge',
      use: { 
        ...devices['Desktop Edge'], 
        channel: 'msedge',
        viewport: { width: 1280, height: 720 }
      },
    },
  ],

  /* Global test timeout */
  timeout: 60000,
  
  /* Expect timeout for assertions */
  expect: {
    timeout: 10000
  },

  /* Output directories */
  outputDir: 'test-results/',
  
  /* Don't start a dev server - we expect Docker containers to be running */
  // webServer is intentionally omitted as we use Docker compose for E2E environment
}); 