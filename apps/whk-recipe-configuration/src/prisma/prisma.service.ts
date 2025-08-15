import { Injectable, OnModuleInit, INestApplication } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private cachedVersion: string | null = null;

  async onModuleInit() {
    await this.$connect();
    this.$use(this.schemaVersionMiddleware());
  }

  private schemaVersionMiddleware(): Prisma.Middleware {
    return async (params, next) => {
      if (params.action === "create" || params.action === "createMany") {
        let version: string | null = null;
        try {
          version = await this.getSchemaVersion();
        } catch (error) {
          // Swallow errors here to avoid blocking writes; logging occurs in refresh/get
          version = null;
        }

        if (params.action === "createMany") {
          const data = params.args?.data;
          if (Array.isArray(data)) {
            params.args.data = data.map((record: unknown) => {
              if (record && typeof record === "object") {
                const r: any = record;
                if (
                  version !== null &&
                  (r.schemaVersion === undefined || r.schemaVersion === null)
                ) {
                  return { schemaVersion: version, ...r };
                }
                return r;
              }
              return record;
            });
          }
        } else if (params.args?.data && typeof params.args.data === "object") {
          // Only set when we have a non-null version to avoid writing null
          if (
            version !== null &&
            (params.args.data.schemaVersion === undefined ||
              params.args.data.schemaVersion === null)
          ) {
            params.args.data.schemaVersion = version;
          }
        }
      }
      return next(params);
    };
  }

  async refreshSchemaVersion(): Promise<void> {
    try {
      const rows = await this.$queryRaw<
        { migration_name: string }[]
      >`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY finished_at DESC LIMIT 1`;
      const latest = rows?.[0]?.migration_name ?? null;
      // Only update the cache when we have a concrete value; otherwise retain the last good value
      if (latest) {
        this.cachedVersion = latest;
      }
    } catch (error) {
      // Keep the previous cached value to avoid failures during transient issues or cold starts
      // eslint-disable-next-line no-console
      console.warn(
        "PrismaService.refreshSchemaVersion: failed to fetch latest migration; continuing with previous cached value",
        error
      );
    }
  }

  async getSchemaVersion(): Promise<string | null> {
    if (this.cachedVersion) {
      return this.cachedVersion;
    }
    try {
      await this.refreshSchemaVersion();
    } catch (error) {
      // refreshSchemaVersion already logs and retains previous value
    }
    return this.cachedVersion;
  }
}
