import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { DefaultAuthGuard } from "../defaultAuth.guard";
import { JwtAuthGuard } from "../jwt/jwtAuth.guard";
import { IS_PUBLIC_KEY } from "../../decorators/public.decorator";

describe("DefaultAuthGuard", () => {
  let guard: DefaultAuthGuard;
  let reflector: jest.Mocked<Reflector>;
  let configService: jest.Mocked<ConfigService>;
  let mockContext: jest.Mocked<ExecutionContext>;
  let mockRequest: any;

  beforeEach(() => {
    reflector = {
      get: jest.fn(),
    } as any;

    configService = {
      get: jest.fn(),
    } as any;

    mockRequest = {
      headers: {},
    };

    mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
      }),
      getHandler: jest.fn(),
      getType: jest.fn().mockReturnValue("http"),
      getClass: jest.fn(),
      getArgs: jest.fn(),
      getArgByIndex: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
    } as any;

    guard = new DefaultAuthGuard(reflector, configService);

    // Mock the parent canActivate method
    jest.spyOn(JwtAuthGuard.prototype, "canActivate").mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Public routes", () => {
    it("should allow access to public routes regardless of environment", () => {
      reflector.get.mockReturnValue(true); // isPublic = true
      configService.get.mockReturnValue("production");

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(reflector.get).toHaveBeenCalledWith(
        IS_PUBLIC_KEY,
        mockContext.getHandler()
      );
    });
  });

  describe("Development mode", () => {
    beforeEach(() => {
      reflector.get.mockReturnValue(false); // isPublic = false
      configService.get.mockReturnValue("development");
    });

    it("should allow access when no Authorization header is present", () => {
      mockRequest.headers = {}; // No authorization header

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(configService.get).toHaveBeenCalledWith("NODE_ENV");
    });

    it("should validate JWT when Authorization header is present", () => {
      mockRequest.headers = {
        authorization: "Bearer some-token",
      };

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true); // Mocked to return true
      expect(JwtAuthGuard.prototype.canActivate).toHaveBeenCalledWith(
        mockContext
      );
    });
  });

  describe("Production mode", () => {
    beforeEach(() => {
      reflector.get.mockReturnValue(false); // isPublic = false
      configService.get.mockReturnValue("production");
    });

    it("should always require JWT validation", () => {
      mockRequest.headers = {}; // No authorization header

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true); // Mocked to return true
      expect(JwtAuthGuard.prototype.canActivate).toHaveBeenCalledWith(
        mockContext
      );
    });

    it("should validate JWT when Authorization header is present", () => {
      mockRequest.headers = {
        authorization: "Bearer some-token",
      };

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true); // Mocked to return true
      expect(JwtAuthGuard.prototype.canActivate).toHaveBeenCalledWith(
        mockContext
      );
    });
  });

  describe("Other environments", () => {
    it("should require JWT validation for staging environment", () => {
      reflector.get.mockReturnValue(false); // isPublic = false
      configService.get.mockReturnValue("staging");
      mockRequest.headers = {}; // No authorization header

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true); // Mocked to return true
      expect(JwtAuthGuard.prototype.canActivate).toHaveBeenCalledWith(
        mockContext
      );
    });
  });
});
