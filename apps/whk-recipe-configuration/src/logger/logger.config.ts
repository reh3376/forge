import { ConfigService } from "@nestjs/config";
import { WinstonModuleOptions } from "nest-winston";
import * as winston from "winston";

const ADDITIONAL_LOG_PROPERTIES = {};

export const LoggerConfiguration = (
  configService: ConfigService
): WinstonModuleOptions => {
  const logLevel = configService.getOrThrow("LOG_LEVEL");
  const serviceName = configService.getOrThrow("SERVICE_NAME") ?? "";
  const sensitiveKeys = configService.get("SENSITIVE_KEYS")?.split(",") ?? [];
  const logRequest = configService.get("LOG_REQUEST") === "true";
  const prettyPrint = configService.get("PRETTY_PRINT") === "true";

  const allowedLevels = [
    "error",
    "warn",
    "info",
    "http",
    "verbose",
    "debug",
    "silly",
  ];

  if (!allowedLevels.includes(logLevel)) {
    throw new Error(
      `${logLevel} is not a valid log level. Check your LOG_LEVEL env variable.`
    );
  }

  const format = prettyPrint
    ? winston.format.combine(winston.format.colorize(), winston.format.simple())
    : winston.format.json();

  return {
    level: logLevel,
    format: winston.format.combine(
      winston.format((info) => {
        info.serviceName = serviceName;
        return info;
      })(),
      format
    ),
    transports: [new winston.transports.Console()],
    // Add custom Winston options here if needed for New Relic integration
  };
};
