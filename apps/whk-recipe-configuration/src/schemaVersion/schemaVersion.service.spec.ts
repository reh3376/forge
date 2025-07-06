import { SchemaVersionService } from "./schemaVersion.service";
import { PrismaService } from "../prisma/prisma.service";

describe("SchemaVersionService", () => {
  test("returns latest migration name", async () => {
    const prisma = {
      getSchemaVersion: jest.fn().mockResolvedValue("20250101000000_init"),
    } as unknown as PrismaService;

    const service = new SchemaVersionService(prisma);
    const version = await service.getVersion();
    expect(version).toBe("20250101000000_init");
    expect(prisma.getSchemaVersion).toHaveBeenCalled();
  });
});
