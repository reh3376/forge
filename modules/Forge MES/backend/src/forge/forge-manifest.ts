/**
 * The forge-mes adapter manifest the backend presents to the hub on Register.
 *
 * `forge-mes.manifest.json` is a copy of the hub's
 * `src/forge/adapters/forge_mes/manifest.json`; the parity test keeps them
 * identical. This module converts it to the proto `AdapterManifest` shape.
 */
import manifestJson from "./forge-mes.manifest.json";
import { ProtoStruct, toStruct } from "./proto";

export interface ManifestConnectionParam {
  name: string;
  description?: string;
  required?: boolean;
  secret?: boolean;
  default?: string;
}

export interface ForgeMesManifest {
  adapter_id: string;
  name: string;
  version: string;
  type: string;
  protocol: string;
  tier: string;
  capabilities: {
    read: boolean;
    write: boolean;
    subscribe: boolean;
    backfill: boolean;
    discover: boolean;
  };
  data_contract: {
    schema_ref: string;
    output_format: string;
    context_fields: string[];
  };
  health_check_interval_ms: number;
  connection_params: ManifestConnectionParam[];
  auth_methods: string[];
  metadata?: Record<string, unknown>;
}

export interface ProtoAdapterManifest {
  adapter_id: string;
  name: string;
  version: string;
  type: string;
  protocol: string;
  tier: string;
  capabilities: ForgeMesManifest["capabilities"];
  data_contract: ForgeMesManifest["data_contract"];
  health_check_interval_ms: number;
  connection_params: Array<{
    name: string;
    description: string;
    required: boolean;
    secret: boolean;
    default_value: string;
  }>;
  auth_methods: string[];
  metadata?: ProtoStruct;
}

export const FORGE_MES_MANIFEST: ForgeMesManifest =
  manifestJson as unknown as ForgeMesManifest;

/** Map the FACTS tier label ("MES_MOM") to the proto enum name. */
export function tierToEnum(tier: string): string {
  const t = tier.trim().toUpperCase();
  return t.startsWith("ADAPTER_TIER_") ? t : `ADAPTER_TIER_${t}`;
}

export function toProtoManifest(
  manifest: ForgeMesManifest = FORGE_MES_MANIFEST,
  overrides: { adapterId?: string } = {}
): ProtoAdapterManifest {
  return {
    adapter_id: overrides.adapterId ?? manifest.adapter_id,
    name: manifest.name,
    version: manifest.version,
    type: manifest.type,
    protocol: manifest.protocol,
    tier: tierToEnum(manifest.tier),
    capabilities: { ...manifest.capabilities },
    data_contract: {
      schema_ref: manifest.data_contract.schema_ref,
      output_format: manifest.data_contract.output_format,
      context_fields: [...manifest.data_contract.context_fields],
    },
    health_check_interval_ms: manifest.health_check_interval_ms,
    connection_params: manifest.connection_params.map((p) => ({
      name: p.name,
      description: p.description ?? "",
      required: p.required ?? false,
      secret: p.secret ?? false,
      default_value: p.default ?? "",
    })),
    auth_methods: [...manifest.auth_methods],
    ...(manifest.metadata ? { metadata: toStruct(manifest.metadata) } : {}),
  };
}
