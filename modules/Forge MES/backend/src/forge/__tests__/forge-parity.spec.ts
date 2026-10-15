/**
 * Guards the vendored copies against drift from the hub:
 *   - src/forge/proto/forge/v1/*.proto  == <repo>/src/forge/proto/*.proto
 *   - src/forge/forge-mes.manifest.json == <repo>/src/forge/adapters/forge_mes/manifest.json
 *
 * Skipped when the backend is built outside the forge monorepo (no hub tree).
 */
import * as fs from "fs";
import * as path from "path";
import { FORGE_MES_MANIFEST, toProtoManifest } from "../forge-manifest";
import { ADAPTER_SERVICE_PROTO, PROTO_DIR, getAdapterService, loadForgeV1 } from "../proto";

const HUB_ROOT = path.resolve(__dirname, "../../../../../../src/forge");
const hubPresent = fs.existsSync(path.join(HUB_ROOT, "proto", "adapter_service.proto"));
const describeIfHub = hubPresent ? describe : describe.skip;

describeIfHub("vendored hub contract parity", () => {
  it.each(["adapter", "adapter_service", "contextual_record", "enums"])(
    "%s.proto matches the hub copy",
    (name) => {
      const local = fs.readFileSync(
        path.join(PROTO_DIR, "forge", "v1", `${name}.proto`),
        "utf8"
      );
      const hub = fs.readFileSync(path.join(HUB_ROOT, "proto", `${name}.proto`), "utf8");
      expect(local).toBe(hub);
    }
  );

  it("forge-mes.manifest.json matches the hub adapter manifest", () => {
    const hub = JSON.parse(
      fs.readFileSync(path.join(HUB_ROOT, "adapters", "forge_mes", "manifest.json"), "utf8")
    );
    expect(FORGE_MES_MANIFEST).toEqual(hub);
  });
});

describe("proto loading", () => {
  it("loads the forge.v1 package and the AdapterService", () => {
    expect(fs.existsSync(ADAPTER_SERVICE_PROTO)).toBe(true);
    const v1 = loadForgeV1();
    expect(v1["ContextualRecord"]).toBeDefined();
    const Service = getAdapterService();
    const methods = Object.keys(Service.service);
    expect(methods).toEqual(
      expect.arrayContaining(["Register", "Configure", "Start", "Stop", "Health", "Ingest"])
    );
  });
});

describe("toProtoManifest", () => {
  it("converts the FACTS manifest to the AdapterManifest wire shape", () => {
    const m = toProtoManifest();
    expect(m.adapter_id).toBe("forge-mes");
    expect(m.tier).toBe("ADAPTER_TIER_MES_MOM");
    expect(m.type).toBe("INGESTION");
    expect(m.capabilities).toEqual({
      read: true,
      write: true,
      subscribe: true,
      backfill: true,
      discover: true,
    });
    expect(m.data_contract.schema_ref).toBe("forge://schemas/forge-mes/v0.1.0");
    expect(m.data_contract.context_fields).toHaveLength(6);
    expect(m.connection_params.length).toBeGreaterThan(10);
    for (const p of m.connection_params) {
      expect(typeof p.default_value).toBe("string");
      expect(typeof p.secret).toBe("boolean");
    }
    expect(m.metadata?.fields["spoke"]).toEqual({ stringValue: "forge-mes" });
  });

  it("honours an adapter id override", () => {
    expect(toProtoManifest(undefined, { adapterId: "forge-mes-staging" }).adapter_id).toBe(
      "forge-mes-staging"
    );
  });
});
