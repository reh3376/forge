/**
 * Proto loading and wire-format helpers for the forge.v1 AdapterService.
 *
 * The .proto files under ./proto/forge/v1 are vendored copies of the hub's
 * `src/forge/proto/*.proto`; `__tests__/forge-parity.spec.ts` fails when they
 * drift. Loading is dynamic (@grpc/proto-loader) so no codegen step exists.
 */
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";

export const PROTO_DIR = path.resolve(__dirname, "proto");
export const ADAPTER_SERVICE_PROTO = path.join(
  PROTO_DIR,
  "forge",
  "v1",
  "adapter_service.proto"
);

/** proto-loader options shared by client and in-process test servers. */
export const PROTO_LOADER_OPTIONS: protoLoader.Options = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: false,
  oneofs: true,
  includeDirs: [PROTO_DIR],
};

// ---------------------------------------------------------------------------
// google.protobuf.Timestamp
// ---------------------------------------------------------------------------
export interface ProtoTimestamp {
  seconds: string;
  nanos: number;
}

export function toTimestamp(date: Date): ProtoTimestamp {
  const ms = date.getTime();
  const seconds = Math.floor(ms / 1000);
  return { seconds: String(seconds), nanos: (ms - seconds * 1000) * 1_000_000 };
}

export function fromTimestamp(
  ts?: { seconds?: string | number; nanos?: number } | null
): Date | undefined {
  if (!ts || ts.seconds === undefined) return undefined;
  const seconds = Number(ts.seconds);
  if (!Number.isFinite(seconds)) return undefined;
  return new Date(seconds * 1000 + Math.floor((ts.nanos ?? 0) / 1_000_000));
}

// ---------------------------------------------------------------------------
// google.protobuf.Struct / Value
//
// NOTE: protobufjs ships the google.protobuf well-known types with camelCase
// field names regardless of the keepCase option, so Value variants must be
// spelled stringValue / numberValue / ... (verified against protobufjs 7.x).
// ---------------------------------------------------------------------------
export type ProtoValue =
  | { nullValue: "NULL_VALUE" }
  | { numberValue: number }
  | { stringValue: string }
  | { boolValue: boolean }
  | { structValue: ProtoStruct }
  | { listValue: { values: ProtoValue[] } };

export interface ProtoStruct {
  fields: Record<string, ProtoValue>;
}

export function toProtoValue(v: unknown): ProtoValue {
  if (v === null || v === undefined) return { nullValue: "NULL_VALUE" };
  if (typeof v === "number") return { numberValue: v };
  if (typeof v === "boolean") return { boolValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (v instanceof Date) return { stringValue: v.toISOString() };
  if (Array.isArray(v)) return { listValue: { values: v.map(toProtoValue) } };
  if (typeof v === "object") {
    return { structValue: toStruct(v as Record<string, unknown>) };
  }
  return { stringValue: String(v) };
}

export function toStruct(obj: Record<string, unknown>): ProtoStruct {
  const fields: Record<string, ProtoValue> = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toProtoValue(v);
  return { fields };
}

// ---------------------------------------------------------------------------
// Package loading (cached)
// ---------------------------------------------------------------------------
let packageCache: grpc.GrpcObject | undefined;

/** The loaded `forge.v1` namespace (service constructors + message types). */
export function loadForgeV1(): grpc.GrpcObject {
  if (!packageCache) {
    const definition = protoLoader.loadSync(
      ADAPTER_SERVICE_PROTO,
      PROTO_LOADER_OPTIONS
    );
    const root = grpc.loadPackageDefinition(definition) as grpc.GrpcObject;
    const forge = root["forge"] as grpc.GrpcObject;
    packageCache = forge["v1"] as grpc.GrpcObject;
  }
  return packageCache;
}

/** Constructor for the AdapterService client (also exposes `.service` for servers). */
export function getAdapterService(): grpc.ServiceClientConstructor {
  return loadForgeV1()["AdapterService"] as grpc.ServiceClientConstructor;
}
