import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {SyncService} from './sync.service';
import {PrismaModule} from "../prisma/prisma.module";
import {PrismaService} from "../prisma/prisma.service";

@Module({
    imports: [ConfigModule, PrismaModule],
    providers: [SyncService, PrismaService],
    exports: [SyncService],
})
export class SyncModule {}