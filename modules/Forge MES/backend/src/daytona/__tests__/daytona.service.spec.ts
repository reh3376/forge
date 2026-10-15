import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DaytonaService } from "../daytona.service";
import { CreateSandboxDto, SandboxLanguage } from "../dto";

describe("DaytonaService", () => {
  let service: DaytonaService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        DAYTONA_API_KEY: "test-api-key",
        DAYTONA_API_URL: "https://api.daytona.test",
        DAYTONA_TARGET: "test",
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DaytonaService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<DaytonaService>(DaytonaService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("isServiceEnabled", () => {
    it("should return true when API key is configured", () => {
      expect(service.isServiceEnabled()).toBe(true);
    });

    it("should return false when API key is not configured", async () => {
      const mockConfigWithoutKey = {
        get: jest.fn(() => undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DaytonaService,
          {
            provide: ConfigService,
            useValue: mockConfigWithoutKey,
          },
        ],
      }).compile();

      const serviceWithoutKey = module.get<DaytonaService>(DaytonaService);
      expect(serviceWithoutKey.isServiceEnabled()).toBe(false);
    });
  });

  describe("createSandbox", () => {
    const mockCreateDto: CreateSandboxDto = {
      language: SandboxLanguage.TYPESCRIPT,
      name: "Test Sandbox",
      initialCode: 'console.log("test");',
    };

    it("should throw BadRequestException when service is not enabled", async () => {
      jest.spyOn(service, "isServiceEnabled").mockReturnValue(false);

      await expect(
        service.createSandbox(mockCreateDto, "user-123")
      ).rejects.toThrow(BadRequestException);
    });

    // Note: Additional tests would require mocking the Daytona SDK client
    // which is complex due to the external dependency. In production,
    // consider using dependency injection for better testability.
  });

  describe("listSandboxes", () => {
    it("should return empty array when no sandboxes exist", async () => {
      const result = await service.listSandboxes("user-123");
      expect(result).toEqual([]);
    });
  });

  describe("getSandbox", () => {
    it("should throw NotFoundException when sandbox does not exist", async () => {
      await expect(
        service.getSandbox("non-existent-id", "user-123")
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("deleteSandbox", () => {
    it("should throw NotFoundException when sandbox does not exist", async () => {
      await expect(
        service.deleteSandbox("non-existent-id", "user-123")
      ).rejects.toThrow(NotFoundException);
    });
  });
});
