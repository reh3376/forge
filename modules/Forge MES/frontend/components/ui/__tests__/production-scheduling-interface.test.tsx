import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@testing-library/jest-dom'
import { ProductionSchedulingInterface } from '../production-scheduling-interface'
import { productionSchedulingApi } from '@/lib/api/production-scheduling'

// Mock the API
jest.mock('@/lib/api/production-scheduling', () => ({
  productionSchedulingApi: {
    getSchedules: jest.fn(),
    getAvailableEquipment: jest.fn(),
    getAvailableRecipes: jest.fn(),
    createSchedule: jest.fn(),
    updateSchedule: jest.fn(),
    deleteSchedule: jest.fn(),
  },
}))

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

// Mock date-fns
jest.mock('date-fns', () => ({
  format: jest.fn((date, formatStr) => {
    if (formatStr === 'yyyy-MM-dd') return '2024-01-01'
    if (formatStr === 'MMM dd') return 'Jan 01'
    if (formatStr === 'MMM dd, yyyy') return 'Jan 01, 2024'
    return '2024-01-01'
  }),
  parseISO: jest.fn((dateStr) => new Date(dateStr)),
  addDays: jest.fn((date, days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000)),
}))

const mockSchedules = [
  {
    id: '1',
    name: 'Weekly Production Schedule',
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-01-07'),
    orders: [
      { id: 'order1', recipeId: 'recipe1', quantity: 100, status: 'pending' as const },
    ],
    equipment: [
      { id: 'eq1', name: 'Mash Tun 1', type: 'mash_tun', status: 'available' as const },
    ],
    utilization: [
      { equipmentId: 'eq1', utilizationRate: 75, scheduledHours: 18, availableHours: 24, maintenanceHours: 2 },
    ],
    conflicts: [],
    status: 'active' as const,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: '2',
    name: 'Monthly Production Plan',
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-01-31'),
    orders: [],
    equipment: [],
    utilization: [],
    conflicts: [
      {
        id: 'conflict1',
        type: 'equipment_overlap' as const,
        severity: 'high' as const,
        description: 'Equipment scheduling conflict',
        affectedOrders: ['order1'],
      },
    ],
    status: 'draft' as const,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
]

const mockEquipment = [
  { id: 'eq1', name: 'Mash Tun 1', type: 'mash_tun', status: 'available' as const },
  { id: 'eq2', name: 'Fermenter 1', type: 'fermenter', status: 'available' as const },
]

const mockRecipes = [
  {
    id: 'recipe1',
    name: 'Single Malt Whiskey',
    version: '1.0',
    status: 'active' as const,
    type: 'single_malt' as const,
    description: 'Premium single malt whiskey recipe',
    ingredients: [],
    stages: [],
    qualityParameters: {},
    estimatedDuration: 168,
    yield: { amount: 100, unit: 'liters' },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

const createTestQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

const renderWithQueryClient = (component: React.ReactElement) => {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  )
}

describe('ProductionSchedulingInterface', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(productionSchedulingApi.getSchedules as jest.Mock).mockResolvedValue([])
    ;(productionSchedulingApi.getAvailableEquipment as jest.Mock).mockResolvedValue([])
    ;(productionSchedulingApi.getAvailableRecipes as jest.Mock).mockResolvedValue([])
  })

  it('renders the production scheduling interface', async () => {
    renderWithQueryClient(<ProductionSchedulingInterface />)

    await waitFor(() => {
      expect(screen.getByText('Production Scheduling')).toBeInTheDocument()
      expect(screen.getByText('Manage whiskey production schedules and optimize resource allocation')).toBeInTheDocument()
    })
  })

  it('displays empty state when no schedules exist', async () => {
    renderWithQueryClient(<ProductionSchedulingInterface />)

    await waitFor(() => {
      expect(screen.getByText('No schedules found')).toBeInTheDocument()
      expect(screen.getByText('Create your first production schedule to get started')).toBeInTheDocument()
    })
  })

  it('opens create schedule dialog', async () => {
    const user = userEvent.setup()
    renderWithQueryClient(<ProductionSchedulingInterface />)

    await waitFor(() => {
      expect(screen.getAllByText('Create Schedule')).toHaveLength(2)
    })

    const createButtons = screen.getAllByText('Create Schedule')
    await user.click(createButtons[0])

    expect(screen.getByText('Create Production Schedule')).toBeInTheDocument()
  })
}) 