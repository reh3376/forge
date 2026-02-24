import { chromium, FullConfig } from '@playwright/test'

/**
 * Global teardown for E2E tests
 * 
 * This function runs once after all tests to clean up:
 * 1. Test data from the database
 * 2. Any temporary files or resources
 */
async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting E2E test global teardown...')

  const backendURL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3010'

  // Launch browser for cleanup
  const browser = await chromium.launch()
  const page = await browser.newPage({
    extraHTTPHeaders: {
      'X-E2E-Testing': 'true',
    },
  })

  try {
    // Clean up test data
    console.log('🗑️  Cleaning up test data...')
    await cleanupTestData(page, backendURL)

    console.log('✅ Global teardown completed successfully!')

  } catch (error) {
    console.warn('⚠️  Global teardown had issues, but continuing...', error)
  } finally {
    await browser.close()
  }
}

/**
 * Clean up test data created during E2E tests
 */
async function cleanupTestData(page: any, backendURL: string) {
  try {
    // Delete test recipes
    const deleteTestRecipesResponse = await page.request.post(`${backendURL}/graphql`, {
      data: {
        query: `
          mutation DeleteTestRecipes {
            deleteManyRecipes(
              where: {
                OR: [
                  { name: { contains: "E2E Test" } }
                  { name: { contains: "Test Recipe" } }
                  { description: { contains: "E2E testing" } }
                ]
              }
            ) {
              count
            }
          }
        `,
      },
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (deleteTestRecipesResponse.ok()) {
      const deleteData = await deleteTestRecipesResponse.json()
      if (!deleteData.errors) {
        const count = deleteData.data?.deleteManyRecipes?.count || 0
        console.log(`✅ Cleaned up ${count} test recipes`)
      } else {
        console.warn('⚠️  Recipe cleanup had errors:', deleteData.errors)
      }
    } else {
      console.warn('⚠️  Recipe cleanup request failed')
    }

  } catch (error) {
    console.warn('⚠️  Test data cleanup failed:', error)
  }
}

export default globalTeardown 