/**
 * Equipment State Module Types
 *
 * Valid state transitions and interfaces for the per-asset
 * equipment operational state tracking system.
 */

import { EnumEquipmentOperationalState } from "@prisma/client";

/**
 * Valid equipment operational state transitions.
 * Key: current state, Value: set of allowed target states.
 */
export const VALID_EQUIPMENT_TRANSITIONS: Record<
  EnumEquipmentOperationalState,
  EnumEquipmentOperationalState[]
> = {
  [EnumEquipmentOperationalState.Available]: [
    EnumEquipmentOperationalState.Allocated,
    EnumEquipmentOperationalState.InMaintenance,
    EnumEquipmentOperationalState.OutOfService,
  ],
  [EnumEquipmentOperationalState.Allocated]: [
    EnumEquipmentOperationalState.InUse,
    EnumEquipmentOperationalState.Available, // cancel allocation
  ],
  [EnumEquipmentOperationalState.InUse]: [
    EnumEquipmentOperationalState.InCIP,
    EnumEquipmentOperationalState.InMaintenance,
    EnumEquipmentOperationalState.Available, // direct release
  ],
  [EnumEquipmentOperationalState.Changeover]: [
    EnumEquipmentOperationalState.Available,
    EnumEquipmentOperationalState.InCIP,
  ],
  [EnumEquipmentOperationalState.InCIP]: [
    EnumEquipmentOperationalState.Available,
    EnumEquipmentOperationalState.InMaintenance,
  ],
  [EnumEquipmentOperationalState.InMaintenance]: [
    EnumEquipmentOperationalState.Available,
    EnumEquipmentOperationalState.OutOfService,
  ],
  [EnumEquipmentOperationalState.OutOfService]: [
    EnumEquipmentOperationalState.Available,
    EnumEquipmentOperationalState.InMaintenance,
  ],
};

export interface AssetStateInfo {
  id: string;
  name: string;
  assetPath: string;
  operationalState: EnumEquipmentOperationalState;
  currentAssignment: FermenterAssignmentInfo | null;
  stateChangedAt: string | null;
}

export interface FermenterAssignmentInfo {
  id: string;
  scheduleOrderId: string;
  scheduleOrderName: string | null;
  status: string;
  assignedBy: string;
  assignedAt: string;
  fillingStartedAt: string | null;
  fermentationStartedAt: string | null;
  completedAt: string | null;
  notes: string | null;
}

export interface AreaSummary {
  areaId: string;
  areaName: string;
  totalAssets: number;
  stateCounts: Record<string, number>;
  assets: AssetStateInfo[];
}

export interface TransitionResult {
  success: boolean;
  assetId: string;
  previousState: EnumEquipmentOperationalState;
  currentState: EnumEquipmentOperationalState;
  message: string;
}
