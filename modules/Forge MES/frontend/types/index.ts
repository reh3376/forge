// User and Authentication Types
export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  permissions: Permission[]
  createdAt: Date
  updatedAt: Date
}

export type UserRole = 
  | 'production_manager'
  | 'manufacturing_engineer'
  | 'quality_control'
  | 'production_operator'
  | 'plant_supervisor'
  | 'operations_director'
  | 'admin'

export interface Permission {
  id: string
  name: string
  resource: string
  action: string
}

// Recipe Management Types
export interface Recipe {
  id: string
  Recipe: string // Backend uses capital R for recipe name
  active?: boolean
  whiskeyType?: WhiskeyType
  revision?: number
  customerCode?: string
  customer?: Customer
  cooksPerFerm?: number
  createdAt: Date
  updatedAt: Date
  createdBy: string
  updatedBy?: string
  recipeBoms: RecipeBom[]
  parameters: RecipeParameter[]
  mashingProtocol?: MashingProtocol
  globalId?: string
  schemaVersion?: string
  isClassDefinition?: boolean
  familyRevisionCount?: number // Total number of revisions in this recipe family (computed by backend)
}

export type RecipeStatus = 'draft' | 'pending_approval' | 'approved' | 'deprecated'

export type WhiskeyType = 
  | 'FourGrainBourbon'
  | 'FourGrainWhiskey'
  | 'MaltWhiskey'
  | 'RyeBourbon'
  | 'RyeWhiskey'
  | 'WheatWhiskey'
  | 'WheatedBourbon'

export interface Ingredient {
  id: string
  name: string
  type: IngredientType
  quantity: number
  unit: string
  cost: number
  supplier?: string
  specifications?: Record<string, string | number | boolean>
}

export type IngredientType = 'grain' | 'yeast' | 'water' | 'additive' | 'other'

export interface ProductionStage {
  id: string
  name: string
  order: number
  duration: number
  temperature?: number
  pressure?: number
  equipment: string[]
  parameters: Record<string, string | number | boolean>
  qualityChecks: QualityCheck[]
}

export interface RecipeBom {
  id: string
  revision?: string
  master?: boolean
  running?: boolean
  createdAt: Date
  updatedAt: Date
  recipeBomITem: RecipeBomItem[]
}

// Formula calculation mode for BOM items
export type BomCalculationMode =
  | 'STATIC'
  | 'FORMULA_GRAIN'
  | 'FORMULA_WATER'
  | 'ENZYME_NORMALIZED'
  | 'EXPRESSION'

// Formula type for BOM calculations
export type BomFormulaType =
  | 'SIMPLE_RATIO'
  | 'WATER_PER_BUSHEL'
  | 'BACKSET_PERCENTAGE'
  | 'CUSTOM'

export interface RecipeBomItem {
  id: string
  quantity?: number
  operation?: BomOperation
  item?: Item
  displayUnits?: Units
  createdAt: Date
  updatedAt: Date
  createdBy: string
  updatedBy?: string
  globalId?: string
  isClassDefinition?: boolean
  // Formula configuration fields
  calculationMode?: BomCalculationMode
  formulaType?: BomFormulaType
  formulaMultiplier?: number
  customExpression?: string
  formulaLibraryId?: string
  expressionVariables?: Record<string, unknown>
  expressionValidated?: boolean
}

export type BomOperation = 
  | 'Distillation01'
  | 'Fermentation01'
  | 'Mashing01'
  | 'Processing01'

export interface Item {
  id: string
  itemName?: string
  itemNumber?: string
  itemDescription?: string
  itemType?: string
  itemClass?: string
  itemGroup?: string
  code?: string
  description?: string
  // Add other item fields as needed
}

export interface Units {
  id: string
  name?: string
  abbreviation?: string
  // Add other unit fields as needed
}

export interface RecipeParameter {
  id: string
  recipeParamName: string
  recipeParamDescription?: string
  description?: string
  className: string
  active: boolean
  required?: boolean
  recipeSetpointType?: ParameterSetpointType
  recipeNumericalSetpoint?: number
  recipeSetpointBooleanValue?: boolean
  recipeSetpointLowerLimit?: number
  recipeSetpointUpperLimit?: number
  units?: Units
  unitsId?: string
  operationId?: string
  operation?: Operation
  revision?: number
  createdAt: Date
  updatedAt?: Date
  createdBy: string
  updatedBy?: string
  globalId?: string
  schemaVersion?: string
  isClassDefinition?: boolean
}

export type ParameterSetpointType = 'Boolean' | 'Numeric' | 'Text'

export interface Operation {
  id: string
  name?: string
  // Add other operation fields as needed
}

export interface MashingProtocol {
  id: string
  name: string
  isTemplate?: boolean
  templateCategory?: string
  templateDescription?: string
  master?: boolean
  running?: boolean
  revision?: string
  steps: MashingProtocolStep[]
  createdAt: Date
  updatedAt: Date
  createdBy: string
  updatedBy?: string
}

export interface MashingProtocolStep {
  id: string
  index?: number
  stepType?: MashingStepType
  holdType?: MashingHoldType
  stepTime?: number
  temperatureSetpoint?: number
  temperatureActual?: number
  heatEnabled?: boolean
  heatTempSp?: number
  coolEnabled?: boolean
  coolTempSp?: number
  agitatorEnabled?: boolean
  agitatorSpdSp?: number
  promptMessage?: string
  recipeBomItem: RecipeBomItem[]
  createdAt: Date
  updatedAt: Date
  createdBy: string
  updatedBy?: string
}

export type MashingStepType = 
  | 'AdditiveAdd'
  | 'Corn'
  | 'Hold'
  | 'LiquidAdd'
  | 'Malt'
  | 'PreMalt'
  | 'Prompt'
  | 'Rye'
  | 'Wheat'

export type MashingHoldType = 'Cool' | 'Heat' | 'Hold'

export interface Customer {
  id: string
  name?: string
  code?: string
  // Add other customer fields as needed
}

export interface CostCalculation {
  ingredientCost: number
  laborCost: number
  equipmentCost: number
  utilityCost: number
  totalCost: number
  costPerUnit: number
}

export interface QualitySpecification {
  id: string
  parameter: string
  target: number
  tolerance: number
  unit: string
  testMethod: string
}

export interface QualityCheck {
  id: string
  parameter: string
  frequency: string
  method: string
  acceptanceCriteria: string
}

// Production Scheduling Types
export interface ProductionOrder {
  id: string
  orderNumber: string
  recipeId: string
  recipe: Recipe
  quantity: number
  priority: Priority
  status: OrderStatus
  scheduledStart: Date
  scheduledEnd: Date
  actualStart?: Date
  actualEnd?: Date
  assignedEquipment: Equipment[]
  assignedPersonnel: Personnel[]
  progress: number
  currentStage?: string
  createdAt: Date
  updatedAt: Date
}

export type Priority = 'low' | 'medium' | 'high' | 'urgent'

export type OrderStatus = 
  | 'scheduled'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'on_hold'

export interface Equipment {
  id: string
  name: string
  type: EquipmentType
  status: EquipmentStatus
  capacity: number
  location: string
  specifications: Record<string, string | number | boolean>
  maintenanceSchedule: MaintenanceSchedule[]
}

export type EquipmentType = 
  | 'mash_tun'
  | 'fermenter'
  | 'still'
  | 'condenser'
  | 'storage_tank'
  | 'pump'
  | 'heat_exchanger'
  | 'other'

export type EquipmentStatus = 
  | 'available'
  | 'in_use'
  | 'maintenance'
  | 'offline'
  | 'error'

export interface Personnel {
  id: string
  name: string
  role: string
  shift: Shift
  skills: string[]
  availability: boolean
}

export interface Shift {
  id: string
  name: string
  startTime: string
  endTime: string
  days: string[]
}

export interface MaintenanceSchedule {
  id: string
  type: 'preventive' | 'corrective' | 'emergency'
  scheduledDate: Date
  duration: number
  description: string
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
}

// Dashboard and Analytics Types
export interface KPI {
  id: string
  name: string
  value: number
  unit: string
  target?: number
  trend: 'up' | 'down' | 'stable'
  change: number
  period: string
}

export interface DashboardWidget {
  id: string
  type: WidgetType
  title: string
  config: Record<string, string | number | boolean>
  position: { x: number; y: number; w: number; h: number }
  dataSource: string
}

export type WidgetType = 
  | 'kpi'
  | 'chart'
  | 'table'
  | 'gauge'
  | 'alert'
  | 'status'
  | 'timeline'

export interface Alert {
  id: string
  type: AlertType
  severity: AlertSeverity
  title: string
  message: string
  source: string
  timestamp: Date
  acknowledged: boolean
  resolvedAt?: Date
}

export type AlertType = 
  | 'quality'
  | 'equipment'
  | 'production'
  | 'safety'
  | 'maintenance'
  | 'system'

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical'

// API Response Types
export interface ApiResponse<T> {
  data: T
  success: boolean
  message?: string
  errors?: string[]
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// Form Types
export interface FormField {
  name: string
  label: string
  type: 'text' | 'number' | 'select' | 'textarea' | 'date' | 'checkbox'
  required: boolean
  options?: { label: string; value: string }[]
  validation?: Record<string, string | number | boolean>
}

// ============================================================================
// MES Phase 1 Refactored Types
// ============================================================================
//
// These types reflect the two-stage production model:
//
// Stage 1: ProductionOrder (WHAT to produce)
//   - Barrel/customer specifications
//   - Recipe selection, quantity, proof, container type
//   - Quality control limits
//
// Stage 2: ScheduleOrder (HOW/WHEN to produce)
//   - Production run execution
//   - Cook and fermenter tracking
//   - Production timing and phases
//   - Groups multiple ProductionOrders with same mash bill
//
// Queue Management: ScheduleOrderQueue
//   - Production schedule ordering
//   - Timeline calculation
// ============================================================================

// Common types (shared across entities)
export type {
  ProductionOrderStatus as ProductionOrderStatusV2,
  ScheduleOrderStatus,
  ContainerType,
  DurationUnits,
  Customer as CustomerV2,
  Recipe as RecipeV2,
  RecipeGroup
} from './common'

// ProductionOrder types (specifications)
export type {
  ProductionOrder as ProductionOrderV2,
  ProductionOrderSummary,
  ProductionOrderWithRecipeGroup,
  CreateProductionOrderInput,
  UpdateProductionOrderInput
} from './production-order'

// ScheduleOrder types (execution)
export type {
  ScheduleOrder,
  ScheduleOrderSummary,
  PhaseTiming,
  ProductionOrderAllocation,
  ProductionOrderAllocationMap,
  CreateScheduleOrderInput,
  CreateScheduleOrderFromProductionOrdersInput,
  UpdateScheduleOrderInput
} from './schedule-order'

// ScheduleOrderQueue types (queue management)
export type {
  ScheduleOrderQueue,
  ScheduleOrderQueueSummary,
  QueueOperationResult,
  QueueMoveOperation
} from './schedule-queue' 