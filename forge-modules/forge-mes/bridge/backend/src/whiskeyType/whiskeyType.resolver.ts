import * as graphql from "@nestjs/graphql";
import * as common from "@nestjs/common";
import {
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { WhiskeyTypeService } from "./whiskeyType.service";
import { Prisma } from "@prisma/client";
import { WhiskeyType } from "./base/WhiskeyType";
import { WhiskeyTypeWhereInput } from "./base/WhiskeyTypeWhereInput";
import { WhiskeyTypeOrderByInput } from "./base/WhiskeyTypeOrderByInput";
import { WhiskeyTypeCreateInput } from "./base/WhiskeyTypeCreateInput";
import { WhiskeyTypeUpdateInput } from "./base/WhiskeyTypeUpdateInput";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => WhiskeyType)
export class WhiskeyTypeResolver {
  constructor(
    private readonly whiskeyTypeService: WhiskeyTypeService,
    @InjectRolesBuilder()
    private readonly rolesBuilder: RolesBuilder
  ) {}

  @graphql.Query(() => [WhiskeyType])
  @UseRoles({
    resource: "WhiskeyType",
    action: "read",
    possession: "any",
  })
  async whiskeyTypes(
    @graphql.Args({ name: "skip", type: () => graphql.Int, nullable: true })
    skip?: number,
    @graphql.Args({ name: "take", type: () => graphql.Int, nullable: true })
    take?: number,
    @graphql.Args({
      name: "where",
      type: () => WhiskeyTypeWhereInput,
      nullable: true,
    })
    where?: Prisma.WhiskeyTypeWhereInput,
    @graphql.Args({
      name: "orderBy",
      type: () => WhiskeyTypeOrderByInput,
      nullable: true,
    })
    orderBy?: Prisma.WhiskeyTypeOrderByWithRelationInput
  ) {
    return this.whiskeyTypeService.findMany({
      skip,
      take,
      where,
      orderBy,
    });
  }

  @graphql.Query(() => WhiskeyType, { nullable: true })
  @UseRoles({
    resource: "WhiskeyType",
    action: "read",
    possession: "any",
  })
  async whiskeyType(
    @graphql.Args({ name: "id", type: () => graphql.ID }) id: string
  ) {
    return this.whiskeyTypeService.findOne({ where: { id } });
  }

  @graphql.Query(() => WhiskeyType, { nullable: true })
  @UseRoles({
    resource: "WhiskeyType",
    action: "read",
    possession: "any",
  })
  async whiskeyTypeByCode(
    @graphql.Args({ name: "code", type: () => String }) code: string
  ) {
    return this.whiskeyTypeService.findByCode(code);
  }

  @graphql.Query(() => [WhiskeyType])
  @UseRoles({
    resource: "WhiskeyType",
    action: "read",
    possession: "any",
  })
  async activeWhiskeyTypes() {
    return this.whiskeyTypeService.getActiveWhiskeyTypes();
  }

  @graphql.Query(() => [WhiskeyType])
  @UseRoles({
    resource: "WhiskeyType",
    action: "read",
    possession: "any",
  })
  async ttbDefinitions() {
    return this.whiskeyTypeService.getTTBDefinitions();
  }

  @graphql.Query(() => [WhiskeyType])
  @UseRoles({
    resource: "WhiskeyType",
    action: "read",
    possession: "any",
  })
  async derivedWhiskeyTypes(
    @graphql.Args({ name: "ttbWhiskeyTypeId", type: () => String })
    ttbWhiskeyTypeId: string
  ) {
    return this.whiskeyTypeService.getDerivedTypes(ttbWhiskeyTypeId);
  }

  @graphql.Query(() => WhiskeyType, { nullable: true })
  @UseRoles({
    resource: "WhiskeyType",
    action: "read",
    possession: "any",
  })
  async whiskeyTypeWithRelations(
    @graphql.Args({ name: "id", type: () => graphql.ID }) id: string
  ) {
    return this.whiskeyTypeService.getWhiskeyTypeWithRelations(id);
  }

  @graphql.Mutation(() => WhiskeyType)
  @UseRoles({
    resource: "WhiskeyType",
    action: "create",
    possession: "any",
  })
  async createWhiskeyType(
    @graphql.Args({ name: "data", type: () => WhiskeyTypeCreateInput })
    data: Prisma.WhiskeyTypeCreateInput
  ) {
    return this.whiskeyTypeService.create({ data });
  }

  @graphql.Mutation(() => WhiskeyType)
  @UseRoles({
    resource: "WhiskeyType",
    action: "update",
    possession: "any",
  })
  async updateWhiskeyType(
    @graphql.Args({ name: "id", type: () => graphql.ID }) id: string,
    @graphql.Args({ name: "data", type: () => WhiskeyTypeUpdateInput })
    data: Prisma.WhiskeyTypeUpdateInput
  ) {
    return this.whiskeyTypeService.update({ where: { id }, data });
  }

  @graphql.Mutation(() => WhiskeyType)
  @UseRoles({
    resource: "WhiskeyType",
    action: "delete",
    possession: "any",
  })
  async deleteWhiskeyType(
    @graphql.Args({ name: "id", type: () => graphql.ID }) id: string
  ) {
    return this.whiskeyTypeService.delete({ where: { id } });
  }

  @graphql.Query(() => graphql.Int)
  @UseRoles({
    resource: "WhiskeyType",
    action: "read",
    possession: "any",
  })
  async whiskeyTypesCount(
    @graphql.Args({
      name: "where",
      type: () => WhiskeyTypeWhereInput,
      nullable: true,
    })
    where?: Prisma.WhiskeyTypeWhereInput
  ) {
    return this.whiskeyTypeService.count({ where });
  }
}
