import { Test, TestingModule } from "@nestjs/testing";
import { Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { OpenApiController } from "./openapi.controller";

// Mock fs module
jest.mock("fs");
const mockedFs = fs as jest.Mocked<typeof fs>;

describe("OpenApiController", () => {
  let controller: OpenApiController;
  let mockResponse: Partial<Response>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OpenApiController],
    }).compile();

    controller = module.get<OpenApiController>(OpenApiController);

    // Mock response object
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getOpenApiSpec", () => {
    it("should return OpenAPI spec when file exists", () => {
      const mockSpec = { openapi: "3.0.0", info: { title: "Test API" } };

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockSpec));

      controller.getOpenApiSpec(mockResponse as Response);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "application/json"
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "public, max-age=300"
      );
      expect(mockResponse.json).toHaveBeenCalledWith(mockSpec);
    });

    it("should return 404 when file does not exist", () => {
      mockedFs.existsSync.mockReturnValue(false);

      controller.getOpenApiSpec(mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "OpenAPI specification not found",
        message: "The OpenAPI specification file has not been generated yet",
      });
    });

    it("should return 500 when file read fails", () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockImplementation(() => {
        throw new Error("File read error");
      });

      controller.getOpenApiSpec(mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Failed to read OpenAPI specification",
        message: "File read error",
      });
    });

    it("should handle unknown errors", () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockImplementation(() => {
        throw "Unknown error";
      });

      controller.getOpenApiSpec(mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Failed to read OpenAPI specification",
        message: "Unknown error occurred",
      });
    });
  });

  describe("getOpenApiSpecJson", () => {
    it("should call getOpenApiSpec method", () => {
      const spy = jest.spyOn(controller, "getOpenApiSpec");

      controller.getOpenApiSpecJson(mockResponse as Response);

      expect(spy).toHaveBeenCalledWith(mockResponse);
    });
  });
});
