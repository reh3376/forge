/**
 * ForgeHubService handshake: the spoke's callback address travels in
 * Configure, and the hub-issued session id is handed to the spoke server.
 */
import { loadForgeConfig } from "../forge.config";
import { ForgeHubService } from "../forge-hub.service";

class FakeClient {
  configured: Array<{ sessionId: string; params: Record<string, string> }> = [];
  stopped = false;
  closed = false;
  rejectRegister = false;
  async register() {
    if (this.rejectRegister) return { accepted: false, message: "FACTS conformance failed", session_id: "" };
    return { accepted: true, message: "registered", session_id: "sess-42" };
  }
  async configure(_a: string, sessionId: string, params: Record<string, string>) {
    this.configured.push({ sessionId, params });
    return { success: true, message: "configured" };
  }
  async start() {
    return { success: true, message: "started" };
  }
  async stop() {
    this.stopped = true;
    return { success: true, message: "stopped", records_flushed: 0 };
  }
  async health() {
    return { adapter_id: "forge-mes", state: "ADAPTER_STATE_HEALTHY" };
  }
  close() {
    this.closed = true;
  }
}

class FakeIngest {
  session?: string;
  drained = false;
  stoppedFlag = false;
  setSession(id?: string) {
    this.session = id;
  }
  async drain() {
    this.drained = true;
  }
  stop() {
    this.stoppedFlag = true;
  }
  getStatus() {
    return { sessionId: this.session };
  }
}

class FakeSpoke {
  expected: Array<string | undefined> = [];
  readonly callbackToken = "tok-1";
  constructor(private readonly url?: string) {}
  whenListening() {
    return Promise.resolve(this.url);
  }
  setExpectedSession(id?: string) {
    this.expected.push(id);
  }
  getStatus() {
    return { advertisedUrl: this.url };
  }
}

const config = loadForgeConfig((k) =>
  ({ FORGE_HUB_ENABLED: "true", FORGE_SELF_GRAPHQL_URL: "http://mes:3000/graphql" })[k]
);

describe("ForgeHubService", () => {
  it("advertises the spoke callback on Configure and shares the session with the spoke server", async () => {
    const client = new FakeClient();
    const ingest = new FakeIngest();
    const spoke = new FakeSpoke("mes-backend:50052");
    const service = new ForgeHubService(config, client as any, ingest as any, spoke as any);

    service.onApplicationBootstrap();
    await service.whenConnected();

    expect(client.configured).toEqual([
      {
        sessionId: "sess-42",
        params: {
          graphql_url: "http://mes:3000/graphql",
          transport_mode: "push",
          grpc_callback_url: "mes-backend:50052",
          grpc_callback_token: "tok-1",
        },
      },
    ]);
    expect(spoke.expected).toEqual(["sess-42"]);
    expect(ingest.session).toBe("sess-42");
    const status = service.getStatus();
    expect(status).toMatchObject({ state: "healthy", sessionId: "sess-42", callbackUrl: "mes-backend:50052" });

    await service.onModuleDestroy();
    expect(client.stopped).toBe(true);
    expect(ingest.drained).toBe(true);
    expect(spoke.expected).toEqual(["sess-42", undefined]);
    expect(service.getStatus().state).toBe("stopped");
  });

  it("registers without a callback when the spoke server is not listening", async () => {
    const client = new FakeClient();
    const service = new ForgeHubService(config, client as any, new FakeIngest() as any, new FakeSpoke(undefined) as any);
    service.onApplicationBootstrap();
    await service.whenConnected();
    expect(client.configured[0].params).toEqual({
      graphql_url: "http://mes:3000/graphql",
      transport_mode: "push",
    });
    expect(service.getStatus().callbackUrl).toBeUndefined();
    await service.onModuleDestroy();
  });

  it("does nothing when disabled", async () => {
    const client = new FakeClient();
    const spoke = new FakeSpoke("x");
    const service = new ForgeHubService(loadForgeConfig(() => undefined), client as any, new FakeIngest() as any, spoke as any);
    service.onApplicationBootstrap();
    await service.whenConnected();
    expect(client.configured).toHaveLength(0);
    expect(service.getStatus().state).toBe("disabled");
    await service.onModuleDestroy();
    expect(client.stopped).toBe(false);
  });
});
