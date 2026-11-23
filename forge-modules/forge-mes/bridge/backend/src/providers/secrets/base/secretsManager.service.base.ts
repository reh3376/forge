import { ConfigService } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import { EnumSecretsNameKey } from "../secretsNameKey.enum";

export interface ISecretsManager {
  getSecret: (key: EnumSecretsNameKey) => Promise<any | null>;
}

export class SecretsManagerServiceBase implements ISecretsManager {
  protected readonly logger = new Logger("SecretsManagerBase");

  constructor(protected readonly configService: ConfigService) {}
  async getSecret<T>(key: EnumSecretsNameKey): Promise<T | null> {
    const keyString = key.toString();
    this.logger.debug(`Looking for config key: ${keyString}`);
    const value = this.configService.get(keyString);
    this.logger.debug(
      `ConfigService.get('${keyString}') returned: ${
        value ? "(found)" : "(not found)"
      }`
    );
    if (value) {
      return value;
    }
    return null;
  }
}
