import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { DefaultAuthGuard } from "../auth/defaultAuth.guard";
import { WhiskeyTypeService } from "./whiskeyType.service";
import { WhiskeyType, Prisma } from "@prisma/client";
import { CreateWhiskeyTypeDto } from "./dto/create-whiskey-type.dto";
import { UpdateWhiskeyTypeDto } from "./dto/update-whiskey-type.dto";

@swagger.ApiTags("whiskey-types")
@swagger.ApiBearerAuth()
@common.UseGuards(DefaultAuthGuard, ACGuard)
@common.Controller("api/whiskey-types")
export class WhiskeyTypeController {
  constructor(
    private readonly whiskeyTypeService: WhiskeyTypeService,
    @InjectRolesBuilder()
    private readonly rolesBuilder: RolesBuilder
  ) {}

  @common.Get()
  @swagger.ApiOperation({ summary: "Get all whiskey types" })
  @swagger.ApiResponse({
    status: 200,
    description: "Returns all whiskey types",
  })
  @UseRoles({
    resource: "WhiskeyType",
    action: "read",
    possession: "any",
  })
  async findMany(
    @common.Query("skip") skip?: string,
    @common.Query("take") take?: string,
    @common.Query("active") active?: string
  ): Promise<WhiskeyType[]> {
    const args: Prisma.WhiskeyTypeFindManyArgs = {
      where: active !== undefined ? { active: active === "true" } : undefined,
      orderBy: { name: "asc" },
    };

    // Parse and validate skip - only set if it's a valid non-negative integer
    if (skip !== undefined) {
      const parsedSkip = Number.parseInt(skip, 10);
      if (Number.isFinite(parsedSkip) && parsedSkip >= 0) {
        args.skip = parsedSkip;
      }
    }

    // Parse and validate take - only set if it's a valid non-negative integer
    if (take !== undefined) {
      const parsedTake = Number.parseInt(take, 10);
      if (Number.isFinite(parsedTake) && parsedTake >= 0) {
        args.take = parsedTake;
      }
    }

    return this.whiskeyTypeService.findMany(args);
  }

  @common.Get("ttb/definitions")
  @swagger.ApiOperation({ summary: "Get all TTB definition whiskey types" })
  @swagger.ApiResponse({ status: 200, description: "Returns TTB definitions" })
  @UseRoles({
    resource: "WhiskeyType",
    action: "read",
    possession: "any",
  })
  async getTTBDefinitions(): Promise<WhiskeyType[]> {
    return this.whiskeyTypeService.getTTBDefinitions();
  }

  @common.Get("ttb/:ttbWhiskeyTypeId/derived")
  @swagger.ApiOperation({
    summary: "Get derived whiskey types for a TTB definition",
  })
  @swagger.ApiResponse({ status: 200, description: "Returns derived types" })
  @UseRoles({
    resource: "WhiskeyType",
    action: "read",
    possession: "any",
  })
  async getDerivedTypes(
    @common.Param("ttbWhiskeyTypeId") ttbWhiskeyTypeId: string
  ): Promise<WhiskeyType[]> {
    return this.whiskeyTypeService.getDerivedTypes(ttbWhiskeyTypeId);
  }

  @common.Get(":id/relations")
  @swagger.ApiOperation({
    summary: "Get whiskey type with parent and child relationships",
  })
  @swagger.ApiResponse({
    status: 200,
    description: "Returns whiskey type with relations",
  })
  @UseRoles({
    resource: "WhiskeyType",
    action: "read",
    possession: "any",
  })
  async getWithRelations(@common.Param("id") id: string) {
    return this.whiskeyTypeService.getWhiskeyTypeWithRelations(id);
  }

  @common.Get("code/:code")
  @swagger.ApiOperation({ summary: "Get a whiskey type by code" })
  @swagger.ApiResponse({ status: 200, description: "Returns the whiskey type" })
  @swagger.ApiResponse({ status: 404, description: "Whiskey type not found" })
  @UseRoles({
    resource: "WhiskeyType",
    action: "read",
    possession: "any",
  })
  async findByCode(@common.Param("code") code: string): Promise<WhiskeyType> {
    const whiskeyType = await this.whiskeyTypeService.findByCode(code);
    if (!whiskeyType) {
      throw new common.NotFoundException(
        `Whiskey type with code '${code}' not found`
      );
    }
    return whiskeyType;
  }

  @common.Get(":id")
  @swagger.ApiOperation({ summary: "Get a whiskey type by ID" })
  @swagger.ApiResponse({ status: 200, description: "Returns the whiskey type" })
  @swagger.ApiResponse({ status: 404, description: "Whiskey type not found" })
  @UseRoles({
    resource: "WhiskeyType",
    action: "read",
    possession: "any",
  })
  async findOne(@common.Param("id") id: string): Promise<WhiskeyType | null> {
    const whiskeyType = await this.whiskeyTypeService.findOne({
      where: { id },
    });
    if (!whiskeyType) {
      throw new common.NotFoundException(
        `Whiskey type with id ${id} not found`
      );
    }
    return whiskeyType;
  }

  @common.Post()
  @swagger.ApiOperation({ summary: "Create a new whiskey type" })
  @swagger.ApiResponse({
    status: 201,
    description: "Whiskey type created successfully",
  })
  @swagger.ApiCreatedResponse({ type: CreateWhiskeyTypeDto })
  @UseRoles({
    resource: "WhiskeyType",
    action: "create",
    possession: "any",
  })
  async create(@common.Body() dto: CreateWhiskeyTypeDto): Promise<WhiskeyType> {
    const data: Prisma.WhiskeyTypeCreateInput = {
      code: dto.code,
      name: dto.name,
      description: dto.description,
      category: dto.category,
      active: dto.active ?? true,
      isTTBDefinition: dto.isTTBDefinition ?? false,
      ...(dto.ttbWhiskeyTypeId && {
        ttbWhiskeyType: {
          connect: { id: dto.ttbWhiskeyTypeId },
        },
      }),
    };

    return this.whiskeyTypeService.create({ data });
  }

  @common.Put(":id")
  @swagger.ApiOperation({ summary: "Update a whiskey type" })
  @swagger.ApiResponse({
    status: 200,
    description: "Whiskey type updated successfully",
  })
  @swagger.ApiResponse({ status: 404, description: "Whiskey type not found" })
  @UseRoles({
    resource: "WhiskeyType",
    action: "update",
    possession: "any",
  })
  async update(
    @common.Param("id") id: string,
    @common.Body() dto: UpdateWhiskeyTypeDto
  ): Promise<WhiskeyType> {
    const data: Prisma.WhiskeyTypeUpdateInput = {};

    if (dto.code !== undefined) data.code = dto.code;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.isTTBDefinition !== undefined)
      data.isTTBDefinition = dto.isTTBDefinition;
    if (dto.ttbWhiskeyTypeId !== undefined) {
      data.ttbWhiskeyType = dto.ttbWhiskeyTypeId
        ? { connect: { id: dto.ttbWhiskeyTypeId } }
        : { disconnect: true };
    }

    return this.whiskeyTypeService.update({ where: { id }, data });
  }

  @common.Delete(":id")
  @swagger.ApiOperation({ summary: "Delete a whiskey type" })
  @swagger.ApiResponse({
    status: 200,
    description: "Whiskey type deleted successfully",
  })
  @swagger.ApiResponse({ status: 404, description: "Whiskey type not found" })
  @UseRoles({
    resource: "WhiskeyType",
    action: "delete",
    possession: "any",
  })
  async delete(@common.Param("id") id: string): Promise<WhiskeyType> {
    return this.whiskeyTypeService.delete({ where: { id } });
  }
}
