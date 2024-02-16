import { ConfigService } from "@nestjs/config";
import { Params } from "nestjs-pino";

const ADDITIONAL_LOG_PROPERTIES = {};;

export const LoggerConfiguration = (configService: ConfigService): Params => {
  const logLevel = configService.getOrThrow("LOG_LEVEL");
  const serviceName = configService.getOrThrow("SERVICE_NAME") ?? "";

  const allowedLevels = ["fatal", "error", "warn", "info", "debug", "trace"];

  if (!allowedLevels.includes(logLevel)) {
    throw new Error(
      `${logLevel} is not a valid log level. Check your LOG_LEVEL env variable.`
    );
  }

  return {
    pinoHttp: {
      level: logLevel,
      mixin: () => ({ ...ADDITIONAL_LOG_PROPERTIES, serviceName }),
    },
  };
};
