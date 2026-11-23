import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { GrainCharacterModule } from "../grainCharacter.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { PrismaService } from "../../prisma/prisma.service";

describe("GrainCharacterController (e2e)", () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let createdId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [GrainCharacterModule, PrismaModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prismaService = moduleFixture.get<PrismaService>(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    // Clean up test data
    if (createdId) {
      try {
        await prismaService.grainCharacter.delete({
          where: { id: createdId },
        });
      } catch {
        // Ignore if already deleted
      }
    }
    await app.close();
  });

  describe("/grain-characters (GET)", () => {
    it("should return all grain characters", async () => {
      const response = await request(app.getHttpServer())
        .get("/grain-characters")
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it("should filter by active status", async () => {
      const response = await request(app.getHttpServer())
        .get("/grain-characters?active=true")
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach((char: any) => {
        expect(char.active).toBe(true);
      });
    });

  });

  describe("/grain-characters/active (GET)", () => {
    it("should return only active grain characters", async () => {
      const response = await request(app.getHttpServer())
        .get("/grain-characters/active")
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach((char: any) => {
        expect(char.active).toBe(true);
      });
    });
  });

  describe("/grain-characters/abbreviations (GET)", () => {
    it("should return available abbreviations", async () => {
      const response = await request(app.getHttpServer())
        .get("/grain-characters/abbreviations")
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });
  });

  describe("/grain-characters (POST)", () => {
    it("should create a new grain character", async () => {
      const newChar = {
        abbreviation: "T",
        name: "Test Grain",
        description: "A test grain for e2e testing",
        active: true,
      };

      const response = await request(app.getHttpServer())
        .post("/grain-characters")
        .send(newChar)
        .expect(201);

      expect(response.body.abbreviation).toBe("T");
      expect(response.body.name).toBe("Test Grain");
      expect(response.body.id).toBeDefined();

      createdId = response.body.id;
    });

    it("should create grain character with variety code", async () => {
      const newChar = {
        abbreviation: "T",
        name: "Test Grain Variety",
        varietyCode: "99",
        description: "A test grain variety for e2e testing",
        active: true,
      };

      const response = await request(app.getHttpServer())
        .post("/grain-characters")
        .send(newChar)
        .expect(201);

      expect(response.body.varietyCode).toBe("99");

      // Clean up
      await prismaService.grainCharacter.delete({
        where: { id: response.body.id },
      });
    });
  });

  describe("/grain-characters/:id (GET)", () => {
    it("should return a grain character by id", async () => {
      // Get an existing grain character first
      const chars = await prismaService.grainCharacter.findMany({ take: 1 });
      if (chars.length === 0) {
        return; // Skip if no data
      }

      const response = await request(app.getHttpServer())
        .get(`/grain-characters/${chars[0].id}`)
        .expect(200);

      expect(response.body.id).toBe(chars[0].id);
    });

    it("should return empty object for non-existent id", async () => {
      const response = await request(app.getHttpServer())
        .get("/grain-characters/non-existent-id")
        .expect(200);

      // findUnique returns null, but JSON serialization may convert to empty object
      expect(
        response.body === null || Object.keys(response.body).length === 0
      ).toBe(true);
    });
  });

  describe("/grain-characters/by-abbreviation/:abbreviation (GET)", () => {
    it("should find by abbreviation", async () => {
      const response = await request(app.getHttpServer())
        .get("/grain-characters/by-abbreviation/C")
        .expect(200);

      if (response.body) {
        expect(response.body.abbreviation).toBe("C");
      }
    });

    it("should find by abbreviation with variety code", async () => {
      const response = await request(app.getHttpServer())
        .get("/grain-characters/by-abbreviation/R?varietyCode=1")
        .expect(200);

      if (response.body && response.body.id) {
        expect(response.body.abbreviation).toBe("R");
        expect(response.body.varietyCode).toBe("1");
      }
    });
  });

  describe("/grain-characters/:id (PUT)", () => {
    it("should update a grain character", async () => {
      if (!createdId) {
        return; // Skip if not created
      }

      const response = await request(app.getHttpServer())
        .put(`/grain-characters/${createdId}`)
        .send({ name: "Updated Test Grain" })
        .expect(200);

      expect(response.body.name).toBe("Updated Test Grain");
    });
  });

  describe("/grain-characters/:id/active (PUT)", () => {
    it("should set active status", async () => {
      if (!createdId) {
        return; // Skip if not created
      }

      const response = await request(app.getHttpServer())
        .put(`/grain-characters/${createdId}/active`)
        .send({ active: false })
        .expect(200);

      expect(response.body.active).toBe(false);

      // Restore active status
      await request(app.getHttpServer())
        .put(`/grain-characters/${createdId}/active`)
        .send({ active: true });
    });
  });

  describe("/grain-characters/:id (DELETE)", () => {
    it("should delete a grain character", async () => {
      if (!createdId) {
        return; // Skip if not created
      }

      await request(app.getHttpServer())
        .delete(`/grain-characters/${createdId}`)
        .expect(204);

      // Verify deletion
      const deleted = await prismaService.grainCharacter.findUnique({
        where: { id: createdId },
      });
      expect(deleted).toBeNull();

      createdId = ""; // Clear to prevent afterAll cleanup error
    });
  });
});
