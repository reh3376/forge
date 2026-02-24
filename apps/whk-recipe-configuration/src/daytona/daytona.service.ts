import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Daytona } from "@daytonaio/sdk";
import { CreateSandboxDto, ExecuteCommandDto } from "./dto";
import { Sandbox, SandboxStatus, CommandResult } from "./entities";

/**
 * Service for managing Daytona sandbox environments
 * Provides secure, isolated code execution for AI-assisted development
 */
@Injectable()
export class DaytonaService {
  private readonly logger = new Logger(DaytonaService.name);
  private daytonaClient: Daytona | null = null;
  private sandboxRegistry: Map<string, any> = new Map(); // In-memory registry
  private readonly isEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>("DAYTONA_API_KEY");
    const apiUrl = this.configService.get<string>("DAYTONA_API_URL");

    this.isEnabled = !!apiKey;

    if (this.isEnabled) {
      try {
        this.daytonaClient = new Daytona({
          apiKey,
          apiUrl,
          target: this.configService.get<string>("DAYTONA_TARGET"),
        });
        this.logger.log("Daytona client initialized successfully");
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.stack : String(error);
        this.logger.error("Failed to initialize Daytona client", errorMessage);
        this.isEnabled = false;
      }
    } else {
      this.logger.warn(
        "Daytona SDK is disabled - DAYTONA_API_KEY not configured"
      );
    }
  }

  /**
   * Check if Daytona is enabled and configured
   */
  isServiceEnabled(): boolean {
    return this.isEnabled && this.daytonaClient !== null;
  }

  /**
   * Create a new sandbox environment
   */
  async createSandbox(dto: CreateSandboxDto, userId: string): Promise<Sandbox> {
    if (!this.isServiceEnabled()) {
      throw new BadRequestException("Daytona service is not enabled");
    }

    try {
      this.logger.log(
        `Creating sandbox for user ${userId} with language ${dto.language}`
      );

      // Parse environment variables
      let envVars: Record<string, string> = {};
      if (dto.envVars) {
        try {
          envVars = JSON.parse(dto.envVars);
        } catch (error) {
          throw new BadRequestException("Invalid environment variables JSON");
        }
      }

      // Create sandbox via Daytona SDK
      if (!this.daytonaClient) {
        throw new BadRequestException("Daytona client is not initialized");
      }

      const sandbox = await this.daytonaClient.create({
        language: dto.language,
        envVars,
      });

      // Store in registry
      this.sandboxRegistry.set(sandbox.id, {
        sandboxInstance: sandbox,
        metadata: {
          name: dto.name,
          createdBy: userId,
          createdAt: new Date(),
          language: dto.language,
        },
      });

      // Execute initial code if provided
      if (dto.initialCode) {
        try {
          await sandbox.process.executeCommand(dto.initialCode);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(`Initial code execution failed: ${errorMessage}`);
        }
      }

      // Return sandbox entity
      return {
        id: sandbox.id,
        language: dto.language,
        name: dto.name,
        status: SandboxStatus.ACTIVE,
        createdBy: userId,
        createdAt: new Date(),
        lastActivity: new Date(),
        envVars: dto.envVars,
      };
    } catch (error) {
      const errorStack = error instanceof Error ? error.stack : String(error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to create sandbox", errorStack);
      throw new BadRequestException(
        `Failed to create sandbox: ${errorMessage}`
      );
    }
  }

  /**
   * Execute a command in a sandbox
   */
  async executeCommand(
    dto: ExecuteCommandDto,
    userId: string
  ): Promise<CommandResult> {
    if (!this.isServiceEnabled()) {
      throw new BadRequestException("Daytona service is not enabled");
    }

    const sandboxData = this.sandboxRegistry.get(dto.sandboxId);
    if (!sandboxData) {
      throw new NotFoundException(`Sandbox ${dto.sandboxId} not found`);
    }

    // Verify ownership
    if (sandboxData.metadata.createdBy !== userId) {
      throw new BadRequestException(
        "You do not have permission to use this sandbox"
      );
    }

    try {
      this.logger.log(
        `Executing command in sandbox ${dto.sandboxId}: ${dto.command}`
      );

      const startTime = Date.now();
      const result = await sandboxData.sandboxInstance.process.executeCommand(
        dto.command
      );
      const duration = Date.now() - startTime;

      // Update last activity
      sandboxData.metadata.lastActivity = new Date();

      return {
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        exitCode: result.exitCode || 0,
        duration,
      };
    } catch (error) {
      const errorStack = error instanceof Error ? error.stack : String(error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Command execution failed in sandbox ${dto.sandboxId}`,
        errorStack
      );
      throw new BadRequestException(
        `Command execution failed: ${errorMessage}`
      );
    }
  }

  /**
   * List all sandboxes for a user
   */
  async listSandboxes(userId: string): Promise<Sandbox[]> {
    const userSandboxes: Sandbox[] = [];

    this.sandboxRegistry.forEach((data, id) => {
      if (data.metadata.createdBy === userId) {
        userSandboxes.push({
          id,
          language: data.metadata.language,
          name: data.metadata.name,
          status: SandboxStatus.ACTIVE,
          createdBy: userId,
          createdAt: data.metadata.createdAt,
          lastActivity: data.metadata.lastActivity,
        });
      }
    });

    return userSandboxes;
  }

  /**
   * Get a specific sandbox
   */
  async getSandbox(sandboxId: string, userId: string): Promise<Sandbox> {
    const sandboxData = this.sandboxRegistry.get(sandboxId);

    if (!sandboxData) {
      throw new NotFoundException(`Sandbox ${sandboxId} not found`);
    }

    if (sandboxData.metadata.createdBy !== userId) {
      throw new BadRequestException(
        "You do not have permission to access this sandbox"
      );
    }

    return {
      id: sandboxId,
      language: sandboxData.metadata.language,
      name: sandboxData.metadata.name,
      status: SandboxStatus.ACTIVE,
      createdBy: userId,
      createdAt: sandboxData.metadata.createdAt,
      lastActivity: sandboxData.metadata.lastActivity,
    };
  }

  /**
   * Delete a sandbox
   */
  async deleteSandbox(sandboxId: string, userId: string): Promise<boolean> {
    const sandboxData = this.sandboxRegistry.get(sandboxId);

    if (!sandboxData) {
      throw new NotFoundException(`Sandbox ${sandboxId} not found`);
    }

    if (sandboxData.metadata.createdBy !== userId) {
      throw new BadRequestException(
        "You do not have permission to delete this sandbox"
      );
    }

    try {
      // Attempt to stop/cleanup the sandbox
      // Note: Daytona SDK may or may not have a destroy method
      if (typeof sandboxData.sandboxInstance.destroy === "function") {
        await sandboxData.sandboxInstance.destroy();
      }

      this.sandboxRegistry.delete(sandboxId);
      this.logger.log(`Sandbox ${sandboxId} deleted successfully`);
      return true;
    } catch (error) {
      const errorStack = error instanceof Error ? error.stack : String(error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to delete sandbox ${sandboxId}`, errorStack);
      throw new BadRequestException(
        `Failed to delete sandbox: ${errorMessage}`
      );
    }
  }

  /**
   * Cleanup inactive sandboxes (called periodically)
   */
  async cleanupInactiveSandboxes(maxAgeMinutes: number = 60): Promise<number> {
    const now = Date.now();
    const maxAge = maxAgeMinutes * 60 * 1000;
    let cleaned = 0;
    const sandboxesToDelete: string[] = [];

    this.sandboxRegistry.forEach((data, id) => {
      const lastActivity =
        data.metadata.lastActivity || data.metadata.createdAt;
      const age = now - lastActivity.getTime();

      if (age > maxAge) {
        sandboxesToDelete.push(id);
      }
    });

    for (const id of sandboxesToDelete) {
      const data = this.sandboxRegistry.get(id);
      if (data) {
        try {
          if (typeof data.sandboxInstance.destroy === "function") {
            await data.sandboxInstance.destroy();
          }
          this.sandboxRegistry.delete(id);
          cleaned++;
          this.logger.log(`Cleaned up inactive sandbox ${id}`);
        } catch (error) {
          const errorStack =
            error instanceof Error ? error.stack : String(error);
          this.logger.error(`Failed to cleanup sandbox ${id}`, errorStack);
        }
      }
    }

    return cleaned;
  }
}
