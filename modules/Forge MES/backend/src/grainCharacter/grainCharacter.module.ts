import { Module } from "@nestjs/common";
import { GrainCharacterService } from "./grainCharacter.service";
import { GrainCharacterResolver } from "./grainCharacter.resolver";
import { GrainCharacterController } from "./grainCharacter.controller";

@Module({
  providers: [GrainCharacterService, GrainCharacterResolver],
  controllers: [GrainCharacterController],
  exports: [GrainCharacterService],
})
export class GrainCharacterModule {}
