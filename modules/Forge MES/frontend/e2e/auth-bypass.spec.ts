import { test, expect } from '@playwright/test'

test.describe('Authentication Bypass E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Set E2E testing headers
    await page.setExtraHTTPHeaders({
      'X-E2E-Testing': 'true',
    })
  })

  test('should bypass authentication and access protected routes', async ({ page }) => {
    // Navigate to a protected route that normally requires authentication
    await page.goto('/recipe-management')

    // Should not see login prompts or authentication errors
    await expect(page.locator('[data-testid="auth-error"]')).toHaveCount(0)
    await expect(page.locator('.auth-error')).toHaveCount(0)
    
    // Should see the protected content in the breadcrumb navigation
    await expect(page.locator('nav[aria-label="Breadcrumb"]')).toContainText('Recipe Management')
  })

  test('should access GraphQL API without authentication', async ({ page }) => {
    const backendURL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000'

    // Test GraphQL query without authentication headers
    const response = await page.request.post(`${backendURL}/graphql`, {
      data: {
        query: `
          query TestUserInfo {
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
        'X-E2E-Testing': 'true',
      },
    })

    expect(response.status()).toBe(200)

    const data = await response.json()
    expect(data.errors).toBeUndefined()
    expect(data.data.userInfo).toBeDefined()
    expect(data.data.userInfo.username).toBe('dev-user')
    expect(data.data.userInfo.roles).toContain('admin')
  })

  test('should access REST API without authentication', async ({ page }) => {
    const backendURL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000'

    // Test REST endpoint without authentication headers
    const response = await page.request.get(`${backendURL}/api/_health`, {
      headers: {
        'X-E2E-Testing': 'true',
      },
    })

    expect(response.status()).toBe(200)
  })

  test('should have mock user context in frontend', async ({ page }) => {
    await page.goto('/recipe-management')

    // Should be able to access protected content without authentication
    await expect(page.locator('nav[aria-label="Breadcrumb"]')).toContainText('Recipe Management')
    
    // Should not see any authentication errors or login prompts
    await expect(page.locator('[data-testid="login-required"]')).toHaveCount(0)
    await expect(page.locator('.login-prompt')).toHaveCount(0)
  })

  test('should fetch existing recipes via GraphQL with auth bypass', async ({ page }) => {
    const backendURL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000'

    // Fetch existing recipes to verify GraphQL access works with auth bypass
    const fetchResponse = await page.request.post(`${backendURL}/graphql`, {
      data: {
        query: `
          query GetRecipes {
            recipes(take: 5) {
              id
              Recipe
              active
              createdAt
              createdBy
              customerCode
              globalId
              revision
              whiskeyType
            }
          }
        `,
      },
      headers: {
        'Content-Type': 'application/json',
        'X-E2E-Testing': 'true',
      },
    })

    expect(fetchResponse.status()).toBe(200)
    const fetchData = await fetchResponse.json()
    expect(fetchData.errors).toBeUndefined()
    expect(fetchData.data?.recipes).toBeTruthy()
    expect(Array.isArray(fetchData.data.recipes)).toBe(true)
    
    // If we have recipes, validate the structure
    if (fetchData.data.recipes.length > 0) {
      const recipe = fetchData.data.recipes[0]
      expect(recipe.id).toBeTruthy()
      expect(recipe.Recipe).toBeTruthy()
      expect(typeof recipe.active).toBe('boolean')
      expect(recipe.createdAt).toBeTruthy()
      expect(recipe.createdBy).toBeTruthy()
    }

    // Navigate to the frontend and verify recipes page loads
    await page.goto('/recipe-management')
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle')
    
    // Should see the recipe management interface
    await expect(page.locator('nav[aria-label="Breadcrumb"]')).toContainText('Recipe Management')
  })

  test('should handle errors gracefully when backend is unreachable', async ({ page }) => {
    // Mock a failed backend request
    await page.route('**/graphql', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      })
    })

    await page.goto('/recipe-management')
    
    // Should handle the error gracefully and show appropriate error message
    await expect(page.getByText(/error/i)).toBeVisible({ timeout: 10000 })
  })
}) 