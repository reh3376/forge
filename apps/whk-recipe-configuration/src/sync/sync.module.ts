import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SyncService } from './sync.service';

@Module({
    imports: [ConfigModule],
    providers: [SyncService],
    exports: [SyncService],
})
export class SyncModule {}