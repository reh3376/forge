import { test as base, expect, Page } from '@playwright/test'

/**
 * Extended Playwright test fixture with authentication helpers.
 *
 * When NEXT_PUBLIC_E2E_AUTO_LOGIN=true is set (configured in playwright.config.ts),
 * the app will automatically sign in with a demo user (OPS_DISTILLERY_SUPERVISOR role).
 *
 * This fixture provides additional helpers for:
 * - Waiting for auth to be ready
 * - Verifying authenticated state
 * - Navigating to protected routes
 */

export interface AuthFixtures {
  /** Wait for the app to be fully loaded and authenticated */
  waitForAuth: () => Promise<void>
  /** Navigate to a protected route and wait for it to load */
  navigateAuthenticated: (path: string) => Promise<void>
  /** Check if the user is authenticated */
  isAuthenticated: () => Promise<boolean>
}

export const test = base.extend<AuthFixtures>({
  waitForAuth: async ({ page }, use) => {
    const waitForAuth = async () => {
      // Wait for the page to be fully loaded
      await page.waitForLoadState('networkidle')

      // Wait for auth state to settle (look for authenticated UI elements)
      // The app should show user info or authenticated content when logged in
      await page.waitForFunction(() => {
        // Check if the auth context has loaded
        // Look for signs that authentication has completed
        const body = document.body.textContent || ''

        // If we see "Log Into" button prominently, auth might not be complete
        // If we see the main navigation and no login prompts, we're good
        const hasLoginPrompt = body.includes('Authentication Required')
        const hasMainNav = document.querySelector('nav[aria-label="Breadcrumb"]') !== null

        return hasMainNav || !hasLoginPrompt
      }, { timeout: 10000 })
    }

    await use(waitForAuth)
  },

  navigateAuthenticated: async ({ page }, use) => {
    const navigateAuthenticated = async (path: string) => {
      await page.goto(path)
      await page.waitForLoadState('networkidle')

      // Verify we're not stuck on auth screen
      const authRequired = await page.locator('text=Authentication Required').count()
      if (authRequired > 0) {
        throw new Error(`Authentication required to access ${path}. Ensure NEXT_PUBLIC_E2E_AUTO_LOGIN=true is set.`)
      }

      // Wait for breadcrumb navigation to appear (indicates page loaded successfully)
      await page.waitForSelector('nav[aria-label="Breadcrumb"]', { timeout: 10000 })
    }

    await use(navigateAuthenticated)
  },

  isAuthenticated: async ({ page }, use) => {
    const isAuthenticated = async (): Promise<boolean> => {
      // Check for signs of authenticated state
      const authRequired = await page.locator('text=Authentication Required').count()
      const loginButton = await page.locator('text=Log Into Whiskey House').count()

      // If we see login prompts, not authenticated
      if (authRequired > 0) return false

      // If login button is visible but no auth required message, might be authenticated
      // Check for user-specific content
      const hasUserContent = await page.locator('[data-testid="user-menu"], [data-testid="authenticated-content"]').count()

      return hasUserContent > 0 || (loginButton === 0 && authRequired === 0)
    }

    await use(isAuthenticated)
  },
})

export { expect }

/**
 * Helper to set up auth for tests that don't use the fixture.
 * Call this at the start of your test to ensure auth is ready.
 */
export async function setupAuth(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle')

  // Give auth state time to initialize
  await page.waitForTimeout(500)

  // Check if we need to wait for auto-login to complete
  const maxWaitTime = 5000
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitTime) {
    const authRequired = await page.locator('text=Authentication Required').count()
    if (authRequired === 0) {
      return // Auth is ready
    }
    await page.waitForTimeout(100)
  }

  console.warn('Auth setup: Timed out waiting for auto-login. Tests may fail.')
}

/**
 * Skip authentication check for specific tests.
 * Useful when testing auth-related functionality.
 */
export function skipAuthCheck(): void {
  // This is a marker function - tests can check for this in beforeEach
}
