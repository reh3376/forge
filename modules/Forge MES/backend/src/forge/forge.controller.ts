import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { DefaultAuthGuard } from "../auth/defaultAuth.guard";
import { ForgeHubService, HubStatus } from "./forge-hub.service";
import { ForgeIngestService, IngestStatus } from "./forge-ingest.service";
import { ForgeSpokeServer, SpokeServerStatus } from "./forge-spoke.server";
import { ForgeWriteService, WriteTagDescriptor } from "./forge-write.service";

export interface ForgeStatusResponse {
  hub: HubStatus;
  ingest: IngestStatus;
  /** The spoke-hosted gRPC server the hub writes back through (FB-054). */
  spoke: SpokeServerStatus;
}

/** Operational view of the forge-core link (session, heartbeat, ingest queue, write-back). */
@ApiTags("forge")
@ApiBearerAuth()
@UseGuards(DefaultAuthGuard, nestAccessControl.ACGuard)
@Controller("forge")
export class ForgeController {
  constructor(
    private readonly hub: ForgeHubService,
    private readonly ingest: ForgeIngestService,
    private readonly spoke: ForgeSpokeServer,
    private readonly writes: ForgeWriteService
  ) {}

  @Get("status")
  @ApiOperation({ summary: "Forge hub session, ingest and write-back status" })
  status(): ForgeStatusResponse {
    return {
      hub: this.hub.getStatus(),
      ingest: this.ingest.getStatus(),
      spoke: this.spoke.getStatus(),
    };
  }

  @Get("tags")
  @ApiOperation({ summary: "Tags the hub may write to (what Discover returns)" })
  tags(): { tags: WriteTagDescriptor[] } {
    return { tags: this.writes.describe() };
  }
}
