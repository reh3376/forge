import { PrismaService } from "./prisma.service";

class TestPrismaService extends PrismaService {
  public middlewareFns: any[] = [];

  constructor() {
    super();
    this.middlewareFns = [];
    // Override the $use method after calling super()
    this.$use = (fn: any) => {
      this.middlewareFns.push(fn);
    };
  }

  $queryRaw = jest.fn();
}

describe("PrismaService middleware", () => {
  test("adds schemaVersion on create", async () => {
    const prisma = new TestPrismaService();
    prisma.$queryRaw.mockResolvedValue([
      { migration_name: "20250101000000_init" },
    ]);

    const middleware = (prisma as any).schemaVersionMiddleware();

    const params: any = { action: "create", args: { data: {} } };
    await middleware(params, async (p: any) => p);
    expect(params.args.data.schemaVersion).toBe("20250101000000_init");
  });
});
