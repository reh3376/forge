import { chromium, FullConfig } from '@playwright/test'

/**
 * Global setup for E2E tests
 * 
 * This function runs once before all tests to ensure:
 * 1. Backend services are available
 * 2. Authentication bypass is working
 * 3. Database is properly seeded for testing
 */
async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting E2E test global setup...')

  const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:4000'
  const backendURL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3010'

  // Launch browser for setup checks
  const browser = await chromium.launch()
  const page = await browser.newPage({
    extraHTTPHeaders: {
      'X-E2E-Testing': 'true',
    },
  })

  try {
    // 1. Check if backend is available
    console.log('🔍 Checking backend availability...')
    const healthResponse = await page.request.get(`${backendURL}/health`)
    if (!healthResponse.ok()) {
      throw new Error(`Backend health check failed: ${healthResponse.status()}`)
    }
    console.log('✅ Backend is healthy')

    // 2. Verify authentication bypass is working
    console.log('🔍 Verifying authentication bypass...')
    const authTestResponse = await page.request.post(`${backendURL}/graphql`, {
      data: {
        query: `
          query TestAuth {
            userInfo {
              id
              username
              roles
            }
          }
        `,
      },
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!authTestResponse.ok()) {
      throw new Error(`Authentication bypass test failed: ${authTestResponse.status()}`)
    }

    const authData = await authTestResponse.json()
    if (authData.errors) {
      throw new Error(`GraphQL authentication test failed: ${JSON.stringify(authData.errors)}`)
    }

    const userInfo = authData.data?.userInfo
    if (!userInfo || userInfo.username !== 'e2e-test-user') {
      throw new Error('Authentication bypass not working correctly')
    }

    console.log('✅ Authentication bypass is working')
    console.log(`   Mock user: ${userInfo.username} with roles: ${userInfo.roles.join(', ')}`)

    // 3. Check if frontend is available
    console.log('🔍 Checking frontend availability...')
    const frontendResponse = await page.request.get(baseURL)
    if (!frontendResponse.ok()) {
      throw new Error(`Frontend not available: ${frontendResponse.status()}`)
    }
    console.log('✅ Frontend is available')

    // 4. Verify frontend can load without authentication issues
    console.log('🔍 Testing frontend navigation...')
    await page.goto(baseURL)
    
    // Wait for the page to load and check for any authentication errors
    await page.waitForLoadState('networkidle', { timeout: 30000 })
    
    // Check if there are any authentication-related error messages
    const authErrors = await page.locator('[data-testid="auth-error"], .auth-error, [class*="auth-error"]').count()
    if (authErrors > 0) {
      console.warn('⚠️  Authentication errors detected on frontend, but continuing...')
    } else {
      console.log('✅ Frontend loads without authentication errors')
    }

    // 5. Seed test data if needed
    console.log('🔍 Seeding test data...')
    await seedTestData(page, backendURL)

    console.log('🎉 Global setup completed successfully!')

  } catch (error) {
    console.error('❌ Global setup failed:', error)
    throw error
  } finally {
    await browser.close()
  }
}

/**
 * Seed test data for E2E tests
 */
async function seedTestData(page: any, backendURL: string) {
  try {
    // Create test recipes
    const createRecipeResponse = await page.request.post(`${backendURL}/graphql`, {
      data: {
        query: `
          mutation CreateTestRecipe($data: RecipeCreateInput!) {
            createRecipe(data: $data) {
              id
              name
              status
            }
          }
        `,
        variables: {
          data: {
            name: 'E2E Test Recipe',
            description: 'Recipe created for E2E testing',
            status: 'DRAFT',
            version: '1.0.0',
            category: 'WHISKEY',
          },
        },
      },
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (createRecipeResponse.ok()) {
      const recipeData = await createRecipeResponse.json()
      if (!recipeData.errors) {
        console.log('✅ Test recipe created successfully')
      } else {
        console.warn('⚠️  Recipe creation had errors:', recipeData.errors)
      }
    } else {
      console.warn('⚠️  Recipe creation request failed, but continuing...')
    }

  } catch (error) {
    console.warn('⚠️  Test data seeding failed, but continuing...', error)
  }
}

export default globalSetup 