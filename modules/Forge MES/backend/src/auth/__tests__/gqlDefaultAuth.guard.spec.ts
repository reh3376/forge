import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { GqlDefaultAuthGuard } from "../gqlDefaultAuth.guard";
import { JwtAuthGuard } from "../jwt/jwtAuth.guard";
import { IS_PUBLIC_KEY } from "../../decorators/public.decorator";

describe("GqlDefaultAuthGuard", () => {
  let guard: GqlDefaultAuthGuard;
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
      getHandler: jest.fn(),
    } as any;

    guard = new GqlDefaultAuthGuard(reflector, configService);

    // Mock the getRequest method
    jest.spyOn(guard, "getRequest").mockReturnValue(mockRequest);

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
