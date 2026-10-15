import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SecretsManagerServiceBase } from "./base/secretsManager.service.base";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretsList } from "./secretsManagerFactory";
import { EnumSecretsNameKey } from "./secretsNameKey.enum";

@Injectable()
export class SecretsManagerService extends SecretsManagerServiceBase {
  protected readonly logger = new Logger(SecretsManagerService.name);

  constructor(
    @Inject("AZURE_KEY_VAULT")
    protected readonly secrets: SecretsList,
    protected readonly configService: ConfigService
  ) {
    super(configService);
  }

  async getSecret<T>(key: EnumSecretsNameKey): Promise<T | null> {
    // First try Azure Key Vault
    const vaultSecret = this.secrets[key];
    if (vaultSecret) {
      this.logger.log(`Found secret ${key} in Azure Key Vault`);
      return vaultSecret as T;
    }

    // Fallback to environment variables using the base class method
    this.logger.warn(
      `Secret ${key} not found in Azure Key Vault, falling back to environment variables`
    );
    const envSecret = await super.getSecret<T>(key);

    if (envSecret) {
      this.logger.log(`Found secret ${key} in environment variables`);
    } else {
      this.logger.error(
        `Secret ${key} not found in Azure Key Vault or environment variables`
      );
    }

    return envSecret;
  }
}
