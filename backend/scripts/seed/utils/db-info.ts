/**
 * Utility to safely parse and display database connection information
 * without exposing sensitive credentials
 */

export interface DatabaseConnectionInfo {
  host: string;
  port: string;
  database: string;
  username: string;
  isValid: boolean;
  formattedInfo: string;
}

/**
 * Parse DATABASE_URL or DB_URL and extract connection info safely
 * @param connectionUrl - PostgreSQL connection string from environment
 * @returns Parsed connection info with masked password
 */
export function parseDatabaseUrl(
  connectionUrl: string | undefined
): DatabaseConnectionInfo {
  const defaultInfo: DatabaseConnectionInfo = {
    host: "unknown",
    port: "5432",
    database: "unknown",
    username: "unknown",
    isValid: false,
    formattedInfo: "No database URL configured",
  };

  if (!connectionUrl) {
    return defaultInfo;
  }

  try {
    // PostgreSQL URL format: postgresql://username:password@host:port/database?params
    const url = new URL(connectionUrl);

    const host = url.hostname || "unknown";
    const port = url.port || "5432";
    const database = url.pathname.slice(1) || "unknown"; // Remove leading slash
    const username = url.username || "unknown";

    // Determine environment based on host
    let environment = "unknown";
    if (host.includes("localhost") || host.includes("127.0.0.1")) {
      environment = "LOCAL";
    } else if (host.includes("railway")) {
      environment = "RAILWAY";
    } else if (host.includes("azure") || host.includes("postgres.database")) {
      environment = "AZURE";
    } else if (host.includes("docker.internal")) {
      environment = "DOCKER";
    }

    const formattedInfo = `${database} | ${host}:${port} | ${username}${
      environment !== "unknown" ? ` [${environment}]` : ""
    }`;

    return {
      host,
      port,
      database,
      username,
      isValid: true,
      formattedInfo,
    };
  } catch (error) {
    return {
      ...defaultInfo,
      formattedInfo: `Invalid database URL format: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
}

/**
 * Get database connection info from environment
 * Checks both DB_URL and DATABASE_URL (with DB_URL taking precedence)
 */
export function getDatabaseConnectionInfo(): DatabaseConnectionInfo {
  // Check DB_URL first (used by Prisma schema in this project)
  const dbUrl = process.env.DB_URL || process.env.DATABASE_URL;
  return parseDatabaseUrl(dbUrl);
}
