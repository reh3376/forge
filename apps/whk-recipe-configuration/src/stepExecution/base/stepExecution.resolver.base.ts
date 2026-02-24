import * as graphql from "@nestjs/graphql";
import {
  UseRoles,
  InjectRolesBuilder,
  RolesBuilder,
} from "nest-access-control";
import * as gqlACGuard from "../../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { AclFilterResponseInterceptor } from "../../interceptors/aclFilterResponse.interceptor";
import { StepExecution } from "./StepExecution";
import { Batch } from "../../batch/base/Batch";
import { Asset } from "../../asset/base/Asset";
import { StepExecutionService } from "../stepExecution.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => StepExecution)
export class StepExecutionResolverBase {
  constructor(
    protected readonly service: StepExecutionService,
    @InjectRolesBuilder() protected readonly rolesBuilder: RolesBuilder
  ) {}

  @common.UseInterceptors(AclFilterResponseInterceptor)
  @graphql.Query(() => StepExecution, { nullable: true })
  @UseRoles({
    resource: "StepExecution",
    action: "read",
    possession: "own",
  })
  async stepExecution(
    @graphql.Args("id") id: string
  ): Promise<StepExecution | null> {
    return this.service.getStepExecution(id);
  }

  @common.UseInterceptors(AclFilterResponseInterceptor)
  @graphql.ResolveField(() => Batch, {
    nullable: true,
    name: "batch",
  })
  @UseRoles({
    resource: "Batch",
    action: "read",
    possession: "any",
  })
  async getBatch(@graphql.Parent() parent: StepExecution): Promise<any | null> {
    return this.service.getBatch(parent.id);
  }

  @common.UseInterceptors(AclFilterResponseInterceptor)
  @graphql.ResolveField(() => Asset, {
    nullable: true,
    name: "allocatedAsset",
  })
  @UseRoles({
    resource: "Asset",
    action: "read",
    possession: "any",
  })
  async getAllocatedAsset(
    @graphql.Parent() parent: StepExecution
  ): Promise<any | null> {
    return this.service.getAllocatedAsset(parent.id);
  }
}
