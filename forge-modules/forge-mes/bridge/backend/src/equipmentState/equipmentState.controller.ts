import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import { UseRoles } from "nest-access-control";
import { EquipmentStateService } from "./equipmentState.service";
import { TransitionStateDto } from "./dto/transition-state.dto";
import { AssignFermenterDto } from "./dto/assign-fermenter.dto";
import { ReleaseFermenterDto } from "./dto/release-fermenter.dto";
import { UpdateAssignmentStatusDto } from "./dto/update-assignment-status.dto";
import { ForceOverrideStateDto } from "./dto/force-override-state.dto";

@swagger.ApiTags("equipment-state")
@common.Controller("equipment-state")
export class EquipmentStateController {
  constructor(private readonly equipmentStateService: EquipmentStateService) {}

  @common.Get(":assetId/state")
  @swagger.ApiOperation({ summary: "Get equipment state for a single asset" })
  @swagger.ApiOkResponse({ description: "Asset state with current assignment" })
  @UseRoles({
    resource: "Asset",
    action: "read",
    possession: "any",
  })
  async getAssetState(@common.Param("assetId") assetId: string) {
    return this.equipmentStateService.getAssetState(assetId);
  }

  @common.Get("area/:areaId/summary")
  @swagger.ApiOperation({
    summary: "Get area summary with child asset state roll-up",
  })
  @swagger.ApiOkResponse({
    description: "Area summary with state counts and asset list",
  })
  @UseRoles({
    resource: "Asset",
    action: "read",
    possession: "any",
  })
  async getAreaSummary(@common.Param("areaId") areaId: string) {
    return this.equipmentStateService.getAreaSummary(areaId);
  }

  @common.Get("area/by-path")
  @swagger.ApiOperation({
    summary: "Find area asset by path (e.g., WHK/SITE-001/AREA-FERM)",
  })
  @swagger.ApiQuery({ name: "path", type: String })
  @swagger.ApiOkResponse({ description: "Area asset ID and name" })
  @UseRoles({
    resource: "Asset",
    action: "read",
    possession: "any",
  })
  async findAreaByPath(@common.Query("path") path: string) {
    const area = await this.equipmentStateService.findAreaByPath(path);
    if (!area) {
      throw new common.NotFoundException(`Area with path '${path}' not found`);
    }
    return area;
  }

  @common.Get("area/:areaId/assignments")
  @swagger.ApiOperation({
    summary: "Get active fermenter assignments for an area",
  })
  @swagger.ApiOkResponse({ description: "Active fermenter assignments" })
  @UseRoles({
    resource: "Asset",
    action: "read",
    possession: "any",
  })
  async getActiveAssignments(@common.Param("areaId") areaId: string) {
    return this.equipmentStateService.getActiveAssignments(areaId);
  }

  @common.Post(":assetId/transition")
  @swagger.ApiOperation({ summary: "Transition asset operational state" })
  @swagger.ApiCreatedResponse({ description: "State transitioned" })
  @swagger.ApiBadRequestResponse({ description: "Invalid transition" })
  @swagger.ApiBody({ type: TransitionStateDto })
  @UseRoles({
    resource: "Asset",
    action: "update",
    possession: "any",
  })
  async transitionState(
    @common.Param("assetId") assetId: string,
    @common.Body() dto: TransitionStateDto
  ) {
    return this.equipmentStateService.transitionState(
      assetId,
      dto.targetState,
      dto.triggeredBy,
      dto.notes
    );
  }

  @common.Post("assign-fermenter")
  @swagger.ApiOperation({ summary: "Assign schedule order to a fermenter" })
  @swagger.ApiCreatedResponse({ description: "Fermenter assigned" })
  @swagger.ApiBadRequestResponse({
    description: "Fermenter not available or SO not found",
  })
  @swagger.ApiBody({ type: AssignFermenterDto })
  @UseRoles({
    resource: "Asset",
    action: "update",
    possession: "any",
  })
  async assignFermenter(@common.Body() dto: AssignFermenterDto) {
    return this.equipmentStateService.assignFermenter(dto);
  }

  @common.Post("assignment/:id/status")
  @swagger.ApiOperation({ summary: "Update fermenter assignment status" })
  @swagger.ApiCreatedResponse({ description: "Assignment status updated" })
  @swagger.ApiBadRequestResponse({ description: "Invalid status progression" })
  @swagger.ApiBody({ type: UpdateAssignmentStatusDto })
  @UseRoles({
    resource: "Asset",
    action: "update",
    possession: "any",
  })
  async updateAssignmentStatus(
    @common.Param("id") id: string,
    @common.Body() dto: UpdateAssignmentStatusDto
  ) {
    return this.equipmentStateService.updateAssignmentStatus(id, dto);
  }

  @common.Post(":assetId/force-override")
  @swagger.ApiOperation({
    summary: "Force-override asset state (admin, bypasses transition rules)",
  })
  @swagger.ApiCreatedResponse({ description: "State force-overridden" })
  @swagger.ApiBody({ type: ForceOverrideStateDto })
  @UseRoles({
    resource: "Asset",
    action: "update",
    possession: "any",
  })
  async forceOverrideState(
    @common.Param("assetId") assetId: string,
    @common.Body() dto: ForceOverrideStateDto
  ) {
    return this.equipmentStateService.forceOverrideState(
      assetId,
      dto.targetState,
      dto.triggeredBy,
      dto.reason
    );
  }

  @common.Post(":assetId/release")
  @swagger.ApiOperation({ summary: "Release fermenter from assignment" })
  @swagger.ApiCreatedResponse({ description: "Fermenter released" })
  @swagger.ApiBadRequestResponse({
    description: "No active assignment or invalid status",
  })
  @swagger.ApiBody({ type: ReleaseFermenterDto })
  @UseRoles({
    resource: "Asset",
    action: "update",
    possession: "any",
  })
  async releaseFermenter(
    @common.Param("assetId") assetId: string,
    @common.Body() dto: ReleaseFermenterDto
  ) {
    return this.equipmentStateService.releaseFermenter(assetId, dto);
  }
}
