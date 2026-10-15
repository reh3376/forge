import { test, expect } from '@playwright/test'

test.describe('Scheduling Page Layout Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication to bypass Azure AD login
    await page.route('**/api/auth/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-123',
            username: 'testuser',
            email: 'test@example.com',
            roles: ['scheduling_manager']
          },
          token: 'mock-jwt-token',
          authenticated: true
        })
      })
    })

    // Mock GraphQL queries for production orders
    await page.route('**/api/graphql', async (route) => {
      const request = route.request()
      const postData = request.postData()
      
      if (postData?.includes('GetProductionOrders')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              productionOrders: [
                {
                  id: 'po-1',
                  name: 'Test Production Order 1',
                  status: 'Planned',
                  quantity: 1000,
                  startDate: '2024-01-15T00:00:00.000Z',
                  endDate: '2024-01-22T00:00:00.000Z',
                  completedQuantity: 0,
                  totalCooks: 5,
                  totalFermenters: 2,
                  recipe: {
                    id: 'recipe-1',
                    Recipe: 'Bourbon Mash Bill 1',
                    whiskeyType: 'Bourbon'
                  },
                  customer: {
                    id: 'customer-1'
                  },
                  scheduleOrder: null
                },
                {
                  id: 'po-2',
                  name: 'Test Production Order 2',
                  status: 'InProgress',
                  quantity: 500,
                  startDate: '2024-01-20T00:00:00.000Z',
                  endDate: '2024-01-25T00:00:00.000Z',
                  completedQuantity: 100,
                  totalCooks: 3,
                  totalFermenters: 1,
                  recipe: {
                    id: 'recipe-2',
                    Recipe: 'Rye Mash Bill 2',
                    whiskeyType: 'Rye'
                  },
                  customer: {
                    id: 'customer-2'
                  },
                  scheduleOrder: {
                    id: 'so-1',
                    status: 'Scheduled'
                  }
                }
              ]
            }
          })
        })
      } else if (postData?.includes('GetScheduleOrderQueues')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              scheduleOrderQueues: [
                {
                  id: 'soq-1',
                  queueIndex: 1,
                  scheduleOrder: {
                    id: 'so-1',
                    name: 'Schedule Order 1',
                    recipeName: 'Bourbon Mash Bill 1',
                    status: 'Scheduled',
                    estimatedStart: '2024-01-15T08:00:00.000Z',
                    estimatedEnd: '2024-01-22T17:00:00.000Z',
                    actualStart: null,
                    actualEnd: null,
                    totalBarrels: 100,
                    totalProofGallons: 700,
                    productionOrders: [
                      {
                        id: 'po-2',
                        name: 'Test Production Order 2',
                        status: 'InProgress',
                        recipe: {
                          id: 'recipe-2',
                          Recipe: 'Rye Mash Bill 2',
                          whiskeyType: 'Rye'
                        }
                      }
                    ]
                  }
                },
                {
                  id: 'soq-2',
                  queueIndex: 2,
                  scheduleOrder: {
                    id: 'so-2',
                    name: 'Schedule Order 2',
                    recipeName: 'Wheat Mash Bill 3',
                    status: 'Created',
                    estimatedStart: '2024-01-23T08:00:00.000Z',
                    estimatedEnd: '2024-01-30T17:00:00.000Z',
                    actualStart: null,
                    actualEnd: null,
                    totalBarrels: 150,
                    totalProofGallons: 1050,
                    productionOrders: []
                  }
                }
              ]
            }
          })
        })
      }
    })

    // Navigate to the scheduling page
    await page.goto('/scheduling')
  })

  test('should display the main scheduling interface with correct layout proportions', async ({ page }) => {
    // Wait for the page to load
    await expect(page.getByRole('heading', { name: 'Production Scheduling' })).toBeVisible()
    
    // Check that both main sections are visible
    await expect(page.getByText('Production Orders')).toBeVisible()
    await expect(page.getByText('Schedule Queue')).toBeVisible()
    
    // Verify the grid layout structure
    const mainGrid = page.locator('div').filter({ hasText: 'Production Orders' }).first().locator('..')
    await expect(mainGrid).toHaveClass(/grid/)
    await expect(mainGrid).toHaveClass(/lg:grid-cols-4/)
    
    // Check Production Orders section takes 1/4 space (lg:col-span-1)
    const productionOrdersSection = page.locator('div').filter({ hasText: 'Production Orders' }).first().locator('..')
    await expect(productionOrdersSection).toHaveClass(/lg:col-span-1/)
    
    // Check Schedule Queue section takes 3/4 space (lg:col-span-3)
    const scheduleQueueSection = page.locator('div').filter({ hasText: 'Schedule Queue' }).first().locator('..')
    await expect(scheduleQueueSection).toHaveClass(/lg:col-span-3/)
  })

  test('should display production orders in the left section', async ({ page }) => {
    // Wait for data to load
    await expect(page.getByText('Test Production Order 1')).toBeVisible()
    await expect(page.getByText('Test Production Order 2')).toBeVisible()
    
    // Check that production orders show correct information
    await expect(page.getByText('Bourbon Mash Bill 1')).toBeVisible()
    await expect(page.getByText('Rye Mash Bill 2')).toBeVisible()
    await expect(page.getByText('Bourbon')).toBeVisible()
    await expect(page.getByText('Rye')).toBeVisible()
    
    // Check status badges
    await expect(page.getByText('Planned')).toBeVisible()
    await expect(page.getByText('InProgress')).toBeVisible()
  })

  test('should display schedule queue table in the right section with proper scrolling', async ({ page }) => {
    // Wait for schedule queue data to load
    await expect(page.getByText('Schedule Order 1')).toBeVisible()
    await expect(page.getByText('Schedule Order 2')).toBeVisible()
    
    // Check table headers are visible
    await expect(page.getByText('Index')).toBeVisible()
    await expect(page.getByText('Schedule Order')).toBeVisible()
    await expect(page.getByText('Customer')).toBeVisible()
    await expect(page.getByText('Prod Order')).toBeVisible()
    await expect(page.getByText('Mash Bill')).toBeVisible()
    await expect(page.getByText('Est. PGs')).toBeVisible()
    
    // Check that the table container has proper scrolling classes
    const tableContainer = page.locator('div.overflow-x-auto.max-h-\\[calc\\(100vh-300px\\)\\].overflow-y-auto')
    await expect(tableContainer).toBeVisible()
    
    // Verify schedule queue data
    await expect(page.getByText('Bourbon Mash Bill 1')).toBeVisible()
    await expect(page.getByText('700')).toBeVisible() // Total proof gallons
    await expect(page.getByText('100')).toBeVisible() // Total barrels
  })

  test('should handle responsive layout when production order is selected', async ({ page }) => {
    // Click on a production order to select it
    await page.getByText('Test Production Order 1').click()
    
    // Wait for selection to take effect
    await expect(page.locator('div').filter({ hasText: 'Test Production Order 1' }).first()).toHaveClass(/ring-2/)
    
    // Check that the grid changes to xl:grid-cols-4 when order is selected
    const mainGrid = page.locator('div').filter({ hasText: 'Production Orders' }).first().locator('..')
    await expect(mainGrid).toHaveClass(/xl:grid-cols-4/)
    
    // Verify the sections maintain their proportions
    const productionOrdersSection = page.locator('div').filter({ hasText: 'Production Orders' }).first().locator('..')
    await expect(productionOrdersSection).toHaveClass(/xl:col-span-1/)
    
    const scheduleQueueSection = page.locator('div').filter({ hasText: 'Schedule Queue' }).first().locator('..')
    await expect(scheduleQueueSection).toHaveClass(/xl:col-span-3/)
    
    // Check that order details are now visible
    await expect(page.getByText('Order Details')).toBeVisible()
    await expect(page.getByText('Additional Information')).toBeVisible()
  })

  test('should display schedule queue with minimum height for better space utilization', async ({ page }) => {
    // Check that the Schedule Queue card has min-h-screen class for full height utilization
    const scheduleQueueCard = page.locator('div').filter({ hasText: 'Schedule Queue' }).first().locator('..')
    await expect(scheduleQueueCard).toHaveClass(/min-h-screen/)
  })

  test('should show proper action buttons and controls', async ({ page }) => {
    // Check Production Orders section controls
    await expect(page.getByRole('button', { name: 'Create Order' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show All Orders' })).toBeVisible()
    
    // Check Schedule Queue section controls
    await expect(page.getByRole('button', { name: 'Show All Queue Orders' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible()
  })

  test('should handle mobile viewport layout', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    
    // On mobile, both sections should stack vertically (grid-cols-1)
    const mainGrid = page.locator('div').filter({ hasText: 'Production Orders' }).first().locator('..')
    await expect(mainGrid).toHaveClass(/grid-cols-1/)
    
    // Both sections should be visible but stacked
    await expect(page.getByText('Production Orders')).toBeVisible()
    await expect(page.getByText('Schedule Queue')).toBeVisible()
  })

  test('should display user access level and authentication info', async ({ page }) => {
    // Check that user access level badge is visible
    await expect(page.getByText('Access')).toBeVisible()
    
    // Check that user info is displayed
    await expect(page.getByText('test-user-123')).toBeVisible()
  })

  test('should handle tab navigation between Schedule Management and Line View', async ({ page }) => {
    // Check that tabs are visible
    await expect(page.getByRole('tab', { name: 'Schedule Management' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Line View' })).toBeVisible()
    
    // Schedule Management should be active by default
    await expect(page.getByRole('tab', { name: 'Schedule Management' })).toHaveAttribute('data-state', 'active')
    
    // Click on Line View tab
    await page.getByRole('tab', { name: 'Line View' }).click()
    await expect(page.getByRole('tab', { name: 'Line View' })).toHaveAttribute('data-state', 'active')
  })
}) 