import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

// Types for production data
export interface Recipe {
  id: string
  name: string
  customer: string
  whiskyType: 'RyeBourbon' | 'WheatBourbon' | 'Bourbon' | 'Rye' | 'WheatWhiskey'
  status: 'active' | 'inactive' | 'archived'
  version: string
  createdAt: string
  updatedAt: string
  billOfMaterials: BillOfMaterialsItem[]
  parameters: RecipeParameters
  mashingProtocol: MashingStep[]
}

export interface BillOfMaterialsItem {
  id: string
  itemCode: string
  name: string
  quantity: number
  unit: string
  category: 'grain' | 'additive' | 'enzyme' | 'water' | 'other'
}

export interface RecipeParameters {
  highWineProof: number
  lowWineProof: number
  mashRatio: number
  cooksPerFermenter: number
  fermentationTime: number
  [key: string]: string | number | boolean
}

export interface MashingStep {
  stepNumber: number
  stepType: 'LiquidAdd' | 'Hold' | 'AdditiveAdd' | 'Malt' | 'Corn' | 'Rye' | 'Heat' | 'Cool'
  temperature?: number
  time?: number
  setPoint?: number
  additiveId?: string
  include: boolean
}

export interface ProductionOrder {
  id: string
  recipeId: string
  batchId?: string
  orderNumber: string
  status: 'initiated' | 'in-progress' | 'completed' | 'on-hold' | 'cancelled'
  priority: 'high' | 'medium' | 'low'
  scheduledStartDate: string
  scheduledEndDate?: string
  actualStartDate?: string
  actualEndDate?: string
  quantity: number
  unit: string
  containerType: string
  finalProof: number
  assignedEquipment: string[]
  createdAt: string
  updatedAt: string
}

export interface Batch {
  id: string
  batchNumber: string
  productionOrderId: string
  recipeId: string
  status: 'mashing' | 'fermenting' | 'distilling' | 'aging' | 'completed' | 'quality-hold'
  startDate: string
  endDate?: string
  equipment: {
    mashingLine?: string
    fermenters: string[]
    distillationLine?: string
  }
  qualityMetrics: {
    alcoholContent?: number
    phLevel?: number
    temperature?: number
    gravity?: number
    [key: string]: string | number | undefined
  }
  yields: {
    mashVolume?: number
    fermentedVolume?: number
    distilledVolume?: number
    proofGallons?: number
  }
}

export interface EquipmentStatus {
  id: string
  name: string
  type: 'mashing' | 'fermentation' | 'distillation' | 'aging' | 'auxiliary'
  status: 'running' | 'idle' | 'maintenance' | 'offline' | 'error' | 'setup' | 'paused' | 'standby'
  currentBatch?: string
  temperature?: number
  pressure?: number
  level?: number
  lastUpdate: string
}

// Production Store State
interface ProductionState {
  // Data
  recipes: Recipe[]
  productionOrders: ProductionOrder[]
  batches: Batch[]
  equipment: EquipmentStatus[]
  
  // UI State
  selectedRecipe: Recipe | null
  selectedBatch: Batch | null
  selectedOrder: ProductionOrder | null
  
  // Loading States
  loading: {
    recipes: boolean
    orders: boolean
    batches: boolean
    equipment: boolean
  }
  
  // Error States
  errors: {
    recipes: string | null
    orders: string | null
    batches: string | null
    equipment: string | null
  }
  
  // Actions
  setRecipes: (recipes: Recipe[]) => void
  addRecipe: (recipe: Recipe) => void
  updateRecipe: (id: string, updates: Partial<Recipe>) => void
  deleteRecipe: (id: string) => void
  selectRecipe: (recipe: Recipe | null) => void
  
  setProductionOrders: (orders: ProductionOrder[]) => void
  addProductionOrder: (order: ProductionOrder) => void
  updateProductionOrder: (id: string, updates: Partial<ProductionOrder>) => void
  deleteProductionOrder: (id: string) => void
  selectOrder: (order: ProductionOrder | null) => void
  
  setBatches: (batches: Batch[]) => void
  addBatch: (batch: Batch) => void
  updateBatch: (id: string, updates: Partial<Batch>) => void
  updateBatchStatus: (id: string, status: Batch['status']) => void
  selectBatch: (batch: Batch | null) => void
  
  setEquipment: (equipment: EquipmentStatus[]) => void
  updateEquipmentStatus: (id: string, status: EquipmentStatus['status'], data?: Partial<EquipmentStatus>) => void
  
  setLoading: (section: keyof ProductionState['loading'], loading: boolean) => void
  setError: (section: keyof ProductionState['errors'], error: string | null) => void
  clearAllErrors: () => void
}

// Create the store
export const useProductionStore = create<ProductionState>()(
  devtools(
    persist(
      (set) => ({
        // Initial state
        recipes: [],
        productionOrders: [],
        batches: [],
        equipment: [],
        
        selectedRecipe: null,
        selectedBatch: null,
        selectedOrder: null,
        
        loading: {
          recipes: false,
          orders: false,
          batches: false,
          equipment: false,
        },
        
        errors: {
          recipes: null,
          orders: null,
          batches: null,
          equipment: null,
        },
        
        // Recipe actions
        setRecipes: (recipes) => set({ recipes }),
        
        addRecipe: (recipe) => set((state) => ({
          recipes: [...state.recipes, recipe]
        })),
        
        updateRecipe: (id, updates) => set((state) => ({
          recipes: state.recipes.map(recipe => 
            recipe.id === id ? { ...recipe, ...updates, updatedAt: new Date().toISOString() } : recipe
          )
        })),
        
        deleteRecipe: (id) => set((state) => ({
          recipes: state.recipes.filter(recipe => recipe.id !== id),
          selectedRecipe: state.selectedRecipe?.id === id ? null : state.selectedRecipe
        })),
        
        selectRecipe: (recipe) => set({ selectedRecipe: recipe }),
        
        // Production Order actions
        setProductionOrders: (orders) => set({ productionOrders: orders }),
        
        addProductionOrder: (order) => set((state) => ({
          productionOrders: [...state.productionOrders, order]
        })),
        
        updateProductionOrder: (id, updates) => set((state) => ({
          productionOrders: state.productionOrders.map(order => 
            order.id === id ? { ...order, ...updates, updatedAt: new Date().toISOString() } : order
          )
        })),
        
        deleteProductionOrder: (id) => set((state) => ({
          productionOrders: state.productionOrders.filter(order => order.id !== id),
          selectedOrder: state.selectedOrder?.id === id ? null : state.selectedOrder
        })),
        
        selectOrder: (order) => set({ selectedOrder: order }),
        
        // Batch actions
        setBatches: (batches) => set({ batches }),
        
        addBatch: (batch) => set((state) => ({
          batches: [...state.batches, batch]
        })),
        
        updateBatch: (id, updates) => set((state) => ({
          batches: state.batches.map(batch => 
            batch.id === id ? { ...batch, ...updates } : batch
          )
        })),
        
        updateBatchStatus: (id, status) => set((state) => ({
          batches: state.batches.map(batch => 
            batch.id === id ? { ...batch, status } : batch
          )
        })),
        
        selectBatch: (batch) => set({ selectedBatch: batch }),
        
        // Equipment actions
        setEquipment: (equipment) => set({ equipment }),
        
        updateEquipmentStatus: (id, status, data = {}) => set((state) => ({
          equipment: state.equipment.map(equip => 
            equip.id === id ? { 
              ...equip, 
              status, 
              ...data, 
              lastUpdate: new Date().toISOString() 
            } : equip
          )
        })),
        
        // Loading and error actions
        setLoading: (section, loading) => set((state) => ({
          loading: { ...state.loading, [section]: loading }
        })),
        
        setError: (section, error) => set((state) => ({
          errors: { ...state.errors, [section]: error }
        })),
        
        clearAllErrors: () => set({
          errors: {
            recipes: null,
            orders: null,
            batches: null,
            equipment: null,
          }
        }),
      }),
      {
        name: 'production-store',
        partialize: (state) => ({
          // Only persist data, not UI state or loading states
          recipes: state.recipes,
          productionOrders: state.productionOrders,
          batches: state.batches,
          equipment: state.equipment,
        }),
      }
    ),
    {
      name: 'production-store',
    }
  )
) 