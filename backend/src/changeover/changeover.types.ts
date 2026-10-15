/**
 * Changeover Module Types
 *
 * State machine definitions, interfaces, and MQTT topic constants
 * for the per-area changeover orchestration system.
 */

export enum ChangeoverState {
  PRODUCTION = "PRODUCTION",
  COOK_COMPLETE = "COOK_COMPLETE",
  AWAITING_CHANGEOVER = "AWAITING_CHANGEOVER",
  CIP_IN_PROGRESS = "CIP_IN_PROGRESS",
  CIP_COMPLETE = "CIP_COMPLETE",
  RECIPE_LOADING = "RECIPE_LOADING",
  RECIPE_LOADED = "RECIPE_LOADED",
  READY_TO_START = "READY_TO_START",
  ERROR = "ERROR",
}

export type ChangeoverArea = "cooker" | "fermentation" | "barreling";

export const VALID_AREAS: ChangeoverArea[] = [
  "cooker",
  "fermentation",
  "barreling",
];

export interface AreaChangeoverState {
  state: ChangeoverState;
  area: ChangeoverArea;
  activeSOId: string | null;
  nextSOId: string | null;
  assetId: string | null;
  error: string | null;
  enteredAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface TransitionResult {
  success: boolean;
  previousState: ChangeoverState;
  currentState: ChangeoverState;
  area: ChangeoverArea;
  message: string;
  auditLogId?: string;
}

/**
 * Legal state transitions map.
 * Key: current state, Value: set of allowed target states.
 * ERROR is always reachable from any state (handled separately).
 */
export const VALID_TRANSITIONS: Record<ChangeoverState, ChangeoverState[]> = {
  [ChangeoverState.PRODUCTION]: [
    ChangeoverState.COOK_COMPLETE,
    ChangeoverState.AWAITING_CHANGEOVER,
  ],
  [ChangeoverState.COOK_COMPLETE]: [ChangeoverState.AWAITING_CHANGEOVER],
  [ChangeoverState.AWAITING_CHANGEOVER]: [
    ChangeoverState.CIP_IN_PROGRESS,
    ChangeoverState.CIP_COMPLETE, // CIP-skipped flow
  ],
  [ChangeoverState.CIP_IN_PROGRESS]: [ChangeoverState.CIP_COMPLETE],
  [ChangeoverState.CIP_COMPLETE]: [ChangeoverState.RECIPE_LOADING],
  [ChangeoverState.RECIPE_LOADING]: [ChangeoverState.RECIPE_LOADED],
  [ChangeoverState.RECIPE_LOADED]: [ChangeoverState.READY_TO_START],
  [ChangeoverState.READY_TO_START]: [ChangeoverState.PRODUCTION],
  [ChangeoverState.ERROR]: [
    ChangeoverState.AWAITING_CHANGEOVER,
    ChangeoverState.CIP_COMPLETE,
  ],
};

/**
 * MQTT topic path segments for changeover state publishing.
 * Full path: whk/whk01/{area}/{subtopic}
 */
export const CHANGEOVER_TOPICS = {
  STATE: "changeover/state",
  ACTIVE_ORDER: "queue/activeOrder",
  NEXT_ORDER: "queue/nextOrder",
  QUEUE_STATE: "queue/state",
  QUEUE_DEPTH: "queue/depth",
} as const;

export const RECIPE_TOPICS = {
  NEXT: "recipe/next",
  UPDATED_AT: "recipe/updatedAt",
} as const;

export const MQTT_BASE_PATH = "whk/whk01";

/**
 * Maps changeover states to equipment operational states.
 * Used to keep the Asset.operationalState in sync with changeover transitions.
 * Only states that have a clear equipment mapping are included.
 */
export const CHANGEOVER_TO_EQUIPMENT_STATE: Partial<
  Record<ChangeoverState, string>
> = {
  [ChangeoverState.PRODUCTION]: "InUse",
  [ChangeoverState.AWAITING_CHANGEOVER]: "Changeover",
  [ChangeoverState.CIP_IN_PROGRESS]: "InCIP",
  [ChangeoverState.CIP_COMPLETE]: "Changeover",
  [ChangeoverState.RECIPE_LOADING]: "Changeover",
  [ChangeoverState.RECIPE_LOADED]: "Changeover",
  [ChangeoverState.READY_TO_START]: "Changeover",
};
