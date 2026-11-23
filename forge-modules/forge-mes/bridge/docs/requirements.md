# WhiskeyType Entity - Backend Implementation Guide

## Overview

This document details the complete backend implementation for converting `WhiskeyType` from a simple enum to a full-featured entity in the WMS system. This change enables better management, extensibility, and integration with the rest of the system through:

- Separate database table for whiskey types
- Full CRUD operations via REST API and GraphQL
- RabbitMQ message broker integration
- Proper validation and data migration from existing enum values
- Seeding routines for initial and ongoing data management

## 1. Prisma Schema Changes

### WhiskeyType Model

```prisma
model WhiskeyType {
  id          String   @id @default(cuid())
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  code        String   @unique
  name        String
  description String?
  category    String?
  active      Boolean  @default(true)
  globalId    String?  @unique @default(cuid())
  lots        Lot[]
}
```

### Lot Model Relation

```prisma
model Lot {
  // ... other fields
  whiskeyTypeId String?
  whiskeyType   WhiskeyType? @relation(fields: [whiskeyTypeId], references: [id])
  // ... other fields
}
```

**Key Points:**
- `code` is unique and serves as a business key (e.g., 'ASM', 'CB', 'RW')
- `globalId` is unique and used for cross-system synchronization
- `active` flag allows soft deactivation of whiskey types
- Relation to `Lot` is optional (nullable foreign key)

## 2. Database Migration

**File:** `prisma/migrations/20251024000000_add_whiskey_type_entity/migration.sql`

```sql
-- Create a temporary function to generate CUIDs for this migration
CREATE OR REPLACE FUNCTION generate_cuid()
RETURNS TEXT AS $$
BEGIN
    -- This is a simplified CUID generator for migration purposes.
    -- It generates a 'c' followed by 24 random hex characters.
    RETURN 'c' || substr(md5(random()::text) || md5(random()::text), 1, 24);
END;
$$ LANGUAGE plpgsql;

-- CreateTable
CREATE TABLE "WhiskeyType" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "globalId" TEXT,

    CONSTRAINT "WhiskeyType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhiskeyType_code_key" ON "WhiskeyType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "WhiskeyType_globalId_key" ON "WhiskeyType"("globalId");

-- AddColumn to Lot table for WhiskeyType reference
ALTER TABLE "Lot" ADD COLUMN "whiskeyTypeId" TEXT;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_whiskeyTypeId_fkey" FOREIGN KEY ("whiskeyTypeId") REFERENCES "WhiskeyType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Insert initial WhiskeyType data
INSERT INTO "WhiskeyType" ("id", "createdAt", "updatedAt", "code", "name", "description", "category", "active", "globalId")
VALUES
  (generate_cuid(), NOW(), NOW(), 'ASM', 'American Single Malt', 'Single malt whiskey produced in the United States', 'Single Malt', true, generate_cuid()),
  (generate_cuid(), NOW(), NOW(), 'CB', 'Corn Bourbon', 'Bourbon whiskey with at least 51% corn mash', 'Bourbon', true, generate_cuid()),
  (generate_cuid(), NOW(), NOW(), 'CW', 'Corn Whiskey', 'Whiskey made from at least 80% corn mash', 'Corn', true, generate_cuid()),
  (generate_cuid(), NOW(), NOW(), 'RB', 'Rye Bourbon', 'Bourbon whiskey with significant rye content', 'Bourbon', true, generate_cuid()),
  (generate_cuid(), NOW(), NOW(), 'RW', 'Rye Whiskey', 'Whiskey made from at least 51% rye mash', 'Rye', true, generate_cuid()),
  (generate_cuid(), NOW(), NOW(), 'WB', 'Wheated Bourbon', 'Bourbon whiskey with wheat as secondary grain', 'Bourbon', true, generate_cuid()),
  (generate_cuid(), NOW(), NOW(), 'WW', 'Wheat Whiskey', 'Whiskey made from at least 51% wheat mash', 'Wheat', true, generate_cuid());

-- Migrate existing Lot enum values to WhiskeyType references
DO $$
DECLARE
  lot_record RECORD;
  whiskey_type_id TEXT;
BEGIN
  FOR lot_record IN
    SELECT id, "whiskeyType" FROM "Lot" WHERE "whiskeyType" IS NOT NULL
  LOOP
    -- Map enum values to WhiskeyType codes
    CASE lot_record."whiskeyType"
      WHEN 'AmericanSingleMalt' THEN
        SELECT id INTO whiskey_type_id FROM "WhiskeyType" WHERE code = 'ASM';
      WHEN 'CornBourbon' THEN
        SELECT id INTO whiskey_type_id FROM "WhiskeyType" WHERE code = 'CB';
      WHEN 'CornWhiskey' THEN
        SELECT id INTO whiskey_type_id FROM "WhiskeyType" WHERE code = 'CW';
      WHEN 'RyeBourbon' THEN
        SELECT id INTO whiskey_type_id FROM "WhiskeyType" WHERE code = 'RB';
      WHEN 'RyeWhiskey' THEN
        SELECT id INTO whiskey_type_id FROM "WhiskeyType" WHERE code = 'RW';
      WHEN 'WheatedBourbon' THEN
        SELECT id INTO whiskey_type_id FROM "WhiskeyType" WHERE code = 'WB';
      WHEN 'WheatWhiskey' THEN
        SELECT id INTO whiskey_type_id FROM "WhiskeyType" WHERE code = 'WW';
      ELSE
        whiskey_type_id := NULL;
    END CASE;

    IF whiskey_type_id IS NOT NULL THEN
      UPDATE "Lot" SET "whiskeyTypeId" = whiskey_type_id WHERE id = lot_record.id;
    END IF;
  END LOOP;
END $$;

-- After migration, drop the old enum column (commented out for safety - run manually after verification)
-- ALTER TABLE "Lot" DROP COLUMN "whiskeyType";
-- DROP TYPE IF EXISTS "EnumLotWhiskeyType";
```

**Migration Strategy:**
1. Creates temporary CUID generator function
2. Creates WhiskeyType table with indexes
3. Adds whiskeyTypeId column to Lot table
4. Seeds initial whiskey type data
5. Migrates existing enum values to entity references
6. Leaves old enum column for manual removal after verification

## 3. Seeding Script

**File:** `scripts/seeding/seed-whiskey-types.ts`

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const whiskeyTypesData = [
  {
    code: 'ASM',
    name: 'American Single Malt',
    description: 'Single malt whiskey produced in the United States',
    category: 'Single Malt',
  },
  {
    code: 'CB',
    name: 'Corn Bourbon',
    description: 'Bourbon whiskey with at least 51% corn mash',
    category: 'Bourbon',
  },
  {
    code: 'CW',
    name: 'Corn Whiskey',
    description: 'Whiskey made from at least 80% corn mash',
    category: 'Corn',
  },
  {
    code: 'RB',
    name: 'Rye Bourbon',
    description: 'Bourbon whiskey with significant rye content',
    category: 'Bourbon',
  },
  {
    code: 'RW',
    name: 'Rye Whiskey',
    description: 'Whiskey made from at least 51% rye mash',
    category: 'Rye',
  },
  {
    code: 'WB',
    name: 'Wheated Bourbon',
    description: 'Bourbon whiskey with wheat as secondary grain',
    category: 'Bourbon',
  },
  {
    code: 'WW',
    name: 'Wheat Whiskey',
    description: 'Whiskey made from at least 51% wheat mash',
    category: 'Wheat',
  },
];

async function seedWhiskeyTypes() {
  console.log('Starting WhiskeyType seeding...');

  try {
    for (const whiskeyType of whiskeyTypesData) {
      const existing = await prisma.whiskeyType.findUnique({
        where: { code: whiskeyType.code },
      });

      if (existing) {
        console.log(`WhiskeyType ${whiskeyType.code} already exists, updating...`);
        await prisma.whiskeyType.update({
          where: { code: whiskeyType.code },
          data: {
            name: whiskeyType.name,
            description: whiskeyType.description,
            category: whiskeyType.category,
            active: true,
          },
        });
      } else {
        console.log(`Creating WhiskeyType ${whiskeyType.code}...`);
        await prisma.whiskeyType.create({
          data: {
            ...whiskeyType,
            active: true,
          },
        });
      }
    }

    console.log('WhiskeyType seeding completed successfully!');

    // Migrate existing Lot enum values to WhiskeyType references
    console.log('\nMigrating existing Lot whiskey types...');

    const lotsWithWhiskeyType = await prisma.$queryRaw`
      SELECT id, "whiskeyType" FROM "Lot" WHERE "whiskeyType" IS NOT NULL
    ` as Array<{ id: string; whiskeyType: string }>;

    const enumMapping: Record<string, string> = {
      'AmericanSingleMalt': 'ASM',
      'CornBourbon': 'CB',
      'CornWhiskey': 'CW',
      'RyeBourbon': 'RB',
      'RyeWhiskey': 'RW',
      'WheatedBourbon': 'WB',
      'WheatWhiskey': 'WW',
    };

    console.log(`   Found ${lotsWithWhiskeyType.length} lots with whiskey type enum values`);

    let updated = 0;
    let skipped = 0;
    const failures: Array<{ lotId: string; enumValue: string; whiskeyTypeCode: string; reason: string }> = [];

    for (const lot of lotsWithWhiskeyType) {
      if (lot.whiskeyType && enumMapping[lot.whiskeyType]) {
        const whiskeyTypeCode = enumMapping[lot.whiskeyType];
        const whiskeyType = await prisma.whiskeyType.findUnique({
          where: { code: whiskeyTypeCode },
        });

        if (whiskeyType) {
          try {
            await prisma.lot.update({
              where: { id: lot.id },
              data: { whiskeyTypeId: whiskeyType.id },
            });
            updated++;
            if (updated % 10 === 0) {
              console.log(`   ✅ Updated ${updated}/${lotsWithWhiskeyType.length} lots...`);
            }
          } catch (error) {
            skipped++;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.warn(`   ⚠️  Lot ${lot.id}: Failed to update (enum: ${lot.whiskeyType}, code: ${whiskeyTypeCode}) - ${errorMessage}`);
            failures.push({
              lotId: lot.id,
              enumValue: lot.whiskeyType,
              whiskeyTypeCode,
              reason: errorMessage
            });
          }
        } else {
          skipped++;
          console.warn(`   ⚠️  Lot ${lot.id}: WhiskeyType not found in database (enum: ${lot.whiskeyType}, code: ${whiskeyTypeCode})`);
          failures.push({
            lotId: lot.id,
            enumValue: lot.whiskeyType,
            whiskeyTypeCode,
            reason: 'WhiskeyType not found in database'
          });
        }
      } else if (lot.whiskeyType) {
        // Handle unmapped enum values
        skipped++;
        console.warn(`   ⚠️  Lot ${lot.id}: No mapping defined for enum value "${lot.whiskeyType}"`);
        failures.push({
          lotId: lot.id,
          enumValue: lot.whiskeyType,
          whiskeyTypeCode: 'N/A',
          reason: 'No mapping defined for enum value'
        });
      }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ⚠️  Skipped: ${skipped}`);
    console.log(`   📦 Total processed: ${lotsWithWhiskeyType.length}`);

    if (failures.length > 0) {
      console.warn(`\n⚠️  ${failures.length} lot(s) failed to migrate:`);
      failures.forEach(({ lotId, enumValue, whiskeyTypeCode, reason }) => {
        console.warn(`   - Lot ${lotId} (enum: ${enumValue} -> code: ${whiskeyTypeCode}): ${reason}`);
      });
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Error seeding WhiskeyTypes:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seeding if this file is executed directly
if (require.main === module) {
  seedWhiskeyTypes()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { seedWhiskeyTypes };
```

**Features:**
- Idempotent - can be run multiple times safely
- Updates existing records if found by code
- Migrates Lot enum values to entity references
- Comprehensive error handling and reporting
- Progress tracking for large datasets

**Run with:**
```bash
ts-node scripts/seeding/seed-whiskey-types.ts
```

## 4. NestJS Module Structure

### 4.1 Module Configuration

**File:** `src/whiskeyType/whiskeyType.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { WhiskeyTypeService } from './whiskeyType.service';
import { WhiskeyTypeController } from './whiskeyType.controller';
import { WhiskeyTypeResolver } from './whiskeyType.resolver';
import { PrismaModule } from '../prisma/prisma.module';
import { ACLModule } from '../auth/acl.module';
import { RabbitMQModule } from '../rabbitmq/rabbitmq.module';

@Module({
  imports: [PrismaModule, ACLModule, RabbitMQModule],
  controllers: [WhiskeyTypeController],
  providers: [WhiskeyTypeService, WhiskeyTypeResolver],
  exports: [WhiskeyTypeService],
})
export class WhiskeyTypeModule {}
```

### 4.2 Service

**File:** `src/whiskeyType/whiskeyType.service.ts`

```typescript
import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, WhiskeyType } from '@prisma/client';
import { RabbitMQProducerService } from '../rabbitmq/rabbitmq.producer.service';
import { WhMessageBrokerTopics } from '../rabbitmq/topics';

@Injectable()
export class WhiskeyTypeService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly rabbitProducer?: RabbitMQProducerService,
  ) {}

  async findMany(args: Prisma.WhiskeyTypeFindManyArgs): Promise<WhiskeyType[]> {
    return this.prisma.whiskeyType.findMany(args);
  }

  async findOne(args: Prisma.WhiskeyTypeFindUniqueArgs): Promise<WhiskeyType | null> {
    return this.prisma.whiskeyType.findUnique(args);
  }

  async create(args: Prisma.WhiskeyTypeCreateArgs): Promise<WhiskeyType> {
    const whiskeyType = await this.prisma.whiskeyType.create(args);

    // Emit RabbitMQ event for created WhiskeyType
    if (this.rabbitProducer) {
      await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01WhiskeyType, {
        action: 'CREATE',
        data: whiskeyType,
        timestamp: new Date().toISOString(),
      });
    }

    return whiskeyType;
  }

  async update(args: Prisma.WhiskeyTypeUpdateArgs): Promise<WhiskeyType> {
    const whiskeyType = await this.prisma.whiskeyType.update(args);

    // Emit RabbitMQ event for updated WhiskeyType
    if (this.rabbitProducer) {
      await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01WhiskeyType, {
        action: 'UPDATE',
        data: whiskeyType,
        timestamp: new Date().toISOString(),
      });
    }

    return whiskeyType;
  }

  async delete(args: Prisma.WhiskeyTypeDeleteArgs): Promise<WhiskeyType> {
    const whiskeyType = await this.prisma.whiskeyType.delete(args);

    // Emit RabbitMQ event for deleted WhiskeyType
    if (this.rabbitProducer) {
      await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01WhiskeyType, {
        action: 'DELETE',
        data: whiskeyType,
        timestamp: new Date().toISOString(),
      });
    }

    return whiskeyType;
  }

  async count(args?: Prisma.WhiskeyTypeCountArgs): Promise<number> {
    return this.prisma.whiskeyType.count(args);
  }

  async findByCode(code: string): Promise<WhiskeyType | null> {
    return this.prisma.whiskeyType.findUnique({
      where: { code },
    });
  }

  async getActiveWhiskeyTypes(): Promise<WhiskeyType[]> {
    return this.prisma.whiskeyType.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
  }
}
```

**Key Features:**
- Standard CRUD operations using Prisma
- RabbitMQ integration for CREATE, UPDATE, DELETE events
- Helper methods: `findByCode()`, `getActiveWhiskeyTypes()`
- Optional RabbitMQ dependency for flexibility

### 4.3 REST Controller

**File:** `src/whiskeyType/whiskeyType.controller.ts`

```typescript
import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, NotFoundException, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WhiskeyTypeService } from './whiskeyType.service';
import { WhiskeyType, Prisma } from '@prisma/client';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateWhiskeyTypeDto } from './dto/create-whiskey-type.dto';
import { UpdateWhiskeyTypeDto } from './dto/update-whiskey-type.dto';

@ApiTags('whiskey-types')
@Controller('api/whiskey-types')
@UseGuards(RolesGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
export class WhiskeyTypeController {
  constructor(private readonly whiskeyTypeService: WhiskeyTypeService) {}

  @Get()
  @ApiOperation({ summary: 'Get all whiskey types' })
  @ApiResponse({ status: 200, description: 'Returns all whiskey types' })
  @Roles('user')
  async findMany(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('active') active?: string,
  ): Promise<WhiskeyType[]> {
    const args: Prisma.WhiskeyTypeFindManyArgs = {
      skip: skip ? parseInt(skip, 10) : undefined,
      take: take ? parseInt(take, 10) : undefined,
      where: active !== undefined ? { active: active === 'true' } : undefined,
      orderBy: { name: 'asc' },
    };
    return this.whiskeyTypeService.findMany(args);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a whiskey type by ID' })
  @ApiResponse({ status: 200, description: 'Returns the whiskey type' })
  @ApiResponse({ status: 404, description: 'Whiskey type not found' })
  @Roles('user')
  async findOne(@Param('id') id: string): Promise<WhiskeyType | null> {
    return this.whiskeyTypeService.findOne({ where: { id } });
  }

  @Get('code/:code')
  @ApiOperation({ summary: 'Get a whiskey type by code' })
  @ApiResponse({ status: 200, description: 'Returns the whiskey type' })
  @ApiResponse({ status: 404, description: 'Whiskey type not found' })
  @Roles('user')
  async findByCode(@Param('code') code: string): Promise<WhiskeyType> {
    const whiskeyType = await this.whiskeyTypeService.findByCode(code);
    if (!whiskeyType) {
      throw new NotFoundException(`Whiskey type with code '${code}' not found`);
    }
    return whiskeyType;
  }

  @Post()
  @ApiOperation({ summary: 'Create a new whiskey type' })
  @ApiResponse({ status: 201, description: 'Whiskey type created successfully' })
  @Roles('admin')
  async create(@Body() dto: CreateWhiskeyTypeDto): Promise<WhiskeyType> {
    // Map DTO to Prisma input, explicitly omitting relations
    const data: Prisma.WhiskeyTypeCreateInput = {
      code: dto.code,
      name: dto.name,
      description: dto.description,
      category: dto.category,
      active: dto.active ?? true,
    };

    return this.whiskeyTypeService.create({ data });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a whiskey type' })
  @ApiResponse({ status: 200, description: 'Whiskey type updated successfully' })
  @ApiResponse({ status: 404, description: 'Whiskey type not found' })
  @Roles('admin')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWhiskeyTypeDto,
  ): Promise<WhiskeyType> {
    // Map DTO to Prisma input, explicitly omitting relations and only including provided fields
    const data: Prisma.WhiskeyTypeUpdateInput = {};

    if (dto.code !== undefined) data.code = dto.code;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.active !== undefined) data.active = dto.active;

    return this.whiskeyTypeService.update({ where: { id }, data });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a whiskey type' })
  @ApiResponse({ status: 200, description: 'Whiskey type deleted successfully' })
  @ApiResponse({ status: 404, description: 'Whiskey type not found' })
  @Roles('admin')
  async delete(@Param('id') id: string): Promise<WhiskeyType> {
    return this.whiskeyTypeService.delete({ where: { id } });
  }
}
```

**REST Endpoints:**
- `GET /api/whiskey-types` - List all (with pagination and filtering)
- `GET /api/whiskey-types/:id` - Get by ID
- `GET /api/whiskey-types/code/:code` - Get by code
- `POST /api/whiskey-types` - Create (admin only)
- `PUT /api/whiskey-types/:id` - Update (admin only)
- `DELETE /api/whiskey-types/:id` - Delete (admin only)

### 4.4 GraphQL Resolver

**File:** `src/whiskeyType/whiskeyType.resolver.ts`

```typescript
import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { WhiskeyTypeService } from './whiskeyType.service';
import { GqlDefaultAuthGuard } from '../auth/gqlDefaultAuth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Prisma } from '@prisma/client';
import { WhiskeyType } from './base/WhiskeyType';
import { WhiskeyTypeWhereInput } from './base/WhiskeyTypeWhereInput';
import { WhiskeyTypeOrderByInput } from './base/WhiskeyTypeOrderByInput';
import { WhiskeyTypeCreateInput } from './base/WhiskeyTypeCreateInput';
import { WhiskeyTypeUpdateInput } from './base/WhiskeyTypeUpdateInput';

@Resolver('WhiskeyType')
@UseGuards(GqlDefaultAuthGuard, RolesGuard)
export class WhiskeyTypeResolver {
  constructor(private readonly whiskeyTypeService: WhiskeyTypeService) {}

  @Query(() => [WhiskeyType])
  @Roles('user')
  async whiskeyTypes(
    @Args('skip', { nullable: true }) skip?: number,
    @Args('take', { nullable: true }) take?: number,
    @Args('where', { type: () => WhiskeyTypeWhereInput, nullable: true }) where?: Prisma.WhiskeyTypeWhereInput,
    @Args('orderBy', { type: () => WhiskeyTypeOrderByInput, nullable: true }) orderBy?: Prisma.WhiskeyTypeOrderByWithRelationInput,
  ) {
    return this.whiskeyTypeService.findMany({
      skip,
      take,
      where,
      orderBy,
    });
  }

  @Query(() => WhiskeyType)
  @Roles('user')
  async whiskeyType(@Args('id', { type: () => ID }) id: string) {
    return this.whiskeyTypeService.findOne({ where: { id } });
  }

  @Query(() => WhiskeyType)
  @Roles('user')
  async whiskeyTypeByCode(@Args('code') code: string) {
    return this.whiskeyTypeService.findByCode(code);
  }

  @Query(() => [WhiskeyType])
  @Roles('user')
  async activeWhiskeyTypes() {
    return this.whiskeyTypeService.getActiveWhiskeyTypes();
  }

  @Mutation('createWhiskeyType')
  @Roles('admin')
  async createWhiskeyType(@Args('data', { type: () => WhiskeyTypeCreateInput }) data: Prisma.WhiskeyTypeCreateInput) {
    return this.whiskeyTypeService.create({ data });
  }

  @Mutation('updateWhiskeyType')
  @Roles('admin')
  async updateWhiskeyType(
    @Args('id', { type: () => ID }) id: string,
    @Args('data', { type: () => WhiskeyTypeUpdateInput }) data: Prisma.WhiskeyTypeUpdateInput,
  ) {
    return this.whiskeyTypeService.update({ where: { id }, data });
  }

  @Mutation('deleteWhiskeyType')
  @Roles('admin')
  async deleteWhiskeyType(@Args('id', { type: () => ID }) id: string) {
    return this.whiskeyTypeService.delete({ where: { id } });
  }

  @Query('whiskeyTypesCount')
  @Roles('user')
  async whiskeyTypesCount(@Args('where', { type: () => WhiskeyTypeWhereInput, nullable: true }) where?: Prisma.WhiskeyTypeWhereInput) {
    return this.whiskeyTypeService.count({ where });
  }
}
```

**GraphQL Operations:**

**Queries:**
- `whiskeyTypes` - List with filtering, ordering, pagination
- `whiskeyType(id)` - Get by ID
- `whiskeyTypeByCode(code)` - Get by code
- `activeWhiskeyTypes` - Get all active types
- `whiskeyTypesCount` - Count with optional filters

**Mutations:**
- `createWhiskeyType(data)` - Create new (admin only)
- `updateWhiskeyType(id, data)` - Update existing (admin only)
- `deleteWhiskeyType(id)` - Delete (admin only)

## 5. Data Transfer Objects (DTOs)

### 5.1 Create DTO

**File:** `src/whiskeyType/dto/create-whiskey-type.dto.ts`

```typescript
import { IsString, IsNotEmpty, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWhiskeyTypeDto {
  @ApiProperty({
    description: 'Unique code for the whiskey type',
    example: 'RB',
    maxLength: 10,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  code!: string;

  @ApiProperty({
    description: 'Name of the whiskey type',
    example: 'Rye Bourbon',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description: 'Description of the whiskey type',
    example: 'Bourbon whiskey with significant rye content',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Category of the whiskey type',
    example: 'Bourbon',
    required: false,
  })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({
    description: 'Whether the whiskey type is active',
    example: true,
    required: false,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
```

### 5.2 Update DTO

**File:** `src/whiskeyType/dto/update-whiskey-type.dto.ts`

```typescript
import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateWhiskeyTypeDto {
  @ApiProperty({
    description: 'Unique code for the whiskey type',
    example: 'RB',
    required: false,
    maxLength: 10,
  })
  @IsString()
  @IsOptional()
  @MaxLength(10)
  code?: string;

  @ApiProperty({
    description: 'Name of the whiskey type',
    example: 'Rye Bourbon',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'Description of the whiskey type',
    example: 'Bourbon whiskey with significant rye content',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Category of the whiskey type',
    example: 'Bourbon',
    required: false,
  })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({
    description: 'Whether the whiskey type is active',
    example: true,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
```

## 6. GraphQL Base Types

### 6.1 WhiskeyType

**File:** `src/whiskeyType/base/WhiskeyType.ts`

```typescript
import { ObjectType, Field } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsDate,
  ValidateNested,
  MaxLength,
} from "class-validator";
import { Type } from "class-transformer";
import { Lot } from "../../lot/base/Lot";

@ObjectType()
class WhiskeyType {
  @ApiProperty({
    required: true,
    type: String,
  })
  @IsString()
  @Field(() => String)
  id!: string;

  @ApiProperty({
    required: true,
  })
  @IsDate()
  @Type(() => Date)
  @Field(() => Date)
  createdAt!: Date;

  @ApiProperty({
    required: true,
  })
  @IsDate()
  @Type(() => Date)
  @Field(() => Date)
  updatedAt!: Date;

  @ApiProperty({
    required: true,
    type: String,
  })
  @IsString()
  @MaxLength(10)
  @Field(() => String)
  code!: string;

  @ApiProperty({
    required: true,
    type: String,
  })
  @IsString()
  @Field(() => String)
  name!: string;

  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  category!: string | null;

  @ApiProperty({
    required: true,
    type: Boolean,
  })
  @IsBoolean()
  @Field(() => Boolean)
  active!: boolean;

  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  globalId!: string | null;

  @ApiProperty({
    required: false,
    type: () => [Lot],
  })
  @ValidateNested()
  @Type(() => Lot)
  @IsOptional()
  lots?: Array<Lot>;
}

export { WhiskeyType as WhiskeyType };
```

### 6.2 WhiskeyTypeCreateInput

**File:** `src/whiskeyType/base/WhiskeyTypeCreateInput.ts`

```typescript
import { InputType, Field } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsNotEmpty, IsOptional, IsBoolean, MaxLength } from "class-validator";

@InputType()
class WhiskeyTypeCreateInput {
  @ApiProperty({
    required: true,
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  @Field(() => String)
  code!: string;

  @ApiProperty({
    required: true,
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  @Field(() => String)
  name!: string;

  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  description?: string | null;

  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  category?: string | null;

  @ApiProperty({
    required: false,
    type: Boolean,
  })
  @IsBoolean()
  @IsOptional()
  @Field(() => Boolean, {
    nullable: true,
  })
  active?: boolean | null;

  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  globalId?: string | null;
}

export { WhiskeyTypeCreateInput as WhiskeyTypeCreateInput };
```

### 6.3 WhiskeyTypeUpdateInput

**File:** `src/whiskeyType/base/WhiskeyTypeUpdateInput.ts`

```typescript
import { InputType, Field } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsOptional, IsBoolean, MaxLength } from "class-validator";

@InputType()
class WhiskeyTypeUpdateInput {
  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @IsOptional()
  @MaxLength(10)
  @Field(() => String, {
    nullable: true,
  })
  code?: string;

  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  name?: string;

  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  description?: string | null;

  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  category?: string | null;

  @ApiProperty({
    required: false,
    type: Boolean,
  })
  @IsBoolean()
  @IsOptional()
  @Field(() => Boolean, {
    nullable: true,
  })
  active?: boolean | null;

  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  globalId?: string | null;
}

export { WhiskeyTypeUpdateInput as WhiskeyTypeUpdateInput };
```

### 6.4 WhiskeyTypeWhereInput

**File:** `src/whiskeyType/base/WhiskeyTypeWhereInput.ts`

```typescript
import { InputType, Field } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import { StringFilter } from "../../util/StringFilter";
import { Type } from "class-transformer";
import { IsOptional, ValidateNested } from "class-validator";
import { StringNullableFilter } from "../../util/StringNullableFilter";
import { BooleanFilter } from "../../util/BooleanFilter";
import { DateTimeFilter } from "../../util/DateTimeFilter";
import { LotListRelationFilter } from "../../lot/base/LotListRelationFilter";

@InputType()
class WhiskeyTypeWhereInput {
  @ApiProperty({
    required: false,
    type: () => [WhiskeyTypeWhereInput],
  })
  @ValidateNested()
  @Type(() => WhiskeyTypeWhereInput)
  @IsOptional()
  @Field(() => [WhiskeyTypeWhereInput], {
    nullable: true,
  })
  AND?: WhiskeyTypeWhereInput[];

  @ApiProperty({
    required: false,
    type: () => [WhiskeyTypeWhereInput],
  })
  @ValidateNested()
  @Type(() => WhiskeyTypeWhereInput)
  @IsOptional()
  @Field(() => [WhiskeyTypeWhereInput], {
    nullable: true,
  })
  OR?: WhiskeyTypeWhereInput[];

  @ApiProperty({
    required: false,
    type: () => [WhiskeyTypeWhereInput],
  })
  @ValidateNested()
  @Type(() => WhiskeyTypeWhereInput)
  @IsOptional()
  @Field(() => [WhiskeyTypeWhereInput], {
    nullable: true,
  })
  NOT?: WhiskeyTypeWhereInput[];

  @ApiProperty({
    required: false,
    type: StringFilter,
  })
  @Type(() => StringFilter)
  @IsOptional()
  @Field(() => StringFilter, {
    nullable: true,
  })
  id?: StringFilter;

  @ApiProperty({
    required: false,
    type: DateTimeFilter,
  })
  @Type(() => DateTimeFilter)
  @IsOptional()
  @Field(() => DateTimeFilter, {
    nullable: true,
  })
  createdAt?: DateTimeFilter;

  @ApiProperty({
    required: false,
    type: DateTimeFilter,
  })
  @Type(() => DateTimeFilter)
  @IsOptional()
  @Field(() => DateTimeFilter, {
    nullable: true,
  })
  updatedAt?: DateTimeFilter;

  @ApiProperty({
    required: false,
    type: StringFilter,
  })
  @Type(() => StringFilter)
  @IsOptional()
  @Field(() => StringFilter, {
    nullable: true,
  })
  code?: StringFilter;

  @ApiProperty({
    required: false,
    type: StringFilter,
  })
  @Type(() => StringFilter)
  @IsOptional()
  @Field(() => StringFilter, {
    nullable: true,
  })
  name?: StringFilter;

  @ApiProperty({
    required: false,
    type: StringNullableFilter,
  })
  @Type(() => StringNullableFilter)
  @IsOptional()
  @Field(() => StringNullableFilter, {
    nullable: true,
  })
  description?: StringNullableFilter;

  @ApiProperty({
    required: false,
    type: StringNullableFilter,
  })
  @Type(() => StringNullableFilter)
  @IsOptional()
  @Field(() => StringNullableFilter, {
    nullable: true,
  })
  category?: StringNullableFilter;

  @ApiProperty({
    required: false,
    type: BooleanFilter,
  })
  @Type(() => BooleanFilter)
  @IsOptional()
  @Field(() => BooleanFilter, {
    nullable: true,
  })
  active?: BooleanFilter;

  @ApiProperty({
    required: false,
    type: StringNullableFilter,
  })
  @Type(() => StringNullableFilter)
  @IsOptional()
  @Field(() => StringNullableFilter, {
    nullable: true,
  })
  globalId?: StringNullableFilter;

  @ApiProperty({
    required: false,
    type: () => LotListRelationFilter,
  })
  @ValidateNested()
  @Type(() => LotListRelationFilter)
  @IsOptional()
  @Field(() => LotListRelationFilter, {
    nullable: true,
  })
  lots?: LotListRelationFilter;
}

export { WhiskeyTypeWhereInput as WhiskeyTypeWhereInput };
```

### 6.5 WhiskeyTypeOrderByInput

**File:** `src/whiskeyType/base/WhiskeyTypeOrderByInput.ts`

```typescript
import { InputType, Field } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import { SortOrder } from "../../util/SortOrder";
import { IsOptional, IsEnum } from "class-validator";

@InputType()
class WhiskeyTypeOrderByInput {
  @ApiProperty({
    required: false,
    enum: ["asc", "desc"],
  })
  @IsEnum(SortOrder)
  @IsOptional()
  @Field(() => SortOrder, {
    nullable: true,
  })
  id?: SortOrder;

  @ApiProperty({
    required: false,
    enum: ["asc", "desc"],
  })
  @IsEnum(SortOrder)
  @IsOptional()
  @Field(() => SortOrder, {
    nullable: true,
  })
  createdAt?: SortOrder;

  @ApiProperty({
    required: false,
    enum: ["asc", "desc"],
  })
  @IsEnum(SortOrder)
  @IsOptional()
  @Field(() => SortOrder, {
    nullable: true,
  })
  updatedAt?: SortOrder;

  @ApiProperty({
    required: false,
    enum: ["asc", "desc"],
  })
  @IsEnum(SortOrder)
  @IsOptional()
  @Field(() => SortOrder, {
    nullable: true,
  })
  code?: SortOrder;

  @ApiProperty({
    required: false,
    enum: ["asc", "desc"],
  })
  @IsEnum(SortOrder)
  @IsOptional()
  @Field(() => SortOrder, {
    nullable: true,
  })
  name?: SortOrder;

  @ApiProperty({
    required: false,
    enum: ["asc", "desc"],
  })
  @IsEnum(SortOrder)
  @IsOptional()
  @Field(() => SortOrder, {
    nullable: true,
  })
  description?: SortOrder;

  @ApiProperty({
    required: false,
    enum: ["asc", "desc"],
  })
  @IsEnum(SortOrder)
  @IsOptional()
  @Field(() => SortOrder, {
    nullable: true,
  })
  category?: SortOrder;

  @ApiProperty({
    required: false,
    enum: ["asc", "desc"],
  })
  @IsEnum(SortOrder)
  @IsOptional()
  @Field(() => SortOrder, {
    nullable: true,
  })
  active?: SortOrder;

  @ApiProperty({
    required: false,
    enum: ["asc", "desc"],
  })
  @IsEnum(SortOrder)
  @IsOptional()
  @Field(() => SortOrder, {
    nullable: true,
  })
  globalId?: SortOrder;
}

export { WhiskeyTypeOrderByInput as WhiskeyTypeOrderByInput };
```

### 6.6 WhiskeyTypeWhereUniqueInput

**File:** `src/whiskeyType/base/WhiskeyTypeWhereUniqueInput.ts`

```typescript
import { InputType, Field } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsOptional } from "class-validator";

@InputType()
class WhiskeyTypeWhereUniqueInput {
  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  id?: string;

  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  code?: string;

  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  globalId?: string;
}

export { WhiskeyTypeWhereUniqueInput as WhiskeyTypeWhereUniqueInput };
```

## 7. RabbitMQ Integration

### 7.1 Topic Configuration

**File:** `src/rabbitmq/topics.ts`

Add the following to your RabbitMQ topics enum:

```typescript
export enum WhMessageBrokerTopics {
  // ... other topics
  WhWhk01Distillery01WhiskeyType = "wh.whk01.distillery01.whiskeytype",
}
```

### 7.2 Message Format

Messages emitted to RabbitMQ follow this structure:

```typescript
{
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  data: WhiskeyType,
  timestamp: string (ISO 8601)
}
```

**Example:**
```json
{
  "action": "CREATE",
  "data": {
    "id": "ckz1234567890",
    "createdAt": "2025-10-24T10:00:00.000Z",
    "updatedAt": "2025-10-24T10:00:00.000Z",
    "code": "RB",
    "name": "Rye Bourbon",
    "description": "Bourbon whiskey with significant rye content",
    "category": "Bourbon",
    "active": true,
    "globalId": "ckz0987654321"
  },
  "timestamp": "2025-10-24T10:00:00.000Z"
}
```

## 8. App Module Integration

**File:** `src/app.module.ts`

Add the WhiskeyType module to your app imports:

```typescript
import { WhiskeyTypeModule } from "./whiskeyType/whiskeyType.module";

@Module({
  imports: [
    // ... other modules
    LotModule,
    LotVariationModule,
    WhiskeyTypeModule, // Add this line
    WeightLogModule,
    // ... other modules
  ],
  // ... controllers, providers
})
export class AppModule {}
```

## 9. Package.json Scripts

The following scripts are available for seeding (add to your package.json if not present):

```json
{
  "scripts": {
    "seed": "ts-node scripts/seed.ts",
    "seed:robust": "ts-node scripts/run-seed.ts",
    "seed:quick": "ts-node scripts/run-seed.ts quick",
    "seed:full": "ts-node scripts/run-seed.ts full",
    "seed:whiskey-types": "ts-node scripts/seeding/seed-whiskey-types.ts"
  }
}
```

**Run the whiskey type seeding:**
```bash
npm run seed:whiskey-types
```

## 10. Initial Whiskey Types

The system seeds seven standard whiskey types:

| Code | Name | Description | Category |
|------|------|-------------|----------|
| ASM | American Single Malt | Single malt whiskey produced in the United States | Single Malt |
| CB | Corn Bourbon | Bourbon whiskey with at least 51% corn mash | Bourbon |
| CW | Corn Whiskey | Whiskey made from at least 80% corn mash | Corn |
| RB | Rye Bourbon | Bourbon whiskey with significant rye content | Bourbon |
| RW | Rye Whiskey | Whiskey made from at least 51% rye mash | Rye |
| WB | Wheated Bourbon | Bourbon whiskey with wheat as secondary grain | Bourbon |
| WW | Wheat Whiskey | Whiskey made from at least 51% wheat mash | Wheat |

## 11. Implementation Checklist

When implementing this in the MES backend:

- [ ] Add WhiskeyType model to Prisma schema
- [ ] Update Lot model to reference WhiskeyType
- [ ] Create and run migration
- [ ] Create whiskeyType directory structure
- [ ] Implement service with RabbitMQ integration
- [ ] Implement REST controller
- [ ] Implement GraphQL resolver
- [ ] Create DTOs (create and update)
- [ ] Generate/create base types for GraphQL
- [ ] Add RabbitMQ topic to topics enum
- [ ] Register module in app.module.ts
- [ ] Create seeding script
- [ ] Add seed script to package.json
- [ ] Run seeding to populate initial data
- [ ] Test all endpoints (REST and GraphQL)
- [ ] Verify RabbitMQ messages are being emitted
- [ ] Update API documentation

## 12. Testing Recommendations

### 12.1 REST API Testing

```bash
# Get all whiskey types
curl http://localhost:3000/api/whiskey-types

# Get by code
curl http://localhost:3000/api/whiskey-types/code/RB

# Get active only
curl http://localhost:3000/api/whiskey-types?active=true

# Create (requires admin auth)
curl -X POST http://localhost:3000/api/whiskey-types \
  -H "Content-Type: application/json" \
  -d '{"code":"TEST","name":"Test Whiskey","active":true}'
```

### 12.2 GraphQL Testing

```graphql
# Query all whiskey types
query {
  whiskeyTypes {
    id
    code
    name
    description
    category
    active
  }
}

# Query by code
query {
  whiskeyTypeByCode(code: "RB") {
    id
    code
    name
    description
  }
}

# Get active only
query {
  activeWhiskeyTypes {
    id
    code
    name
  }
}

# Create mutation
mutation {
  createWhiskeyType(data: {
    code: "TEST"
    name: "Test Whiskey"
    active: true
  }) {
    id
    code
    name
  }
}
```

## 13. Notes and Best Practices

1. **Migration Safety**: The migration leaves the old enum column in place. Remove it manually after verifying data migration is successful.

2. **Idempotency**: The seeding script is idempotent - it can be run multiple times safely. It will update existing records rather than creating duplicates.

3. **Code as Key**: The `code` field serves as the business key and should be used for lookups in application code rather than the database ID.

4. **Active Flag**: Use the `active` flag for soft-deletion rather than hard-deleting whiskey types that may be referenced by lots.

5. **RabbitMQ**: The RabbitMQ producer is optional. The service will work without it, but events won't be emitted.

6. **Permissions**: Admin role is required for create, update, and delete operations. Regular users can only read.

7. **Validation**: Both DTOs and GraphQL inputs include validation decorators. Ensure proper error handling for validation failures.

8. **GlobalId**: The `globalId` field is used for cross-system synchronization. If you don't need this, you can make it optional in the migration.

---

## 14. TTB (Alcohol and Tobacco Tax and Trade Bureau) Integration

### Overview

The WhiskeyType entity includes TTB integration to properly categorize whiskey types according to official federal definitions. This section covers the additions made to support TTB definitions and hierarchical relationships.

### 14.1 Updated Prisma Schema

```prisma
model WhiskeyType {
  id                 String         @id @default(cuid())
  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt
  code               String         @unique
  name               String
  description        String?
  category           String?
  active             Boolean        @default(true)
  globalId           String?        @unique @default(cuid())
  isTTBDefinition    Boolean        @default(false)
  ttbWhiskeyTypeId   String?
  lots               Lot[]
  ttbWhiskeyType     WhiskeyType?   @relation("TTBWhiskeyTypeHierarchy", fields: [ttbWhiskeyTypeId], references: [id])
  derivedWhiskeyTypes WhiskeyType[] @relation("TTBWhiskeyTypeHierarchy")
}
```

**New Fields:**
- `isTTBDefinition`: Boolean flag indicating if this is an official TTB category
- `ttbWhiskeyTypeId`: Foreign key to parent TTB definition (for subcategories)
- `ttbWhiskeyType`: Self-referential relation to parent TTB definition
- `derivedWhiskeyTypes`: Array of subcategories that reference this TTB definition

### 14.2 Additional Migration for TTB Fields

**File:** `prisma/migrations/20251024160000_add_ttb_fields_to_whiskey_type/migration.sql`

```sql
-- AddColumn to WhiskeyType table for TTB fields
ALTER TABLE "WhiskeyType" ADD COLUMN "isTTBDefinition" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WhiskeyType" ADD COLUMN "ttbWhiskeyTypeId" TEXT;

-- AddForeignKey for self-referential TTB hierarchy
ALTER TABLE "WhiskeyType" ADD CONSTRAINT "WhiskeyType_ttbWhiskeyTypeId_fkey" FOREIGN KEY ("ttbWhiskeyTypeId") REFERENCES "WhiskeyType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Insert Bourbon Whiskey as a TTB definition (parent for bourbon subcategories)
INSERT INTO "WhiskeyType" ("id", "createdAt", "updatedAt", "code", "name", "description", "category", "active", "globalId", "isTTBDefinition")
VALUES (
  'c' || substr(md5(random()::text) || md5(random()::text), 1, 24),
  NOW(),
  NOW(),
  'BW',
  'Bourbon Whiskey',
  'Whiskey produced in the United States at not exceeding 160° proof from a fermented mash of not less than 51 percent corn and stored at not more than 125° proof in charred new oak containers',
  'Bourbon',
  true,
  'c' || substr(md5(random()::text) || md5(random()::text), 1, 24),
  true
);

-- Get the ID of the newly created Bourbon Whiskey record
DO $$
DECLARE
  bourbon_whiskey_id TEXT;
BEGIN
  -- Get the ID of the Bourbon Whiskey type
  SELECT id INTO bourbon_whiskey_id FROM "WhiskeyType" WHERE code = 'BW';

  -- Update bourbon subcategories to reference Bourbon Whiskey as their TTB parent
  UPDATE "WhiskeyType" SET "ttbWhiskeyTypeId" = bourbon_whiskey_id WHERE code = 'CB';
  UPDATE "WhiskeyType" SET "ttbWhiskeyTypeId" = bourbon_whiskey_id WHERE code = 'RB';
  UPDATE "WhiskeyType" SET "ttbWhiskeyTypeId" = bourbon_whiskey_id WHERE code = 'WB';
END $$;

-- Mark official TTB definitions
UPDATE "WhiskeyType" SET "isTTBDefinition" = true WHERE code IN ('ASM', 'CW', 'RW', 'WW', 'BW');

-- Insert Tennessee Whiskey (references Bourbon Whiskey as TTB parent)
DO $$
DECLARE
  bourbon_whiskey_id TEXT;
BEGIN
  -- Get the ID of the Bourbon Whiskey type
  SELECT id INTO bourbon_whiskey_id FROM "WhiskeyType" WHERE code = 'BW';

  -- Insert Tennessee Whiskey
  INSERT INTO "WhiskeyType" ("id", "createdAt", "updatedAt", "code", "name", "description", "category", "active", "globalId", "isTTBDefinition", "ttbWhiskeyTypeId")
  VALUES (
    'c' || substr(md5(random()::text) || md5(random()::text), 1, 24),
    NOW(),
    NOW(),
    'TW',
    'Tennessee Whiskey',
    'Bourbon whiskey produced in Tennessee with additional charcoal filtering (Lincoln County Process)',
    'Bourbon',
    true,
    'c' || substr(md5(random()::text) || md5(random()::text), 1, 24),
    false,
    bourbon_whiskey_id
  );
END $$;
```

### 14.3 Updated Seeding Script with TTB Hierarchy

The seeding script now uses a two-phase approach:

**Phase 1: Seed TTB Definitions (Parent Categories)**
```typescript
const ttbDefinitions = [
  {
    code: 'ASM',
    name: 'American Single Malt',
    description: 'Single malt whiskey produced in the United States',
    category: 'Single Malt',
    isTTBDefinition: true,
  },
  {
    code: 'BW',
    name: 'Bourbon Whiskey',
    description: 'Whiskey produced in the United States at not exceeding 160° proof from a fermented mash of not less than 51 percent corn and stored at not more than 125° proof in charred new oak containers',
    category: 'Bourbon',
    isTTBDefinition: true,
  },
  {
    code: 'CW',
    name: 'Corn Whiskey',
    description: 'Whiskey made from at least 80% corn mash',
    category: 'Corn',
    isTTBDefinition: true,
  },
  {
    code: 'RW',
    name: 'Rye Whiskey',
    description: 'Whiskey made from at least 51% rye mash',
    category: 'Rye',
    isTTBDefinition: true,
  },
  {
    code: 'WW',
    name: 'Wheat Whiskey',
    description: 'Whiskey made from at least 51% wheat mash',
    category: 'Wheat',
    isTTBDefinition: true,
  },
];
```

**Phase 2: Seed Derived Types (Subcategories)**
```typescript
const derivedTypes = [
  {
    code: 'CB',
    name: 'Corn Bourbon',
    description: 'Bourbon whiskey with at least 51% corn mash',
    category: 'Bourbon',
    isTTBDefinition: false,
    ttbParentCode: 'BW',
  },
  {
    code: 'RB',
    name: 'Rye Bourbon',
    description: 'Bourbon whiskey with significant rye content',
    category: 'Bourbon',
    isTTBDefinition: false,
    ttbParentCode: 'BW',
  },
  {
    code: 'WB',
    name: 'Wheated Bourbon',
    description: 'Bourbon whiskey with wheat as secondary grain',
    category: 'Bourbon',
    isTTBDefinition: false,
    ttbParentCode: 'BW',
  },
  {
    code: 'TW',
    name: 'Tennessee Whiskey',
    description: 'Bourbon whiskey produced in Tennessee with additional charcoal filtering (Lincoln County Process)',
    category: 'Bourbon',
    isTTBDefinition: false,
    ttbParentCode: 'BW',
  },
];
```

### 14.4 Updated Whiskey Types Table

| Code | Name | Description | Category | TTB Definition | TTB Parent |
|------|------|-------------|----------|----------------|------------|
| ASM | American Single Malt | Single malt whiskey produced in the United States | Single Malt | Yes | None |
| BW | Bourbon Whiskey | Whiskey produced in the United States... | Bourbon | Yes | None |
| CB | Corn Bourbon | Bourbon whiskey with at least 51% corn mash | Bourbon | No | BW |
| CW | Corn Whiskey | Whiskey made from at least 80% corn mash | Corn | Yes | None |
| RB | Rye Bourbon | Bourbon whiskey with significant rye content | Bourbon | No | BW |
| RW | Rye Whiskey | Whiskey made from at least 51% rye mash | Rye | Yes | None |
| TW | Tennessee Whiskey | Bourbon whiskey produced in Tennessee... | Bourbon | No | BW |
| WB | Wheated Bourbon | Bourbon whiskey with wheat as secondary grain | Bourbon | No | BW |
| WW | Wheat Whiskey | Whiskey made from at least 51% wheat mash | Wheat | Yes | None |

### 14.5 Service Methods for TTB Operations

**New Methods Added:**

```typescript
async getTTBDefinitions(): Promise<WhiskeyType[]> {
  return this.prisma.whiskeyType.findMany({
    where: {
      isTTBDefinition: true,
      active: true
    },
    orderBy: { name: 'asc' },
  });
}

async getDerivedTypes(ttbWhiskeyTypeId: string): Promise<WhiskeyType[]> {
  return this.prisma.whiskeyType.findMany({
    where: {
      ttbWhiskeyTypeId,
      active: true
    },
    orderBy: { name: 'asc' },
  });
}

async getWhiskeyTypeWithRelations(id: string): Promise<WhiskeyType | null> {
  return this.prisma.whiskeyType.findUnique({
    where: { id },
    include: {
      ttbWhiskeyType: true,
      derivedWhiskeyTypes: {
        where: { active: true },
        orderBy: { name: 'asc' },
      },
    },
  });
}
```

### 14.6 REST API Endpoints for TTB

**New Endpoints:**

```
GET /api/whiskey-types/ttb/definitions
  - Get all TTB definition whiskey types
  - Returns: Array of WhiskeyType (only isTTBDefinition=true)

GET /api/whiskey-types/ttb/:ttbWhiskeyTypeId/derived
  - Get derived whiskey types for a specific TTB definition
  - Returns: Array of WhiskeyType subcategories

GET /api/whiskey-types/:id/relations
  - Get whiskey type with parent and child relationships
  - Returns: WhiskeyType with ttbWhiskeyType and derivedWhiskeyTypes
```

**Example Requests:**

```bash
# Get all TTB definitions
curl http://localhost:3000/api/whiskey-types/ttb/definitions

# Get all Bourbon variants (derived from Bourbon Whiskey)
curl http://localhost:3000/api/whiskey-types/ttb/{bourbon-whiskey-id}/derived

# Get Tennessee Whiskey with its parent TTB definition
curl http://localhost:3000/api/whiskey-types/{tennessee-whiskey-id}/relations
```

### 14.7 GraphQL Queries for TTB

**New Queries:**

```graphql
# Get all TTB definitions
query {
  ttbDefinitions {
    id
    code
    name
    description
    isTTBDefinition
  }
}

# Get derived types for a TTB definition
query {
  derivedWhiskeyTypes(ttbWhiskeyTypeId: "ckz123...") {
    id
    code
    name
    ttbWhiskeyType {
      code
      name
    }
  }
}

# Get whiskey type with full hierarchy
query {
  whiskeyTypeWithRelations(id: "ckz123...") {
    id
    code
    name
    isTTBDefinition
    ttbWhiskeyType {
      code
      name
    }
    derivedWhiskeyTypes {
      code
      name
    }
  }
}
```

### 14.8 Updated DTOs

Both Create and Update DTOs now include:

```typescript
@ApiProperty({
  description: 'Whether this whiskey type is an official TTB definition',
  example: true,
  required: false,
  default: false,
})
@IsBoolean()
@IsOptional()
isTTBDefinition?: boolean;

@ApiProperty({
  description: 'ID of the parent TTB whiskey type category',
  example: 'ckz1234567890',
  required: false,
})
@IsString()
@IsOptional()
ttbWhiskeyTypeId?: string;
```

### 14.9 TTB Best Practices

1. **TTB Definition Integrity**: Only mark whiskey types as `isTTBDefinition=true` if they correspond to official federal TTB categories.

2. **Hierarchy Management**: Subcategories (like Corn Bourbon, Rye Bourbon) should always reference their parent TTB definition (Bourbon Whiskey) via `ttbWhiskeyTypeId`.

3. **Tennessee Whiskey**: While technically a bourbon, Tennessee Whiskey is treated as a derived type with Bourbon Whiskey as its TTB parent, reflecting industry practice.

4. **Adding New Types**:
   - If it's an official TTB category → set `isTTBDefinition=true`, `ttbWhiskeyTypeId=null`
   - If it's a subcategory → set `isTTBDefinition=false`, reference parent via `ttbWhiskeyTypeId`

5. **Query Optimization**: Use `getTTBDefinitions()` for dropdowns/filters where only official categories should appear.

6. **Cascading Rules**: When deleting a TTB definition with derived types, consider the impact on subcategories (currently uses `ON DELETE SET NULL`).

---

Generated: 2025-10-24
Last Updated: 2025-10-24 (Added TTB Integration)

