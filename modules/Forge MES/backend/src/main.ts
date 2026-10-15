// Polyfill crypto for @nestjs/schedule compatibility in environments without a global implementation
import { webcrypto } from "crypto";

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}

import { Logger, ValidationPipe } from "@nestjs/common";
import {
  AbstractHttpAdapter,
  HttpAdapterHost,
  NestFactory,
} from "@nestjs/core";
import { OpenAPIObject, SwaggerModule } from "@nestjs/swagger";
import { HttpExceptionFilter } from "./filters/HttpExceptions.filter";
import { AppModule } from "./app.module";
import { connectMicroservices } from "./connectMicroservices";
import { NewrelicInterceptor } from "./newrelic.interceptor";

import {
  swaggerPath,
  swaggerDocumentOptions,
  swaggerSetupOptions,
} from "./swagger";
import fs from "fs";
import { HttpsOptions } from "@nestjs/common/interfaces/external/https-options.interface";
import https from "https";
import http from "http";
import express from "express";
import { ExpressAdapter } from "@nestjs/platform-express";
import cors from "cors";

const {
  PORT = 3000,
  HTTPS_PORT = 443,
  APP_MODE,
  SSL_CERT_PATH,
  SSL_KEY_PATH,
  SSL_CA_PATH,
} = process.env;

const httpsOptions: HttpsOptions = {
  cert: SSL_CERT_PATH && fs.readFileSync(SSL_CERT_PATH),
  key: SSL_KEY_PATH && fs.readFileSync(SSL_KEY_PATH),
  ca: SSL_CA_PATH && fs.readFileSync(SSL_CA_PATH),
};

function getHttpsServer(
  server: express.Express,
  httpsOptions: HttpsOptions,
  APP_MODE: string | undefined
) {
  // Get CORS configuration from environment variables
  const corsOrigins = process.env.CORS_ORIGINS;
  const corsCredentials = process.env.CORS_CREDENTIALS !== "false";
  const corsEnabled = process.env.CORS_ENABLED !== "false";

  // Parse origins from comma-separated string or use defaults
  // For staging/production, add to CORS_ORIGINS env var:
  //   - ngrok tunnel URL (e.g., https://your-domain.ngrok-free.app)
  //   - Vercel deployment URL (e.g., https://mes-ui-staging.vercel.app)
  //   - Vercel preview URLs (e.g., https://mes-ui-*.vercel.app)
  const allowedOrigins = corsOrigins
    ? corsOrigins.split(",").map((origin: string) => origin.trim())
    : [
        "http://localhost:4000",
        "http://localhost:3000",
        "http://127.0.0.1:4000",
        "http://127.0.0.1:3000",
      ];

  const corsConfig = corsEnabled
    ? {
        origin: allowedOrigins,
        credentials: corsCredentials,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allowedHeaders: [
          "Content-Type",
          "Authorization",
          "apollo-require-preflight",
          "x-apollo-operation-name",
          "Accept",
          "Origin",
          "X-Requested-With",
        ],
        preflightContinue: false,
        optionsSuccessStatus: 204,
      }
    : false;

  switch (APP_MODE) {
    case "http":
      return { cors: corsConfig };
    case "https":
      return { httpsOptions, cors: corsConfig };
    case "both":
      return new ExpressAdapter(server);
    default:
      throw new Error(`APP_MODE ${APP_MODE} is not supported`);
  }
}

async function main() {
  const server = express();

  // Get CORS configuration from environment variables
  const corsOrigins = process.env.CORS_ORIGINS;
  const corsCredentials = process.env.CORS_CREDENTIALS !== "false";
  const corsEnabled = process.env.CORS_ENABLED !== "false";

  // Parse origins from comma-separated string or use defaults
  // For staging/production, add to CORS_ORIGINS env var:
  //   - ngrok tunnel URL (e.g., https://your-domain.ngrok-free.app)
  //   - Vercel deployment URL (e.g., https://mes-ui-staging.vercel.app)
  //   - Vercel preview URLs (e.g., https://mes-ui-*.vercel.app)
  const allowedOrigins = corsOrigins
    ? corsOrigins.split(",").map((origin: string) => origin.trim())
    : [
        "http://localhost:4000",
        "http://localhost:3000",
        "http://127.0.0.1:4000",
        "http://127.0.0.1:3000",
      ];

  const corsConfig = corsEnabled
    ? {
        origin: allowedOrigins,
        credentials: corsCredentials,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allowedHeaders: [
          "Content-Type",
          "Authorization",
          "apollo-require-preflight",
          "x-apollo-operation-name",
          "Accept",
          "Origin",
          "X-Requested-With",
        ],
        preflightContinue: false,
        optionsSuccessStatus: 204,
      }
    : false;

  // Add CORS middleware to Express server BEFORE NestJS app creation
  if (corsEnabled && corsConfig) {
    server.use(cors(corsConfig));

    // Add specific OPTIONS handler for /graphql endpoint
    server.options("/graphql", (req, res) => {
      res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, apollo-require-preflight, x-apollo-operation-name"
      );
      res.header("Access-Control-Allow-Credentials", "true");
      res.sendStatus(204);
    });
  }

  let app = null;
  if (process.env.DEV_TOOLS_ENABLE === "false") {
    app = await NestFactory.create(
      AppModule,
      getHttpsServer(server, httpsOptions, APP_MODE) as AbstractHttpAdapter
    );
  } else {
    // For development, create app with the Express server that has the OPTIONS handler
    const adapter = new ExpressAdapter(server);
    app = await NestFactory.create(AppModule, adapter);
  }

  // Enable CORS explicitly
  if (corsEnabled && corsConfig) {
    app.enableCors(corsConfig);
  }

  app.useGlobalInterceptors(new NewrelicInterceptor());

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      forbidUnknownValues: false,
    })
  );

  //This fix is based on https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt#use_within_json
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  BigInt.prototype.toJSON = function () {
    return this.toString();
  };

  const document = SwaggerModule.createDocument(app, swaggerDocumentOptions);
  SwaggerModule.setup("api", app, document);
  // Write the OpenAPI document to a file
  fs.writeFileSync("./openapi.json", JSON.stringify(document, null, 2));

  /** check if there is Public decorator for each path (action) and its method (findMany / findOne) on each controller */
  Object.values((document as OpenAPIObject).paths).forEach((path: any) => {
    Object.values(path).forEach((method: any) => {
      if (
        Array.isArray(method.security) &&
        method.security.includes("isPublic")
      ) {
        method.security = [];
      }
    });
  });

  await connectMicroservices(app);
  await app.startAllMicroservices();

  SwaggerModule.setup(swaggerPath, app, document, swaggerSetupOptions);

  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new HttpExceptionFilter(httpAdapter));

  await app.init();

  if (APP_MODE === "both") {
    Logger.log(`🚀 Running both http and https server`, "NestApplication");
    // create both http and https server
    http.createServer(server).listen(PORT);
    https.createServer(httpsOptions, server).listen(HTTPS_PORT);
  } else {
    Logger.log(`🚀 Running ${APP_MODE || "http"} server`, "NestApplication");
    await app.listen(PORT);
  }

  return app;
}

module.exports = main();
