/**
 * Forge WHK Sidecar — entry point
 *
 * This is the main process for the WHK spoke sidecar. It:
 *  1. Loads configuration (hub address, adapter type, connection params)
 *  2. Connects to the Forge hub via gRPC
 *  3. Registers the adapter manifest
 *  4. Runs collect cycles, streaming ContextualRecords to the hub
 *
 * For the skeleton, this demonstrates the startup sequence using the
 * MockBridge. Production usage would instantiate a WmsBridge or MesBridge
 * configured with real GraphQL/MQTT/RabbitMQ endpoints.
 */

import { ForgeHubClient } from './grpc-client';
import { MockBridge } from './adapter-bridge';
import type { AdapterManifest, AdapterTier } from './types';

// ---------------------------------------------------------------------------
// Configuration (from env vars in production)
// ---------------------------------------------------------------------------

const HUB_ADDRESS = process.env.FORGE_HUB_ADDRESS ?? 'localhost:50051';
const ADAPTER_ID = process.env.FORGE_ADAPTER_ID ?? 'whk-wms';
const ADAPTER_VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// Manifest (loaded from JSON in production, inline for skeleton)
// ---------------------------------------------------------------------------

const manifest: AdapterManifest = {
  adapterId: ADAPTER_ID,
  name: `WHK ${ADAPTER_ID.toUpperCase()} Sidecar`,
  version: ADAPTER_VERSION,
  type: 'INGESTION',
  protocol: 'graphql+amqp',
  tier: 2, // MES_MOM
  capabilities: {
    read: true,
    write: false,
    subscribe: true,
    backfill: true,
    discover: true,
  },
  dataContract: {
    schemaRef: `forge://schemas/${ADAPTER_ID}/v${ADAPTER_VERSION}`,
    outputFormat: 'contextual_record',
    contextFields: ['equipment_id', 'lot_id', 'batch_id', 'operator_id', 'shift', 'operating_mode'],
  },
  healthCheckIntervalMs: 30000,
  connectionParams: [],
  authMethods: ['azure_entra_id'],
  metadata: { spoke: ADAPTER_ID },
};

// ---------------------------------------------------------------------------
// Main — startup sequence
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`[forge-sidecar] Starting ${ADAPTER_ID} sidecar...`);
  console.log(`[forge-sidecar] Hub address: ${HUB_ADDRESS}`);

  // 1. Create gRPC client
  const client = new ForgeHubClient({ address: HUB_ADDRESS });

  try {
    // 2. Connect to hub
    await client.connect();
    console.log('[forge-sidecar] Connected to Forge hub');

    // 3. Register adapter
    const registration = await client.register(manifest);
    if (!registration.accepted) {
      console.error(`[forge-sidecar] Registration rejected: ${registration.message}`);
      process.exit(1);
    }
    const sessionId = registration.sessionId;
    console.log(`[forge-sidecar] Registered (session: ${sessionId})`);

    // 4. Configure
    await client.configure(sessionId, {});
    console.log('[forge-sidecar] Configured');

    // 5. Start
    await client.start(sessionId);
    console.log('[forge-sidecar] Started');

    // 6. Create bridge and run collect cycle
    const bridge = new MockBridge(
      {
        graphqlUrl: 'http://localhost:3020/graphql',
        adapterId: ADAPTER_ID,
        adapterVersion: ADAPTER_VERSION,
        schemaRef: manifest.dataContract.schemaRef,
      },
      100, // 100 mock records per cycle
    );

    const sent = await client.streamRecords(sessionId, bridge.collect());
    console.log(`[forge-sidecar] Streamed ${sent} records to hub`);

    // 7. Health check
    const health = await client.health(sessionId);
    console.log(`[forge-sidecar] Health: ${JSON.stringify(health)}`);

    // 8. Stop
    const result = await client.stop(sessionId);
    console.log(`[forge-sidecar] Stopped (flushed: ${result.recordsFlushed})`);
  } catch (err) {
    console.error('[forge-sidecar] Error:', err);
    process.exit(1);
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error('[forge-sidecar] Fatal:', err);
  process.exit(1);
});
