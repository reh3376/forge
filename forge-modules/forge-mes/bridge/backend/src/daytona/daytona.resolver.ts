import { Resolver, Query, Mutation, Args } from "@nestjs/graphql";
import { UseGuards, UseInterceptors } from "@nestjs/common";
import { DaytonaService } from "./daytona.service";
import { CreateSandboxDto, ExecuteCommandDto } from "./dto";
import { Sandbox, CommandResult } from "./entities";
import { UserData } from "../auth/userData.decorator";
import { AuditContextInterceptor } from "../audit/audit-context.interceptor";

// You'll need to import your auth guards - adjust paths as needed
// import { GqlDefaultAuthGuard } from '../auth/gqlDefaultAuth.guard';
// import { GqlACGuard } from '../auth/gqlAC.guard';

/**
 * GraphQL resolver for Daytona sandbox operations
 * Provides AI-assisted code generation and testing capabilities
 */
@Resolver(() => Sandbox)
@UseInterceptors(AuditContextInterceptor)
// @UseGuards(GqlDefaultAuthGuard, GqlACGuard) // Uncomment when ready to enable auth
export class DaytonaResolver {
  constructor(private readonly daytonaService: DaytonaService) {}

  /**
   * Check if Daytona service is enabled
   */
  @Query(() => Boolean, {
    description: "Check if Daytona sandbox service is enabled and configured",
  })
  async daytonaEnabled(): Promise<boolean> {
    return this.daytonaService.isServiceEnabled();
  }

  /**
   * Create a new sandbox environment
   */
  @Mutation(() => Sandbox, {
    description: "Create a new isolated sandbox environment for code execution",
  })
  async createSandbox(
    @Args("data") data: CreateSandboxDto,
    @UserData() user: any
  ): Promise<Sandbox> {
    const userId = user?.id || "anonymous";
    return this.daytonaService.createSandbox(data, userId);
  }

  /**
   * Execute a command in a sandbox
   */
  @Mutation(() => CommandResult, {
    description: "Execute a command in an existing sandbox",
  })
  async executeCommand(
    @Args("data") data: ExecuteCommandDto,
    @UserData() user: any
  ): Promise<CommandResult> {
    const userId = user?.id || "anonymous";
    return this.daytonaService.executeCommand(data, userId);
  }

  /**
   * List all sandboxes for the current user
   */
  @Query(() => [Sandbox], {
    description: "List all sandboxes created by the current user",
  })
  async mySandboxes(@UserData() user: any): Promise<Sandbox[]> {
    const userId = user?.id || "anonymous";
    return this.daytonaService.listSandboxes(userId);
  }

  /**
   * Get a specific sandbox by ID
   */
  @Query(() => Sandbox, {
    description: "Get details of a specific sandbox",
  })
  async sandbox(
    @Args("id") id: string,
    @UserData() user: any
  ): Promise<Sandbox> {
    const userId = user?.id || "anonymous";
    return this.daytonaService.getSandbox(id, userId);
  }

  /**
   * Delete a sandbox
   */
  @Mutation(() => Boolean, {
    description: "Delete a sandbox and cleanup resources",
  })
  async deleteSandbox(
    @Args("id") id: string,
    @UserData() user: any
  ): Promise<boolean> {
    const userId = user?.id || "anonymous";
    return this.daytonaService.deleteSandbox(id, userId);
  }
}
