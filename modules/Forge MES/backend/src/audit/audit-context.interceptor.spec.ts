import { Test, TestingModule } from "@nestjs/testing";
import { ExecutionContext, CallHandler } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { AuditContextInterceptor } from "./audit-context.interceptor";
import { of } from "rxjs";

describe("AuditContextInterceptor", () => {
  let interceptor: AuditContextInterceptor;
  let clsService: ClsService;

  const mockClsService = {
    run: jest.fn((callback: () => void) => callback()),
    set: jest.fn(),
  };

  const mockCallHandler: CallHandler = {
    handle: jest.fn(() => of("test result")),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditContextInterceptor,
        {
          provide: ClsService,
          useValue: mockClsService,
        },
      ],
    }).compile();

    interceptor = module.get<AuditContextInterceptor>(AuditContextInterceptor);
    clsService = module.get<ClsService>(ClsService);

    // Reset all mocks
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(interceptor).toBeDefined();
  });

  describe("intercept", () => {
    it("should extract and set audit context from HTTP request", async () => {
      const mockRequest = {
        user: { id: "user-123" },
        headers: {
          "user-agent": "Mozilla/5.0",
          "x-forwarded-for": "10.0.0.1",
        },
        connection: { remoteAddress: "192.168.1.1" },
      };

      const mockExecutionContext = {
        switchToHttp: jest.fn(() => ({
          getRequest: jest.fn(() => mockRequest),
        })),
        getType: jest.fn(() => "http"),
      } as unknown as ExecutionContext;

      const result = await interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .toPromise();

      expect(mockClsService.set).toHaveBeenCalledWith("userId", "user-123");
      expect(mockClsService.set).toHaveBeenCalledWith("ipAddress", "10.0.0.1");
      expect(mockClsService.set).toHaveBeenCalledWith(
        "userAgent",
        "Mozilla/5.0"
      );

      expect(mockCallHandler.handle).toHaveBeenCalled();
      expect(result).toBe("test result");
    });

    it("should handle missing user information", async () => {
      const mockRequest = {
        headers: {
          "user-agent": "Mozilla/5.0",
        },
        connection: { remoteAddress: "192.168.1.1" },
      };

      const mockExecutionContext = {
        switchToHttp: jest.fn(() => ({
          getRequest: jest.fn(() => mockRequest),
        })),
        getType: jest.fn(() => "http"),
      } as unknown as ExecutionContext;

      await interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .toPromise();

      expect(mockClsService.set).not.toHaveBeenCalledWith("userId", expect.anything());
      expect(mockClsService.set).toHaveBeenCalledWith(
        "ipAddress",
        "192.168.1.1"
      );
      expect(mockClsService.set).toHaveBeenCalledWith(
        "userAgent",
        "Mozilla/5.0"
      );
    });

    it("should prefer x-forwarded-for header for IP address", async () => {
      const mockRequest = {
        user: { id: "user-123" },
        headers: {
          "user-agent": "Mozilla/5.0",
          "x-forwarded-for": "10.0.0.1, 192.168.1.1",
        },
        connection: { remoteAddress: "192.168.1.1" },
      };

      const mockExecutionContext = {
        switchToHttp: jest.fn(() => ({
          getRequest: jest.fn(() => mockRequest),
        })),
        getType: jest.fn(() => "http"),
      } as unknown as ExecutionContext;

      await interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .toPromise();

      expect(mockClsService.set).toHaveBeenCalledWith("ipAddress", "10.0.0.1");
    });

    it("should handle non-HTTP contexts gracefully", async () => {
      const mockExecutionContext = {
        getType: jest.fn(() => "rpc"),
        switchToHttp: jest.fn(() => ({
          getRequest: jest.fn(() => ({})),
        })),
      } as unknown as ExecutionContext;

      await interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .toPromise();

      expect(mockCallHandler.handle).toHaveBeenCalled();
    });

    it("should handle missing headers gracefully", async () => {
      const mockRequest = {
        user: { id: "user-123" },
        headers: {},
        connection: { remoteAddress: "192.168.1.1" },
      };

      const mockExecutionContext = {
        switchToHttp: jest.fn(() => ({
          getRequest: jest.fn(() => mockRequest),
        })),
        getType: jest.fn(() => "http"),
      } as unknown as ExecutionContext;

      await interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .toPromise();

      expect(mockClsService.set).toHaveBeenCalledWith("userId", "user-123");
      expect(mockClsService.set).toHaveBeenCalledWith(
        "ipAddress",
        "192.168.1.1"
      );
      expect(mockClsService.set).not.toHaveBeenCalledWith("userAgent", expect.anything());
    });
  });
});
