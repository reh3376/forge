// Changeover API Client
// REST API client for per-area changeover state machine

import { getAuthHeaders } from '../auth-utils'

const API_BASE = '/api/rest'

// --- Types (mirror backend changeover.types.ts and changeover.dto.ts) ---

export type ChangeoverArea = 'cooker' | 'fermentation' | 'barreling'

export const VALID_AREAS: ChangeoverArea[] = ['cooker', 'fermentation', 'barreling']

export const AREA_LABELS: Record<ChangeoverArea, string> = {
  cooker: 'Cooker',
  fermentation: 'Fermentation',
  barreling: 'Barreling',
}

export enum ChangeoverState {
  PRODUCTION = 'PRODUCTION',
  COOK_COMPLETE = 'COOK_COMPLETE',
  AWAITING_CHANGEOVER = 'AWAITING_CHANGEOVER',
  CIP_IN_PROGRESS = 'CIP_IN_PROGRESS',
  CIP_COMPLETE = 'CIP_COMPLETE',
  RECIPE_LOADING = 'RECIPE_LOADING',
  RECIPE_LOADED = 'RECIPE_LOADED',
  READY_TO_START = 'READY_TO_START',
  ERROR = 'ERROR',
}

export interface AreaChangeoverState {
  state: ChangeoverState
  area: ChangeoverArea
  activeSOId: string | null
  nextSOId: string | null
  assetId: string | null
  error: string | null
  enteredAt: string
  updatedAt: string
  metadata: Record<string, unknown>
}

export interface TransitionResult {
  success: boolean
  previousState: ChangeoverState
  currentState: ChangeoverState
  area: ChangeoverArea
  message: string
  auditLogId?: string
}

export interface ChangeoverRequestDto {
  requestedBy: string
  force?: boolean
  reason?: string
  notes?: string
}

export interface CipCompleteDto {
  cipStartTime: string
  cipEndTime: string
  cipDurationSeconds?: number
  reportedBy?: string
}

export interface RecipeLoadedDto {
  scheduleOrderRecipeInstanceId: string
  sourceUpdatedAt: string
  cookerNumber: string
  loadedBy?: string
}

export interface StartProductionDto {
  startedBy: string
  notes?: string
}

export interface ResetErrorDto {
  targetState: ChangeoverState.AWAITING_CHANGEOVER | ChangeoverState.CIP_COMPLETE
  resetBy: string
  reason?: string
}

export interface NextRecipeResponse {
  scheduleOrderRecipeInstanceId: string | null
  sourceUpdatedAt: string | null
  recipeName: string | null
  scheduleOrderName: string | null
  scheduleOrderId: string | null
  [key: string]: unknown
}

export interface ApiResponse<T> {
  data?: T
  error?: string
}

// --- API Client ---

class ChangeoverAPI {
  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const authHeaders = await getAuthHeaders()

      const response = await fetch(`${API_BASE}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
          ...options.headers,
        },
        ...options,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return {
          error: errorData.message || `HTTP ${response.status}: ${response.statusText}`,
        }
      }

      const data = await response.json()
      return { data }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  }

  async getAreaState(area: ChangeoverArea): Promise<ApiResponse<AreaChangeoverState>> {
    return this.makeRequest<AreaChangeoverState>(`/changeover/${area}/state`)
  }

  async getAllAreaStates(): Promise<ApiResponse<Record<ChangeoverArea, AreaChangeoverState>>> {
    const results = await Promise.all(
      VALID_AREAS.map(async (area) => {
        const result = await this.getAreaState(area)
        return { area, result }
      })
    )

    const errors = results.filter((r) => r.result.error)
    if (errors.length === results.length) {
      return { error: errors[0].result.error }
    }

    const states = {} as Record<ChangeoverArea, AreaChangeoverState>
    for (const { area, result } of results) {
      if (result.data) {
        states[area] = result.data
      }
    }

    return { data: states }
  }

  async requestChangeover(
    area: ChangeoverArea,
    dto: ChangeoverRequestDto
  ): Promise<ApiResponse<TransitionResult>> {
    return this.makeRequest<TransitionResult>(`/changeover/${area}/request`, {
      method: 'POST',
      body: JSON.stringify(dto),
    })
  }

  async cipComplete(
    area: ChangeoverArea,
    dto: CipCompleteDto
  ): Promise<ApiResponse<TransitionResult>> {
    return this.makeRequest<TransitionResult>(`/changeover/${area}/cip-complete`, {
      method: 'POST',
      body: JSON.stringify(dto),
    })
  }

  async recipeLoaded(
    area: ChangeoverArea,
    dto: RecipeLoadedDto
  ): Promise<ApiResponse<TransitionResult>> {
    return this.makeRequest<TransitionResult>(`/changeover/${area}/recipe-loaded`, {
      method: 'POST',
      body: JSON.stringify(dto),
    })
  }

  async startProduction(
    area: ChangeoverArea,
    dto: StartProductionDto
  ): Promise<ApiResponse<TransitionResult>> {
    return this.makeRequest<TransitionResult>(`/changeover/${area}/start-production`, {
      method: 'POST',
      body: JSON.stringify(dto),
    })
  }

  async getNextRecipe(area: ChangeoverArea): Promise<ApiResponse<NextRecipeResponse>> {
    return this.makeRequest<NextRecipeResponse>(`/changeover/${area}/next-recipe`)
  }

  async resetError(
    area: ChangeoverArea,
    dto: ResetErrorDto
  ): Promise<ApiResponse<TransitionResult>> {
    return this.makeRequest<TransitionResult>(`/changeover/${area}/reset`, {
      method: 'POST',
      body: JSON.stringify(dto),
    })
  }
}

export const changeoverAPI = new ChangeoverAPI()
