/**
 * Adapter bridge — translates between NestJS APIs and Forge ContextualRecords.
 *
 * The bridge is the sidecar's core logic. It:
 *  1. Fetches raw data from the NestJS GraphQL API (WMS or MES)
 *  2. Transforms raw data into Forge ContextualRecord format
 *  3. Yields records as an async iterable for the gRPC client to stream
 *
 * This is the TypeScript equivalent of the Python adapter's collect() method
 * combined with its mapper functions.
 *
 * For the skeleton, we implement:
 *  - A generic bridge interface
 *  - A mock bridge for testing
 *  - GraphQL fetch scaffolding
 */

import type {
  ContextualRecord,
  RecordSource,
  RecordTimestamp,
  RecordValue,
  RecordContext,
  RecordLineage,
  ProtoTimestamp,
  QualityCode,
} from './types';

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------

function dateToProtoTimestamp(date: Date): ProtoTimestamp {
  const ms = date.getTime();
  const seconds = Math.floor(ms / 1000);
  const nanos = (ms % 1000) * 1_000_000;
  return { seconds, nanos };
}

function nowTimestamp(): ProtoTimestamp {
  return dateToProtoTimestamp(new Date());
}

// ---------------------------------------------------------------------------
// Bridge interface
// ---------------------------------------------------------------------------

export interface AdapterBridgeConfig {
  /** GraphQL endpoint URL */
  graphqlUrl: string;
  /** Adapter ID (e.g. "whk-wms", "whk-mes") */
  adapterId: string;
  /** Adapter version */
  adapterVersion: string;
  /** Schema reference for lineage */
  schemaRef: string;
}

/**
 * Abstract bridge — subclass per spoke system.
 */
export abstract class AdapterBridge {
  protected config: AdapterBridgeConfig;

  constructor(config: AdapterBridgeConfig) {
    this.config = config;
  }

  /**
   * Fetch raw data from the source system and yield ContextualRecords.
   * This is the TypeScript equivalent of Python's collect() async generator.
   */
  abstract collect(): AsyncIterable<ContextualRecord>;

  /**
   * Build a ContextualRecord from raw source data.
   * Subclasses call this with mapped values.
   */
  protected buildRecord(params: {
    rawValue: unknown;
    dataType: string;
    engineeringUnits?: string;
    tagPath?: string;
    context: Partial<RecordContext>;
    sourceTime: Date;
  }): ContextualRecord {
    const { rawValue, dataType, engineeringUnits, tagPath, context, sourceTime } = params;

    const source: RecordSource = {
      adapterId: this.config.adapterId,
      system: this.config.adapterId,
      tagPath: tagPath,
    };

    const timestamp: RecordTimestamp = {
      sourceTime: dateToProtoTimestamp(sourceTime),
      ingestionTime: nowTimestamp(),
    };

    const value: RecordValue = {
      engineeringUnits: engineeringUnits ?? '',
      quality: 1, // GOOD
      dataType,
      ...(typeof rawValue === 'number'
        ? { numberValue: rawValue }
        : typeof rawValue === 'string'
          ? { stringValue: rawValue }
          : typeof rawValue === 'boolean'
            ? { boolValue: rawValue }
            : { jsonValue: JSON.stringify(rawValue) }),
    };

    const recordContext: RecordContext = {
      extra: {},
      ...context,
    };

    const lineage: RecordLineage = {
      schemaRef: this.config.schemaRef,
      adapterId: this.config.adapterId,
      adapterVersion: this.config.adapterVersion,
      transformationChain: ['sidecar:collect'],
    };

    return {
      recordId: crypto.randomUUID(),
      source,
      timestamp,
      value,
      context: recordContext,
      lineage,
    };
  }
}

// ---------------------------------------------------------------------------
// Mock bridge for testing
// ---------------------------------------------------------------------------

/**
 * MockBridge generates synthetic ContextualRecords for testing
 * the gRPC streaming path without a real NestJS backend.
 */
export class MockBridge extends AdapterBridge {
  private recordCount: number;

  constructor(config: AdapterBridgeConfig, recordCount = 10) {
    super(config);
    this.recordCount = recordCount;
  }

  async *collect(): AsyncIterable<ContextualRecord> {
    for (let i = 0; i < this.recordCount; i++) {
      yield this.buildRecord({
        rawValue: 72.5 + Math.random() * 10,
        dataType: 'float64',
        engineeringUnits: '°F',
        tagPath: `mock/sensor/${i}`,
        context: {
          equipmentId: `EQUIP-${String(i).padStart(3, '0')}`,
          batchId: 'B2026-MOCK-001',
          shift: i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'C',
          operatingMode: 'PRODUCTION',
        },
        sourceTime: new Date(),
      });
    }
  }
}
