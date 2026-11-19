import { ConfigService } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import { SecretClient } from "@azure/keyvault-secrets";
import { loadVaultSecrets } from "./secretsManagerFactory";
import { EnumSecretsNameKey } from "./secretsNameKey.enum";

jest.mock("@azure/identity", () => ({
  DefaultAzureCredential: jest.fn(),
}));
jest.mock("@azure/keyvault-secrets", () => ({
  SecretClient: jest.fn(),
}));

const config = (vaultName: unknown) =>
  ({ get: jest.fn().mockReturnValue(vaultName) } as unknown as ConfigService);

const logger = () =>
  ({ warn: jest.fn(), error: jest.fn() } as unknown as Logger & {
    warn: jest.Mock;
    error: jest.Mock;
  });

describe("loadVaultSecrets", () => {
  beforeEach(() => {
    (SecretClient as unknown as jest.Mock).mockReset();
  });

  it.each([undefined, null, "", "   "])(
    "does not ask a vault when AZURE_VAULT_NAME is %p",
    async (vaultName) => {
      const log = logger();
      const secrets = await loadVaultSecrets(config(vaultName), log);

      expect(secrets).toEqual({});
      // no client, so no lookup of undefined.vault.azure.net
      expect(SecretClient).not.toHaveBeenCalled();
      // said once, with the cause, and not as one error per secret
      expect(log.warn).toHaveBeenCalledTimes(1);
      expect(log.warn.mock.calls[0][0]).toContain(
        "AZURE_VAULT_NAME is not set"
      );
      expect(log.error).not.toHaveBeenCalled();
    }
  );

  it("asks the configured vault for every secret", async () => {
    const getSecret = jest
      .fn()
      .mockImplementation(async (name: string) => ({
        value: `value-of-${name}`,
      }));
    (SecretClient as unknown as jest.Mock).mockImplementation(() => ({
      getSecret,
    }));
    const log = logger();

    const secrets = await loadVaultSecrets(config("plant-vault"), log);

    expect(SecretClient).toHaveBeenCalledTimes(1);
    expect((SecretClient as unknown as jest.Mock).mock.calls[0][0]).toBe(
      "https://plant-vault.vault.azure.net"
    );
    expect(getSecret).toHaveBeenCalledTimes(
      Object.values(EnumSecretsNameKey).length
    );
    expect(secrets[EnumSecretsNameKey.MqttPassword]).toBe(
      "value-of-MqttPassword"
    );
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it("reports a secret the vault could not give and keeps the others", async () => {
    const getSecret = jest.fn().mockImplementation(async (name: string) => {
      if (name === "MqttPassword") {
        throw new Error("SecretNotFound");
      }
      return { value: "ok" };
    });
    (SecretClient as unknown as jest.Mock).mockImplementation(() => ({
      getSecret,
    }));
    const log = logger();

    const secrets = await loadVaultSecrets(config("plant-vault"), log);

    expect(secrets[EnumSecretsNameKey.MqttPassword]).toBeUndefined();
    expect(secrets[EnumSecretsNameKey.MqttUsername]).toBe("ok");
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error.mock.calls[0][0]).toContain("MqttPassword");
    expect(log.error.mock.calls[0][0]).toContain("SecretNotFound");
  });
});
