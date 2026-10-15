// Equipment State API Client
// REST API client for per-asset equipment state tracking

import { getAuthHeaders } from '../auth-utils'

const API_BASE = '/api/rest'

// --- Types (mirror backend equipmentState.types.ts) ---

export enum EquipmentOperationalState {
  Available = 'Available',
  Allocated = 'Allocated',
  InUse = 'InUse',
  Changeover = 'Changeover',
  InCIP = 'InCIP',
  InMaintenance = 'InMaintenance',
  OutOfService = 'OutOfService',
}

export enum FermenterAssignmentStatus {
  Assigned = 'Assigned',
  Filling = 'Filling',
  Fermenting = 'Fermenting',
  Complete = 'Complete',
  Released = 'Released',
}

export interface FermenterAssignmentInfo {
  id: string
  scheduleOrderId: string
  scheduleOrderName: string | null
  status: FermenterAssignmentStatus
  assignedBy: string
  assignedAt: string
  fillingStartedAt: string | null
  fermentationStartedAt: string | null
  completedAt: string | null
  notes: string | null
}

export interface AssetStateInfo {
  id: string
  name: string
  assetPath: string
  operationalState: EquipmentOperationalState
  currentAssignment: FermenterAssignmentInfo | null
  stateChangedAt: string | null
}

export interface AreaSummary {
  areaId: string
  areaName: string
  totalAssets: number
  stateCounts: Record<string, number>
  assets: AssetStateInfo[]
}

export interface TransitionResult {
  success: boolean
  assetId: string
  previousState: EquipmentOperationalState
  currentState: EquipmentOperationalState
  message: string
}

export interface AssignFermenterDto {
  assetId: string
  scheduleOrderId: string
  assignedBy: string
  notes?: string | undefined
}

export interface ReleaseFermenterDto {
  releasedBy: string
  sendToCip?: boolean | undefined
  notes?: string | undefined
}

export interface UpdateAssignmentStatusDto {
  status: FermenterAssignmentStatus
  triggeredBy: string
  notes?: string | undefined
}

export interface TransitionStateDto {
  targetState: EquipmentOperationalState
  triggeredBy: string
  notes?: string | undefined
}

export interface ForceOverrideStateDto {
  targetState: EquipmentOperationalState
  triggeredBy: string
  reason: string
}

export interface ApiResponse<T> {
  data?: T | undefined
  error?: string | undefined
}

// --- API Client ---

class EquipmentStateAPI {
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

  async getAssetState(assetId: string): Promise<ApiResponse<AssetStateInfo>> {
    return this.makeRequest<AssetStateInfo>(`/equipment-state/${assetId}/state`)
  }

  async getAreaSummary(areaId: string): Promise<ApiResponse<AreaSummary>> {
    return this.makeRequest<AreaSummary>(`/equipment-state/area/${areaId}/summary`)
  }

  async findAreaByPath(path: string): Promise<ApiResponse<{ id: string; name: string }>> {
    return this.makeRequest<{ id: string; name: string }>(
      `/equipment-state/area/by-path?path=${encodeURIComponent(path)}`
    )
  }

  async getActiveAssignments(areaId: string): Promise<ApiResponse<any[]>> {
    return this.makeRequest<any[]>(`/equipment-state/area/${areaId}/assignments`)
  }

  async transitionState(
    assetId: string,
    dto: TransitionStateDto
  ): Promise<ApiResponse<TransitionResult>> {
    return this.makeRequest<TransitionResult>(`/equipment-state/${assetId}/transition`, {
      method: 'POST',
      body: JSON.stringify(dto),
    })
  }

  async assignFermenter(dto: AssignFermenterDto): Promise<ApiResponse<any>> {
    return this.makeRequest<any>('/equipment-state/assign-fermenter', {
      method: 'POST',
      body: JSON.stringify(dto),
    })
  }

  async updateAssignmentStatus(
    assignmentId: string,
    dto: UpdateAssignmentStatusDto
  ): Promise<ApiResponse<any>> {
    return this.makeRequest<any>(`/equipment-state/assignment/${assignmentId}/status`, {
      method: 'POST',
      body: JSON.stringify(dto),
    })
  }

  async releaseFermenter(
    assetId: string,
    dto: ReleaseFermenterDto
  ): Promise<ApiResponse<any>> {
    return this.makeRequest<any>(`/equipment-state/${assetId}/release`, {
      method: 'POST',
      body: JSON.stringify(dto),
    })
  }

  async forceOverrideState(
    assetId: string,
    dto: ForceOverrideStateDto
  ): Promise<ApiResponse<TransitionResult>> {
    return this.makeRequest<TransitionResult>(`/equipment-state/${assetId}/force-override`, {
      method: 'POST',
      body: JSON.stringify(dto),
    })
  }
}

export const equipmentStateAPI = new EquipmentStateAPI()
