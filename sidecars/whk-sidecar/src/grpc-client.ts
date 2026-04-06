/**
 * Forge gRPC client — connects the sidecar to the Forge hub.
 *
 * This module handles:
 *  1. Loading .proto files and creating a gRPC client
 *  2. Registering the adapter manifest with the hub
 *  3. Streaming ContextualRecords via the Collect() RPC
 *  4. Health polling
 *
 * Usage:
 *   const client = new ForgeHubClient('hub:50051');
 *   await client.connect();
 *   const sessionId = await client.register(manifest);
 *   await client.configure(sessionId, params);
 *   await client.start(sessionId);
 *   client.streamRecords(sessionId, recordIterator);
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import type {
  AdapterManifest,
  AdapterHealth,
  ContextualRecord,
  RegisterResponse,
  ConfigureResponse,
  TagDescriptor,
} from './types';

// Proto file paths — relative to the sidecar package root
const PROTO_DIR = path.resolve(__dirname, '..', 'proto');
const SERVICE_PROTO = path.join(PROTO_DIR, 'adapter_service.proto');

export interface ForgeHubClientOptions {
  /** Hub server address (host:port) */
  address: string;
  /** Use TLS (default: false for dev) */
  useTls?: boolean;
  /** gRPC channel options */
  channelOptions?: grpc.ChannelOptions;
}

export class ForgeHubClient {
  private address: string;
  private useTls: boolean;
  private channelOptions: grpc.ChannelOptions;
  private client: any = null;
  private adapterId: string | null = null;

  constructor(options: ForgeHubClientOptions) {
    this.address = options.address;
    this.useTls = options.useTls ?? false;
    this.channelOptions = options.channelOptions ?? {};
  }

  /**
   * Connect to the Forge hub by loading protos and creating the client stub.
   */
  async connect(): Promise<void> {
    const packageDef = await protoLoader.load(SERVICE_PROTO, {
      keepCase: false,         // camelCase field names
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
      includeDirs: [PROTO_DIR, path.resolve(PROTO_DIR, '..')],
    });

    const proto = grpc.loadPackageDefinition(packageDef) as any;
    const AdapterService = proto.forge.v1.AdapterService;

    const credentials = this.useTls
      ? grpc.credentials.createSsl()
      : grpc.credentials.createInsecure();

    this.client = new AdapterService(
      this.address,
      credentials,
      this.channelOptions,
    );
  }

  /**
   * Register an adapter manifest with the hub.
   * Returns the hub-assigned session ID.
   */
  register(manifest: AdapterManifest): Promise<RegisterResponse> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        return reject(new Error('Not connected — call connect() first'));
      }
      this.client.Register({ manifest }, (err: Error | null, response: RegisterResponse) => {
        if (err) return reject(err);
        this.adapterId = manifest.adapterId;
        resolve(response);
      });
    });
  }

  /**
   * Configure the adapter with connection parameters.
   */
  configure(sessionId: string, params: Record<string, string>): Promise<ConfigureResponse> {
    return new Promise((resolve, reject) => {
      if (!this.client) return reject(new Error('Not connected'));
      this.client.Configure(
        { adapterId: this.adapterId, sessionId, params },
        (err: Error | null, response: ConfigureResponse) => {
          if (err) return reject(err);
          resolve(response);
        },
      );
    });
  }

  /**
   * Start the adapter.
   */
  start(sessionId: string): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve, reject) => {
      if (!this.client) return reject(new Error('Not connected'));
      this.client.Start(
        { adapterId: this.adapterId, sessionId },
        (err: Error | null, response: any) => {
          if (err) return reject(err);
          resolve(response);
        },
      );
    });
  }

  /**
   * Stop the adapter.
   */
  stop(sessionId: string, graceful = true): Promise<{ success: boolean; recordsFlushed: number }> {
    return new Promise((resolve, reject) => {
      if (!this.client) return reject(new Error('Not connected'));
      this.client.Stop(
        { adapterId: this.adapterId, sessionId, graceful },
        (err: Error | null, response: any) => {
          if (err) return reject(err);
          resolve(response);
        },
      );
    });
  }

  /**
   * Get health status.
   */
  health(sessionId: string): Promise<AdapterHealth> {
    return new Promise((resolve, reject) => {
      if (!this.client) return reject(new Error('Not connected'));
      this.client.Health(
        { adapterId: this.adapterId, sessionId },
        (err: Error | null, response: AdapterHealth) => {
          if (err) return reject(err);
          resolve(response);
        },
      );
    });
  }

  /**
   * Stream ContextualRecords to the hub via the Collect() server-streaming RPC.
   *
   * Note: In the sidecar model, the sidecar is the CLIENT that initiates
   * Collect(). The hub responds with a server-streaming RPC. However, in
   * the push model, the sidecar calls a client-streaming or bidirectional
   * RPC to push records. For the initial implementation, we use a callback
   * pattern where the caller provides records via an async iterator.
   */
  async streamRecords(
    sessionId: string,
    records: AsyncIterable<ContextualRecord>,
  ): Promise<number> {
    // For the skeleton, this demonstrates the streaming pattern.
    // The actual implementation depends on whether we use:
    //   a) Client-streaming: sidecar pushes records to hub
    //   b) Server-streaming: hub pulls records from sidecar
    //
    // The proto defines Collect as server-streaming (hub pulls),
    // but the actual push path may use a separate IngestStream RPC.
    // This skeleton demonstrates the serialization and streaming logic.

    let count = 0;
    for await (const record of records) {
      // In production: serialize to proto and write to gRPC stream
      // For now: count records to validate the async iteration works
      count++;
    }
    return count;
  }

  /**
   * Discover available tags in the source system.
   */
  discover(sessionId: string): Promise<TagDescriptor[]> {
    return new Promise((resolve, reject) => {
      if (!this.client) return reject(new Error('Not connected'));
      this.client.Discover(
        { adapterId: this.adapterId, sessionId },
        (err: Error | null, response: { tags: TagDescriptor[] }) => {
          if (err) return reject(err);
          resolve(response.tags || []);
        },
      );
    });
  }

  /**
   * Close the gRPC channel.
   */
  close(): void {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
  }
}
