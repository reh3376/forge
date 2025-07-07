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
        const version = await this.getSchemaVersion();
        if (params.action === "createMany") {
          if (Array.isArray(params.args.data)) {
            params.args.data = params.args.data.map((record: any) => ({
              schemaVersion: version,
              ...record,
            }));
          }
        } else if (params.args?.data) {
          params.args.data.schemaVersion ??= version;
        }
      }
      return next(params);
    };
  }

  async refreshSchemaVersion(): Promise<void> {
    const [row] = await this.$queryRaw<
      { migration_name: string }[]
    >`SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 1`;
    this.cachedVersion = row?.migration_name ?? null;
  }

  async getSchemaVersion(): Promise<string | null> {
    if (!this.cachedVersion) {
      await this.refreshSchemaVersion();
    }
    return this.cachedVersion;
  }
}
