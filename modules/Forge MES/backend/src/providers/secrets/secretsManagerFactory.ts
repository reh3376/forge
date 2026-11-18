import { DefaultAzureCredential } from "@azure/identity";
import { ConfigService } from "@nestjs/config";
import { SecretClient } from "@azure/keyvault-secrets";
import { EnumSecretsNameKey } from "./secretsNameKey.enum";
import { Logger } from "@nestjs/common";

export type SecretsList = Partial<Record<EnumSecretsNameKey, unknown>>;

/**
 * Load the secrets from Azure Key Vault, when a vault is configured.
 *
 * With `AZURE_VAULT_NAME` unset there is no vault to ask. Before this check the factory
 * built the address `https://undefined.vault.azure.net` and asked it for every secret:
 * one failed DNS lookup and one error line per secret at every start, in tests and in
 * CI as well. Now it says once that no vault is configured and returns nothing, and
 * `SecretsManagerService` reads each secret from the environment, as it already did
 * for any secret the vault did not hold.
 */
export async function loadVaultSecrets(
  configService: ConfigService,
  logger: Logger = new Logger("SecretsManager")
): Promise<SecretsList> {
  const vaultName = String(configService.get("AZURE_VAULT_NAME") ?? "").trim();
  if (!vaultName) {
    logger.warn(
      "AZURE_VAULT_NAME is not set: Azure Key Vault is not used, secrets are read from the environment"
    );
    return {};
  }

  const client = new SecretClient(
    `https://${vaultName}.vault.azure.net`,
    new DefaultAzureCredential()
  );

  let secrets: SecretsList = {};

  for (const path of Object.values(EnumSecretsNameKey)) {
    const [name, version] = path.split(":");

    try {
      const secret = await client.getSecret(name, {
        version: version ?? null,
      });

      secrets = { ...secrets, [path]: secret.value };
    } catch (err: unknown) {
      if (err instanceof Error) {
        logger.error(
          `Error while loading the secret ${name} version ${version} - ${err.message}`
        );
      }
    }
  }

  return secrets;
}

export const SecretsManagerFactory = {
  provide: "AZURE_KEY_VAULT",
  useFactory: (configService: ConfigService) => loadVaultSecrets(configService),
  inject: [ConfigService],
};
