import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { DefaultAuthGuard } from "../auth/defaultAuth.guard";
import { ForgeHubService, HubStatus } from "./forge-hub.service";
import { ForgeIngestService, IngestStatus } from "./forge-ingest.service";

export interface ForgeStatusResponse {
  hub: HubStatus;
  ingest: IngestStatus;
}

/** Operational view of the forge-core link (session, heartbeat, ingest queue). */
@ApiTags("forge")
@ApiBearerAuth()
@UseGuards(DefaultAuthGuard, nestAccessControl.ACGuard)
@Controller("forge")
export class ForgeController {
  constructor(
    private readonly hub: ForgeHubService,
    private readonly ingest: ForgeIngestService
  ) {}

  @Get("status")
  @ApiOperation({ summary: "Forge hub session and ingest status" })
  status(): ForgeStatusResponse {
    return { hub: this.hub.getStatus(), ingest: this.ingest.getStatus() };
  }
}
