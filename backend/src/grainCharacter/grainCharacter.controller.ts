import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { GrainCharacterService } from "./grainCharacter.service";
import { GrainCharacter } from "@prisma/client";

@Controller("grain-characters")
export class GrainCharacterController {
  constructor(private readonly service: GrainCharacterService) {}

  @Get()
  async findAll(@Query("active") active?: string): Promise<GrainCharacter[]> {
    const where: any = {};

    if (active !== undefined) {
      where.active = active === "true";
    }

    return this.service.findAll({ where });
  }

  @Get("active")
  async findAllActive(): Promise<GrainCharacter[]> {
    return this.service.findAllActive();
  }

  @Get("abbreviations")
  async getAbbreviations(): Promise<string[]> {
    return this.service.getAbbreviations();
  }

  @Get("by-abbreviation/:abbreviation")
  async findByAbbreviation(
    @Param("abbreviation") abbreviation: string,
    @Query("varietyCode") varietyCode?: string
  ): Promise<GrainCharacter | null> {
    return this.service.findByAbbreviation(abbreviation, varietyCode);
  }

  @Get(":id")
  async findOne(@Param("id") id: string): Promise<GrainCharacter | null> {
    return this.service.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body()
    data: {
      abbreviation: string;
      name: string;
      varietyCode?: string;
      description?: string;
      active?: boolean;
    }
  ): Promise<GrainCharacter> {
    return this.service.create(data);
  }

  @Put(":id")
  async update(
    @Param("id") id: string,
    @Body()
    data: {
      abbreviation?: string;
      name?: string;
      varietyCode?: string;
      description?: string;
      active?: boolean;
    }
  ): Promise<GrainCharacter> {
    return this.service.update(id, data);
  }

  @Put(":id/active")
  async setActive(
    @Param("id") id: string,
    @Body() body: { active: boolean }
  ): Promise<GrainCharacter> {
    return this.service.setActive(id, body.active);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param("id") id: string): Promise<void> {
    await this.service.delete(id);
  }
}
