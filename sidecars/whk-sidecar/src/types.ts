/**
 * Forge Sidecar TypeScript types — mirrors Python Pydantic models
 * and Protobuf message definitions.
 *
 * These types are the TypeScript-side contract. When ts-proto generates
 * types from .proto files, these manual types will be replaced by the
 * generated ones. For now, they serve as the development contract.
 */

// ---------------------------------------------------------------------------
// Enums (mirror enums.proto)
// ---------------------------------------------------------------------------

export enum QualityCode {
  UNSPECIFIED = 0,
  GOOD = 1,
  UNCERTAIN = 2,
  BAD = 3,
  NOT_AVAILABLE = 4,
}

export enum AdapterState {
  UNSPECIFIED = 0,
  REGISTERED = 1,
  CONNECTING = 2,
  HEALTHY = 3,
  DEGRADED = 4,
  FAILED = 5,
  STOPPED = 6,
}

export enum AdapterTier {
  UNSPECIFIED = 0,
  OT = 1,
  MES_MOM = 2,
  ERP_BUSINESS = 3,
  HISTORIAN = 4,
  DOCUMENT = 5,
}

// ---------------------------------------------------------------------------
// ContextualRecord components (mirror contextual_record.proto)
// ---------------------------------------------------------------------------

export interface ProtoTimestamp {
  seconds: number;
  nanos: number;
}

export interface RecordSource {
  adapterId: string;
  system: string;
  tagPath?: string;
  connectionId?: string;
}

export interface RecordTimestamp {
  sourceTime: ProtoTimestamp;
  serverTime?: ProtoTimestamp;
  ingestionTime: ProtoTimestamp;
}

/**
 * RecordValue uses a discriminated union for the typed_value oneof.
 * Exactly one of the value fields should be set.
 */
export interface RecordValue {
  numberValue?: number;
  stringValue?: string;
  boolValue?: boolean;
  bytesValue?: Uint8Array;
  jsonValue?: string;
  integerValue?: number;
  engineeringUnits: string;
  quality: QualityCode;
  dataType: string;
}

export interface RecordContext {
  equipmentId?: string;
  area?: string;
  site?: string;
  batchId?: string;
  lotId?: string;
  recipeId?: string;
  operatingMode?: string;
  shift?: string;
  operatorId?: string;
  extra: Record<string, string>;
}

export interface RecordLineage {
  schemaRef: string;
  adapterId: string;
  adapterVersion: string;
  transformationChain: string[];
}

export interface ContextualRecord {
  recordId: string;
  source: RecordSource;
  timestamp: RecordTimestamp;
  value: RecordValue;
  context: RecordContext;
  lineage: RecordLineage;
}

// ---------------------------------------------------------------------------
// Adapter control plane (mirror adapter.proto)
// ---------------------------------------------------------------------------

export interface AdapterCapabilities {
  read: boolean;
  write: boolean;
  subscribe: boolean;
  backfill: boolean;
  discover: boolean;
}

export interface ConnectionParam {
  name: string;
  description?: string;
  required: boolean;
  secret: boolean;
  defaultValue?: string;
}

export interface DataContract {
  schemaRef: string;
  outputFormat: string;
  contextFields: string[];
}

export interface AdapterManifest {
  adapterId: string;
  name: string;
  version: string;
  type: string;
  protocol: string;
  tier: AdapterTier;
  capabilities: AdapterCapabilities;
  dataContract: DataContract;
  healthCheckIntervalMs: number;
  connectionParams: ConnectionParam[];
  authMethods: string[];
  metadata: Record<string, unknown>;
}

export interface AdapterHealth {
  adapterId: string;
  state: AdapterState;
  lastCheck?: ProtoTimestamp;
  lastHealthy?: ProtoTimestamp;
  errorMessage?: string;
  recordsCollected: number;
  recordsFailed: number;
  uptimeSeconds: number;
}

// ---------------------------------------------------------------------------
// RPC request/response types (mirror adapter_service.proto)
// ---------------------------------------------------------------------------

export interface RegisterRequest {
  manifest: AdapterManifest;
}

export interface RegisterResponse {
  accepted: boolean;
  message: string;
  sessionId: string;
}

export interface ConfigureRequest {
  adapterId: string;
  sessionId: string;
  params: Record<string, string>;
}

export interface ConfigureResponse {
  success: boolean;
  message: string;
}

export interface CollectRequest {
  adapterId: string;
  sessionId: string;
  maxBatchSize?: number;
}

export interface WriteRequest {
  adapterId: string;
  sessionId: string;
  tagPath: string;
  numberValue?: number;
  stringValue?: string;
  boolValue?: boolean;
  confirm: boolean;
}

export interface WriteResponse {
  success: boolean;
  message: string;
  readback?: ContextualRecord;
}

export interface TagDescriptor {
  tagPath: string;
  dataType: string;
  description: string;
  engineeringUnits: string;
  metadata?: Record<string, unknown>;
}
