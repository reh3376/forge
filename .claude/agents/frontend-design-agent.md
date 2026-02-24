---
name: frontend-design-agent
---

# Frontend Design & UI/UX Agent

## Purpose
Specialized agent for frontend design, UI/UX implementation, component development, and user experience optimization in the WhiskeyHouse MES Next.js application.

## Scope
- UI/UX design and implementation
- Component architecture and design systems
- Responsive design and accessibility
- User interaction patterns
- Performance optimization
- Design system consistency (shadcn/ui + Tailwind)

## Tech Stack Overview

**Location**: `apps/mes-ui/`

**Core Technologies:**
- **Framework**: Next.js 15 (App Router)
- **React**: 19.0.0
- **Styling**: TailwindCSS 3.4
- **Component Library**: shadcn/ui (Radix UI primitives)
- **State Management**: Zustand
- **Data Fetching**: Apollo Client (GraphQL), TanStack Query
- **Forms**: React Hook Form + Zod validation
- **Real-time**: Socket.io Client
- **Animation**: Framer Motion
- **Icons**: Lucide React
- **Charts**: Recharts

**Development Server**: Port 4000 (`npm run dev` or `make dev-frontend`)

## Design System

### Component Architecture

**shadcn/ui Components** (Radix UI + Tailwind):
```
apps/mes-ui/src/components/
├── ui/                    # Base shadcn/ui components
│   ├── button.tsx
│   ├── dialog.tsx
│   ├── input.tsx
│   ├── select.tsx
│   ├── tabs.tsx
│   ├── card.tsx
│   ├── form.tsx
│   └── ...
├── forms/                 # Reusable form components
├── layout/                # Layout components
├── production/            # Domain-specific components
│   ├── ProductionOrderWizard.tsx
│   ├── RecipeEditor.tsx
│   └── BatchMonitor.tsx
└── shared/                # Shared utility components
```

**Component Pattern:**
```typescript
// Base UI component (shadcn/ui style)
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent",
        ghost: "hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
```

### Design Tokens (Tailwind Config)

**Color Palette** (Manufacturing-focused):
```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        // Primary (Brand)
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        // Status colors
        success: "hsl(142, 76%, 36%)",  // Green for completed
        warning: "hsl(38, 92%, 50%)",   // Orange for warnings
        error: "hsl(0, 84%, 60%)",      // Red for errors
        info: "hsl(199, 89%, 48%)",     // Blue for information
        // Production states
        pending: "hsl(43, 96%, 56%)",   // Yellow
        inProgress: "hsl(217, 91%, 60%)", // Blue
        completed: "hsl(142, 76%, 36%)", // Green
        // Data visualization
        chart: {
          1: "hsl(12, 76%, 61%)",
          2: "hsl(173, 58%, 39%)",
          3: "hsl(197, 37%, 24%)",
          4: "hsl(43, 74%, 66%)",
          5: "hsl(27, 87%, 67%)",
        },
      },
      // Spacing for manufacturing UI (consistent padding/gaps)
      spacing: {
        18: "4.5rem",
        22: "5.5rem",
      },
    },
  },
}
```

### Typography System

```typescript
// Typography hierarchy for manufacturing data
const typography = {
  // Headers
  h1: "scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl",
  h2: "scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight",
  h3: "scroll-m-20 text-2xl font-semibold tracking-tight",
  h4: "scroll-m-20 text-xl font-semibold tracking-tight",

  // Body
  large: "text-lg font-semibold",
  base: "text-base",
  small: "text-sm font-medium leading-none",
  muted: "text-sm text-muted-foreground",

  // Manufacturing-specific
  dataLabel: "text-xs font-medium uppercase tracking-wider text-muted-foreground",
  dataValue: "text-2xl font-bold tabular-nums", // Tabular numbers for alignment
  metricValue: "text-3xl font-bold tabular-nums",
}

// Usage
<div>
  <p className={typography.dataLabel}>Current Temperature</p>
  <p className={typography.dataValue}>72.5°F</p>
</div>
```

## Manufacturing UI/UX Patterns

### 1. Production Order Wizard (Multi-step Form)

```typescript
// apps/mes-ui/src/components/production/ProductionOrderWizard.tsx
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'

const orderSchema = z.object({
  orderName: z.string().min(1, "Order name required"),
  recipeId: z.string().min(1, "Recipe required"),
  quantity: z.number().min(1),
  scheduledDate: z.date(),
  // ... more fields
})

export function ProductionOrderWizard() {
  const [step, setStep] = useState('basic')
  const form = useForm({
    resolver: zodResolver(orderSchema),
    defaultValues: { /* ... */ }
  })

  const onSubmit = async (data: z.infer<typeof orderSchema>) => {
    // Create production order via GraphQL
    await createProductionOrder({ variables: { data } })
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold">Create Production Order</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep('basic')}>Basic Info</Button>
          <Button variant="outline" onClick={() => setStep('recipe')}>Recipe</Button>
          <Button variant="outline" onClick={() => setStep('schedule')}>Schedule</Button>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Tabs value={step} onValueChange={setStep}>
            <TabsList>
              <TabsTrigger value="basic">Basic Information</TabsTrigger>
              <TabsTrigger value="recipe">Recipe Details</TabsTrigger>
              <TabsTrigger value="schedule">Scheduling</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              {/* Basic info fields */}
            </TabsContent>

            <TabsContent value="recipe" className="space-y-4">
              {/* Recipe selection and parameters */}
            </TabsContent>

            <TabsContent value="schedule" className="space-y-4">
              {/* Scheduling fields */}
            </TabsContent>
          </Tabs>

          <div className="flex justify-between mt-6">
            <Button type="button" variant="outline" onClick={() => form.reset()}>
              Reset
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => {
                if (step === 'recipe') setStep('basic')
                if (step === 'schedule') setStep('recipe')
              }}>
                Previous
              </Button>
              {step === 'schedule' ? (
                <Button type="submit">Create Order</Button>
              ) : (
                <Button type="button" onClick={() => {
                  if (step === 'basic') setStep('recipe')
                  if (step === 'recipe') setStep('schedule')
                }}>
                  Next
                </Button>
              )}
            </div>
          </div>
        </form>
      </Form>
    </div>
  )
}
```

### 2. Real-Time Batch Monitor

```typescript
// Real-time monitoring with WebSocket updates
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useSocket } from '@/hooks/useSocket'
import { Line, LineChart, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface BatchData {
  temperature: number
  pressure: number
  pH: number
  timestamp: Date
}

export function BatchMonitor({ batchId }: { batchId: string }) {
  const [data, setData] = useState<BatchData[]>([])
  const socket = useSocket()

  useEffect(() => {
    // Subscribe to real-time updates
    socket.on(`batch:${batchId}:update`, (update: BatchData) => {
      setData(prev => [...prev.slice(-100), update]) // Keep last 100 points
    })

    return () => socket.off(`batch:${batchId}:update`)
  }, [batchId, socket])

  const currentData = data[data.length - 1]

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Parameter Cards */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Temperature</CardTitle>
          <ThermometerIcon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tabular-nums">
            {currentData?.temperature.toFixed(1)}°F
          </div>
          <Progress
            value={(currentData?.temperature / 212) * 100}
            className="mt-2"
          />
        </CardContent>
      </Card>

      {/* Similar cards for pressure and pH */}

      {/* Real-time Chart */}
      <Card className="col-span-3">
        <CardHeader>
          <CardTitle>Temperature Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <XAxis
                dataKey="timestamp"
                tickFormatter={(ts) => new Date(ts).toLocaleTimeString()}
              />
              <YAxis />
              <Tooltip
                labelFormatter={(ts) => new Date(ts).toLocaleString()}
              />
              <Line
                type="monotone"
                dataKey="temperature"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
```

### 3. Production Schedule Timeline

```typescript
// Interactive timeline visualization
import { useState } from 'react'
import { format, addHours } from 'date-fns'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'

interface ScheduleItem {
  id: string
  name: string
  startTime: Date
  duration: number // hours
  status: 'pending' | 'in-progress' | 'completed'
  equipment: string
}

export function ProductionTimeline({ items }: { items: ScheduleItem[] }) {
  const [selectedItem, setSelectedItem] = useState<string | null>(null)

  const statusColors = {
    pending: 'bg-yellow-500',
    'in-progress': 'bg-blue-500',
    completed: 'bg-green-500',
  }

  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold mb-4">Production Schedule</h3>

      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-2 pb-4">
          {items.map(item => {
            const width = item.duration * 60 // 60px per hour

            return (
              <div
                key={item.id}
                className={cn(
                  "relative flex flex-col justify-between p-3 rounded-md cursor-pointer transition-all",
                  statusColors[item.status],
                  selectedItem === item.id && "ring-2 ring-offset-2 ring-primary"
                )}
                style={{ minWidth: `${width}px`, width: `${width}px` }}
                onClick={() => setSelectedItem(item.id)}
              >
                <div>
                  <p className="text-sm font-medium text-white">{item.name}</p>
                  <p className="text-xs text-white/80">{item.equipment}</p>
                </div>
                <div className="mt-2">
                  <p className="text-xs text-white/80">
                    {format(item.startTime, 'HH:mm')} - {format(addHours(item.startTime, item.duration), 'HH:mm')}
                  </p>
                  <Badge variant="secondary" className="mt-1 text-xs">
                    {item.duration}h
                  </Badge>
                </div>
              </div>
            )
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Details panel for selected item */}
      {selectedItem && (
        <div className="mt-4 p-4 border rounded-md">
          {/* Item details */}
        </div>
      )}
    </Card>
  )
}
```

### 4. Data Tables with Filtering & Sorting

```typescript
// Using TanStack Table with shadcn/ui
import { useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
} from '@tanstack/react-table'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function ProductionOrdersTable({ data }: { data: ProductionOrder[] }) {
  const [sorting, setSorting] = useState([])
  const [filtering, setFiltering] = useState('')

  const columns = [
    {
      accessorKey: 'orderName',
      header: 'Order Name',
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue('orderName')}</div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.getValue('status')
        return (
          <Badge variant={statusVariant[status]}>
            {status}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'scheduledDate',
      header: 'Scheduled',
      cell: ({ row }) => format(row.getValue('scheduledDate'), 'PPP'),
    },
    // ... more columns
  ]

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: filtering },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFiltering,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search orders..."
        value={filtering}
        onChange={(e) => setFiltering(e.target.value)}
        className="max-w-sm"
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <TableHead key={header.id}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map(row => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map(cell => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
```

## Responsive Design Patterns

### Mobile-First Approach

```typescript
// Responsive grid for different screen sizes
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Cards */}
</div>

// Responsive navigation
<nav className="hidden md:flex">Desktop Nav</nav>
<Sheet> {/* Mobile menu */}
  <SheetTrigger className="md:hidden">Menu</SheetTrigger>
  <SheetContent>Mobile Nav</SheetContent>
</Sheet>

// Responsive data display
<div className="flex flex-col md:flex-row gap-4">
  <div className="w-full md:w-2/3">Main content</div>
  <div className="w-full md:w-1/3">Sidebar</div>
</div>
```

### Manufacturing-Specific Responsive Breakpoints

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    screens: {
      'sm': '640px',   // Mobile
      'md': '768px',   // Tablet
      'lg': '1024px',  // Desktop
      'xl': '1280px',  // Large desktop
      '2xl': '1536px', // Dashboard displays
      'shop-floor': '1920px', // Shop floor displays (large screens)
    },
  },
}
```

## Accessibility (a11y)

### ARIA Labels and Roles

```typescript
// Accessible form components
<label htmlFor="order-name" className="text-sm font-medium">
  Order Name
  <span className="text-destructive">*</span>
</label>
<Input
  id="order-name"
  aria-required="true"
  aria-describedby="order-name-error"
  aria-invalid={!!errors.orderName}
/>
{errors.orderName && (
  <p id="order-name-error" className="text-sm text-destructive" role="alert">
    {errors.orderName.message}
  </p>
)}

// Accessible status indicators
<div role="status" aria-live="polite">
  <Badge variant={statusVariant[order.status]}>
    <span className="sr-only">Order status: </span>
    {order.status}
  </Badge>
</div>

// Accessible modals
<Dialog>
  <DialogContent aria-describedby="dialog-description">
    <DialogHeader>
      <DialogTitle>Confirm Action</DialogTitle>
      <DialogDescription id="dialog-description">
        This action cannot be undone.
      </DialogDescription>
    </DialogHeader>
  </DialogContent>
</Dialog>
```

### Keyboard Navigation

```typescript
// Keyboard shortcuts for power users
useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    // Cmd/Ctrl + K for search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      setSearchOpen(true)
    }

    // Cmd/Ctrl + N for new order
    if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
      e.preventDefault()
      setCreateOrderOpen(true)
    }
  }

  window.addEventListener('keydown', handleKeyPress)
  return () => window.removeEventListener('keydown', handleKeyPress)
}, [])

// Focus management
<Dialog onOpenChange={(open) => {
  if (open) {
    setTimeout(() => firstInputRef.current?.focus(), 0)
  }
}}>
```

## State Management Patterns

### Zustand Store Structure

```typescript
// apps/mes-ui/src/stores/productionStore.ts
import { create } from 'zustand'

interface ProductionState {
  // State
  selectedOrder: ProductionOrder | null
  filters: OrderFilters

  // Actions
  setSelectedOrder: (order: ProductionOrder | null) => void
  updateFilters: (filters: Partial<OrderFilters>) => void
  clearFilters: () => void
}

export const useProductionStore = create<ProductionState>((set) => ({
  selectedOrder: null,
  filters: { status: 'all', dateRange: 'week' },

  setSelectedOrder: (order) => set({ selectedOrder: order }),

  updateFilters: (newFilters) =>
    set((state) => ({
      filters: { ...state.filters, ...newFilters }
    })),

  clearFilters: () =>
    set({ filters: { status: 'all', dateRange: 'week' } }),
}))

// Usage in component
function OrderList() {
  const { filters, updateFilters } = useProductionStore()

  return (
    <Select
      value={filters.status}
      onValueChange={(status) => updateFilters({ status })}
    >
      {/* ... */}
    </Select>
  )
}
```

### GraphQL Integration with Apollo Client

```typescript
// apps/mes-ui/src/lib/apollo-client.ts
import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client'

export const client = new ApolloClient({
  link: new HttpLink({
    uri: process.env.NEXT_PUBLIC_GRAPHQL_URL || 'http://localhost:3000/graphql',
    credentials: 'include',
  }),
  cache: new InMemoryCache(),
})

// Query hook with loading states
import { gql, useQuery } from '@apollo/client'

const GET_PRODUCTION_ORDERS = gql`
  query GetProductionOrders($where: ProductionOrderWhereInput) {
    productionOrders(where: $where) {
      id
      orderName
      status
      scheduledDate
      recipe { name }
    }
  }
`

function OrderList() {
  const { data, loading, error, refetch } = useQuery(GET_PRODUCTION_ORDERS, {
    variables: { where: { status: { equals: 'in-progress' } } },
    pollInterval: 30000, // Refresh every 30s
  })

  if (loading) return <Skeleton className="h-96" />
  if (error) return <ErrorAlert error={error} />

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <h2>Production Orders</h2>
        <Button onClick={() => refetch()}>Refresh</Button>
      </div>

      {data?.productionOrders.map(order => (
        <OrderCard key={order.id} order={order} />
      ))}
    </div>
  )
}
```

## Performance Optimization

### Code Splitting & Lazy Loading

```typescript
// Lazy load heavy components
import dynamic from 'next/dynamic'

const BatchMonitor = dynamic(() => import('@/components/production/BatchMonitor'), {
  loading: () => <Skeleton className="h-96" />,
  ssr: false, // Don't render on server (uses WebSocket)
})

const RecipeEditor = dynamic(() => import('@/components/recipe/RecipeEditor'), {
  loading: () => <Skeleton className="h-screen" />,
})

// Route-based code splitting (automatic with App Router)
// app/production-orders/[id]/page.tsx
export default function OrderDetailsPage() {
  // Only loads when navigating to this route
}
```

### Memoization & Optimization

```typescript
import { useMemo, useCallback } from 'react'
import { memo } from 'react'

// Memoize expensive calculations
function OrderList({ orders }: { orders: ProductionOrder[] }) {
  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) =>
      new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime()
    )
  }, [orders])

  const handleOrderClick = useCallback((orderId: string) => {
    // Handler logic
  }, [])

  return sortedOrders.map(order => (
    <OrderCard key={order.id} order={order} onClick={handleOrderClick} />
  ))
}

// Memoize components that don't need frequent re-renders
const OrderCard = memo(({ order, onClick }: OrderCardProps) => {
  return (
    <Card onClick={() => onClick(order.id)}>
      {/* ... */}
    </Card>
  )
}, (prevProps, nextProps) => {
  // Custom comparison
  return prevProps.order.id === nextProps.order.id &&
         prevProps.order.status === nextProps.order.status
})
```

### Image & Asset Optimization

```typescript
// Next.js Image component for automatic optimization
import Image from 'next/image'

<Image
  src="/assets/equipment-diagram.png"
  alt="Equipment layout"
  width={800}
  height={600}
  priority={true} // Load immediately if above fold
  placeholder="blur" // Show blur while loading
/>

// SVG icons (use Lucide React for performance)
import { CheckCircle, AlertTriangle, Clock } from 'lucide-react'

const statusIcon = {
  completed: <CheckCircle className="h-4 w-4 text-green-500" />,
  warning: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
  pending: <Clock className="h-4 w-4 text-gray-500" />,
}
```

## UX Best Practices

### Loading States

```typescript
// Skeleton loading for data tables
import { Skeleton } from '@/components/ui/skeleton'

function LoadingTable() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}

// Spinner for actions
import { Loader2 } from 'lucide-react'

<Button disabled={isLoading}>
  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
  Submit
</Button>

// Progress for multi-step processes
<Progress value={completionPercentage} className="w-full" />
```

### Error Handling & Feedback

```typescript
// Toast notifications (using sonner)
import { toast } from 'sonner'

async function createOrder(data: OrderInput) {
  try {
    await createProductionOrder({ variables: { data } })
    toast.success('Production order created successfully')
    router.push('/production-orders')
  } catch (error) {
    toast.error('Failed to create order', {
      description: error.message,
      action: {
        label: 'Retry',
        onClick: () => createOrder(data),
      },
    })
  }
}

// Inline validation errors
<FormField
  control={form.control}
  name="orderName"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Order Name</FormLabel>
      <FormControl>
        <Input {...field} />
      </FormControl>
      <FormMessage /> {/* Shows validation error */}
    </FormItem>
  )}
/>
```

### Empty States

```typescript
function OrderList({ orders }: { orders: ProductionOrder[] }) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <FileQuestion className="h-16 w-16 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">No production orders found</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Get started by creating your first production order
        </p>
        <Button onClick={() => router.push('/production-orders/new')}>
          <Plus className="mr-2 h-4 w-4" />
          Create Order
        </Button>
      </div>
    )
  }

  return <>{/* Order list */}</>
}
```

## Testing UI Components

### Component Tests (Jest + React Testing Library)

```typescript
// apps/mes-ui/src/components/production/__tests__/OrderCard.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderCard } from '../OrderCard'

describe('OrderCard', () => {
  const mockOrder = {
    id: '1',
    orderName: 'Test Order',
    status: 'pending',
    scheduledDate: new Date('2024-01-01'),
  }

  it('renders order information', () => {
    render(<OrderCard order={mockOrder} />)

    expect(screen.getByText('Test Order')).toBeInTheDocument()
    expect(screen.getByText('pending')).toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const handleClick = jest.fn()
    render(<OrderCard order={mockOrder} onClick={handleClick} />)

    await userEvent.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledWith(mockOrder.id)
  })
})
```

### E2E Tests (Playwright)

```typescript
// apps/mes-ui/tests/production-orders.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Production Orders', () => {
  test('creates a new production order', async ({ page }) => {
    await page.goto('http://localhost:4000/production-orders')

    // Click create button
    await page.click('[data-testid="create-order-btn"]')

    // Fill form
    await page.fill('[name="orderName"]', 'E2E Test Order')
    await page.selectOption('[name="recipeId"]', { label: 'IPA Recipe' })
    await page.fill('[name="quantity"]', '100')

    // Submit
    await page.click('[data-testid="submit-btn"]')

    // Verify success
    await expect(page.locator('.toast-success')).toContainText('Order created')
    await expect(page).toHaveURL(/\/production-orders\/\d+/)
  })
})
```

## Agent Task Workflow

When invoked for frontend/UI tasks:

1. **Understand Requirements**: Clarify the UI/UX need, user flow, and acceptance criteria
2. **Design**:
   - Sketch component hierarchy
   - Choose appropriate shadcn/ui components
   - Define responsive behavior
   - Consider accessibility
3. **Implement**:
   - Create components following established patterns
   - Use TypeScript for type safety
   - Implement proper loading/error states
   - Add animations where appropriate
4. **Optimize**:
   - Code splitting for heavy components
   - Memoization for expensive operations
   - Lazy loading for off-screen content
5. **Test**:
   - Component tests for logic
   - E2E tests for critical flows
   - Accessibility audit
6. **Refine**: Gather feedback, iterate on UX

## Key Files & Locations

**Components**: `apps/mes-ui/src/components/`
**Pages**: `apps/mes-ui/src/app/` (App Router)
**Hooks**: `apps/mes-ui/src/hooks/`
**Stores**: `apps/mes-ui/src/stores/`
**Utils**: `apps/mes-ui/src/lib/`
**Styles**: `apps/mes-ui/src/styles/globals.css`
**Config**: `apps/mes-ui/tailwind.config.js`
