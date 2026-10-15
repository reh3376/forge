import { Controller, Get, Res } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { Public } from "../decorators/public.decorator";

@ApiTags("openapi")
@Controller("openapi")
export class OpenApiController {
  @Get("spec")
  @Public()
  @ApiOperation({ summary: "Get OpenAPI specification" })
  @ApiResponse({
    status: 200,
    description: "OpenAPI specification in JSON format",
    content: {
      "application/json": {
        schema: {
          type: "object",
          description: "OpenAPI 3.0 specification document",
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: "OpenAPI specification not found" })
  getOpenApiSpec(@Res() res: Response) {
    try {
      // Path to the generated openapi.json file
      const openApiPath = path.join(process.cwd(), "openapi.json");

      // Check if file exists
      if (!fs.existsSync(openApiPath)) {
        return res.status(404).json({
          error: "OpenAPI specification not found",
          message: "The OpenAPI specification file has not been generated yet",
        });
      }

      // Read and parse the OpenAPI JSON file
      const openApiSpec = JSON.parse(fs.readFileSync(openApiPath, "utf8"));

      // Set appropriate headers
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "public, max-age=300"); // Cache for 5 minutes

      return res.json(openApiSpec);
    } catch (error) {
      return res.status(500).json({
        error: "Failed to read OpenAPI specification",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }

  @Get("spec.json")
  @Public()
  @ApiOperation({ summary: "Get OpenAPI specification (alternative endpoint)" })
  @ApiResponse({
    status: 200,
    description: "OpenAPI specification in JSON format",
    content: {
      "application/json": {
        schema: {
          type: "object",
          description: "OpenAPI 3.0 specification document",
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: "OpenAPI specification not found" })
  getOpenApiSpecJson(@Res() res: Response) {
    // Reuse the same logic as the main spec endpoint
    return this.getOpenApiSpec(res);
  }
}
