import { test, expect } from '@playwright/test'

test.describe('Production Scheduling Interface', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the production scheduling page
    await page.goto('/scheduling')
  })

  test('should display the production scheduling interface', async ({ page }) => {
    // Check main heading
    await expect(page.getByRole('heading', { name: 'Production Scheduling' })).toBeVisible()
    
    // Check description
    await expect(page.getByText('Manage whiskey production schedules and optimize resource allocation')).toBeVisible()
    
    // Check create schedule button
    await expect(page.getByRole('button', { name: 'Create Schedule' })).toBeVisible()
  })

  test('should open create schedule dialog', async ({ page }) => {
    // Click create schedule button
    await page.getByRole('button', { name: 'Create Schedule' }).click()
    
    // Check dialog is open
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Create Production Schedule' })).toBeVisible()
    
    // Check form fields
    await expect(page.getByLabel('Schedule Name')).toBeVisible()
    await expect(page.getByLabel('Start Date')).toBeVisible()
    await expect(page.getByLabel('End Date')).toBeVisible()
    await expect(page.getByLabel('Status')).toBeVisible()
  })

  test('should create a new schedule', async ({ page }) => {
    // Mock the API response for creating a schedule
    await page.route('**/api/production-scheduling/schedules', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'new-schedule-1',
            name: 'Test Production Schedule',
            status: 'draft',
            startDate: '2024-01-01T00:00:00.000Z',
            endDate: '2024-01-07T00:00:00.000Z',
            orders: [],
            equipment: [],
            utilization: [],
            conflicts: [],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          }),
        })
      }
    })

    // Mock the API response for getting schedules
    await page.route('**/api/production-scheduling/schedules*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'new-schedule-1',
              name: 'Test Production Schedule',
              status: 'draft',
              startDate: '2024-01-01T00:00:00.000Z',
              endDate: '2024-01-07T00:00:00.000Z',
              orders: [],
              equipment: [],
              utilization: [],
              conflicts: [],
              createdAt: '2024-01-01T00:00:00.000Z',
              updatedAt: '2024-01-01T00:00:00.000Z',
            },
          ]),
        })
      }
    })

    // Open create dialog
    await page.getByRole('button', { name: 'Create Schedule' }).click()
    
    // Fill form
    await page.getByLabel('Schedule Name').fill('Test Production Schedule')
    await page.getByLabel('Start Date').fill('2024-01-01')
    await page.getByLabel('End Date').fill('2024-01-07')
    
    // Submit form
    await page.getByRole('button', { name: 'Create Schedule' }).click()
    
    // Check that the schedule appears in the list
    await expect(page.getByText('Test Production Schedule')).toBeVisible()
    await expect(page.getByText('draft')).toBeVisible()
  })

  test('should filter schedules by date range', async ({ page }) => {
    // Mock schedules data
    await page.route('**/api/production-scheduling/schedules*', async (route) => {
      const url = new URL(route.request().url())
      const startDate = url.searchParams.get('startDate')
      const endDate = url.searchParams.get('endDate')
      
      let schedules: any[] = []
      
      // Return different schedules based on date filter
      if (startDate === '2024-01-01' && endDate === '2024-01-31') {
        schedules = [
          {
            id: 'schedule-jan',
            name: 'January Production Schedule',
            status: 'active',
            startDate: '2024-01-15T00:00:00.000Z',
            endDate: '2024-01-22T00:00:00.000Z',
            orders: [],
            equipment: [],
            utilization: [],
            conflicts: [],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ]
      }
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(schedules),
      })
    })

    // Set date filters
    await page.getByLabel('Start Date').fill('2024-01-01')
    await page.getByLabel('End Date').fill('2024-01-31')
    
    // Check filtered results
    await expect(page.getByText('January Production Schedule')).toBeVisible()
  })

  test('should handle empty state', async ({ page }) => {
    // Mock empty schedules response
    await page.route('**/api/production-scheduling/schedules*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })

    // Check empty state
    await expect(page.getByText('No schedules found')).toBeVisible()
    await expect(page.getByText('Create your first production schedule to get started')).toBeVisible()
  })

  test('should handle API errors gracefully', async ({ page }) => {
    // Mock API error
    await page.route('**/api/production-scheduling/schedules*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      })
    })

    // Check error message
    await expect(page.getByText(/Error loading production schedules/)).toBeVisible()
  })

  test('should display schedule conflicts', async ({ page }) => {
    // Mock schedule with conflicts
    await page.route('**/api/production-scheduling/schedules*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'schedule-with-conflicts',
            name: 'Conflicted Schedule',
            status: 'active',
            startDate: '2024-01-01T00:00:00.000Z',
            endDate: '2024-01-07T00:00:00.000Z',
            orders: [],
            equipment: [],
            utilization: [],
            conflicts: [
              {
                id: 'conflict-1',
                type: 'equipment_overlap',
                severity: 'high',
                description: 'Equipment scheduling conflict detected',
                affectedOrders: ['order-1'],
              },
            ],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ]),
      })
    })

    // Check conflict display
    await expect(page.getByText('1 Conflict')).toBeVisible()
    await expect(page.getByText('Equipment scheduling conflict detected')).toBeVisible()
  })

  test('should display equipment utilization', async ({ page }) => {
    // Mock schedule with utilization data
    await page.route('**/api/production-scheduling/schedules*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'schedule-with-utilization',
            name: 'Utilized Schedule',
            status: 'active',
            startDate: '2024-01-01T00:00:00.000Z',
            endDate: '2024-01-07T00:00:00.000Z',
            orders: [],
            equipment: [
              {
                id: 'eq-1',
                name: 'Mash Tun 1',
                type: 'mash_tun',
                status: 'available',
              },
            ],
            utilization: [
              {
                equipmentId: 'eq-1',
                utilizationRate: 85,
                scheduledHours: 20,
                availableHours: 24,
                maintenanceHours: 4,
              },
            ],
            conflicts: [],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ]),
      })
    })

    // Check utilization display
    await expect(page.getByText('Equipment Utilization')).toBeVisible()
    await expect(page.getByText('85%')).toBeVisible()
    await expect(page.getByText('Mash Tun 1')).toBeVisible()
  })
}) 