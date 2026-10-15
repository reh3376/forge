import { Test, TestingModule } from "@nestjs/testing";
import { SchemaVersionPlugin } from "./schemaVersionPlugin";
import { SchemaVersionService } from "../schemaVersion/schemaVersion.service";

describe("SchemaVersionPlugin", () => {
  let plugin: SchemaVersionPlugin;
  let schemaVersionService: jest.Mocked<SchemaVersionService>;

  beforeEach(async () => {
    const mockSchemaVersionService = {
      getVersion: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchemaVersionPlugin,
        {
          provide: SchemaVersionService,
          useValue: mockSchemaVersionService,
        },
      ],
    }).compile();

    plugin = module.get<SchemaVersionPlugin>(SchemaVersionPlugin);
    schemaVersionService = module.get(SchemaVersionService);
  });

  it("should be defined", () => {
    expect(plugin).toBeDefined();
  });

  describe("requestDidStart", () => {
    it("should return a GraphQLRequestListener", async () => {
      const listener = await plugin.requestDidStart();
      expect(listener).toBeDefined();
      expect(typeof listener.willSendResponse).toBe("function");
    });

    describe("willSendResponse", () => {
      it("should set X-Schema-Version header when version is available", async () => {
        const mockVersion = "20241206153420_fix_lot_status_enum";
        const mockHeaders = new Map();
        const mockRequestContext = {
          response: {
            http: {
              headers: {
                set: jest.fn((key: string, value: string) => {
                  mockHeaders.set(key, value);
                }),
              },
            },
          },
        };

        schemaVersionService.getVersion.mockResolvedValue(mockVersion);

        const listener = await plugin.requestDidStart();
        await listener.willSendResponse!(mockRequestContext as any);

        expect(schemaVersionService.getVersion).toHaveBeenCalled();
        expect(
          mockRequestContext.response.http.headers.set
        ).toHaveBeenCalledWith("X-Schema-Version", mockVersion);
      });

      it("should not set header when version is null", async () => {
        const mockRequestContext = {
          response: {
            http: {
              headers: {
                set: jest.fn(),
              },
            },
          },
        };

        schemaVersionService.getVersion.mockResolvedValue(null);

        const listener = await plugin.requestDidStart();
        await listener.willSendResponse!(mockRequestContext as any);

        expect(schemaVersionService.getVersion).toHaveBeenCalled();
        expect(
          mockRequestContext.response.http.headers.set
        ).not.toHaveBeenCalled();
      });

      it("should not set header when response.http is undefined", async () => {
        const mockVersion = "20241206153420_fix_lot_status_enum";
        const mockRequestContext = {
          response: {
            http: undefined,
          },
        };

        schemaVersionService.getVersion.mockResolvedValue(mockVersion);

        const listener = await plugin.requestDidStart();
        await listener.willSendResponse!(mockRequestContext as any);

        expect(schemaVersionService.getVersion).toHaveBeenCalled();
        // Should not throw error
      });

      it("should handle errors gracefully and not throw", async () => {
        const mockRequestContext = {
          response: {
            http: {
              headers: {
                set: jest.fn(),
              },
            },
          },
        };

        schemaVersionService.getVersion.mockRejectedValue(
          new Error("Database connection failed")
        );

        // Mock console.warn to verify it's called
        const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

        const listener = await plugin.requestDidStart();

        // Should not throw
        await expect(
          listener.willSendResponse!(mockRequestContext as any)
        ).resolves.not.toThrow();

        expect(schemaVersionService.getVersion).toHaveBeenCalled();
        expect(
          mockRequestContext.response.http.headers.set
        ).not.toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(
          "Failed to set X-Schema-Version header:",
          expect.any(Error)
        );

        consoleSpy.mockRestore();
      });

      it("should work with different schema version formats", async () => {
        const testVersions = [
          "20241206153420_fix_lot_status_enum",
          "001_initial_migration",
          "v1.0.0",
          "latest",
        ];

        for (const version of testVersions) {
          const mockRequestContext = {
            response: {
              http: {
                headers: {
                  set: jest.fn(),
                },
              },
            },
          };

          schemaVersionService.getVersion.mockResolvedValue(version);

          const listener = await plugin.requestDidStart();
          await listener.willSendResponse!(mockRequestContext as any);

          expect(
            mockRequestContext.response.http.headers.set
          ).toHaveBeenCalledWith("X-Schema-Version", version);
        }
      });
    });
  });
});
