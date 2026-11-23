import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  Logger,
} from "@nestjs/common";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import {
  EnumEquipmentOperationalState,
  EnumFermenterAssignmentStatus,
  EnumStateTransitionTrigger,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  VALID_EQUIPMENT_TRANSITIONS,
  AssetStateInfo,
  AreaSummary,
  FermenterAssignmentInfo,
  TransitionResult,
} from "./equipmentState.types";
import { AssignFermenterDto } from "./dto/assign-fermenter.dto";
import { ReleaseFermenterDto } from "./dto/release-fermenter.dto";
import { UpdateAssignmentStatusDto } from "./dto/update-assignment-status.dto";

@Injectable()
export class EquipmentStateService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger
  ) {}

  // ─── State Transitions ────────────────────────────────────────────

  async transitionState(
    assetId: string,
    targetState: EnumEquipmentOperationalState,
    triggeredBy: string,
    notes?: string
  ): Promise<TransitionResult> {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true, name: true, operationalState: true },
    });

    if (!asset) {
      throw new NotFoundException(`Asset ${assetId} not found`);
    }

    const fromState =
      asset.operationalState ?? EnumEquipmentOperationalState.Available;

    const allowed = VALID_EQUIPMENT_TRANSITIONS[fromState] || [];
    if (!allowed.includes(targetState)) {
      throw new BadRequestException(
        `Invalid transition: ${fromState} → ${targetState} for asset ${asset.name}. ` +
          `Allowed from ${fromState}: [${allowed.join(", ")}]`
      );
    }

    // Update asset state
    await this.prisma.asset.update({
      where: { id: assetId },
      data: { operationalState: targetState },
    });

    // Create audit trail
    await this.prisma.equipmentStateTransition.create({
      data: {
        assetId,
        fromState,
        toState: targetState,
        triggerType: EnumStateTransitionTrigger.Manual,
        triggeredBy,
        notes,
      },
    });

    this.logger.log(
      `Equipment state: ${asset.name} ${fromState} → ${targetState} by ${triggeredBy}`
    );

    return {
      success: true,
      assetId,
      previousState: fromState,
      currentState: targetState,
      message: `${asset.name}: ${fromState} → ${targetState}`,
    };
  }

  /**
   * Force-set an asset's operational state, bypassing normal transition
   * validation. Intended for admin/operator override when the system
   * state is out of sync with physical reality.
   */
  async forceOverrideState(
    assetId: string,
    targetState: EnumEquipmentOperationalState,
    triggeredBy: string,
    reason: string
  ): Promise<TransitionResult> {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true, name: true, operationalState: true },
    });

    if (!asset) {
      throw new NotFoundException(`Asset ${assetId} not found`);
    }

    const fromState =
      asset.operationalState ?? EnumEquipmentOperationalState.Available;

    // Update asset state (no transition validation)
    await this.prisma.asset.update({
      where: { id: assetId },
      data: { operationalState: targetState },
    });

    // Create audit trail with AdminOverride trigger type
    await this.prisma.equipmentStateTransition.create({
      data: {
        assetId,
        fromState,
        toState: targetState,
        triggerType: EnumStateTransitionTrigger.AdminOverride,
        triggeredBy,
        notes: `FORCE OVERRIDE: ${reason}`,
      },
    });

    this.logger.warn(
      `Equipment state FORCE OVERRIDE: ${asset.name} ${fromState} → ${targetState} by ${triggeredBy} — ${reason}`
    );

    return {
      success: true,
      assetId,
      previousState: fromState,
      currentState: targetState,
      message: `${asset.name}: force override ${fromState} → ${targetState}`,
    };
  }

  // ─── Asset State Info ──────────────────────────────────────────────

  async getAssetState(assetId: string): Promise<AssetStateInfo> {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        name: true,
        assetPath: true,
        operationalState: true,
        fermenterAssignments: {
          where: {
            status: {
              not: EnumFermenterAssignmentStatus.Released,
            },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            scheduleOrder: { select: { id: true, name: true } },
          },
        },
        stateTransitions: {
          orderBy: { transitionedAt: "desc" },
          take: 1,
          select: { transitionedAt: true },
        },
      },
    });

    if (!asset) {
      throw new NotFoundException(`Asset ${assetId} not found`);
    }

    const activeAssignment = asset.fermenterAssignments[0] || null;
    const lastTransition = asset.stateTransitions[0] || null;

    return {
      id: asset.id,
      name: asset.name,
      assetPath: asset.assetPath,
      operationalState:
        asset.operationalState ?? EnumEquipmentOperationalState.Available,
      currentAssignment: activeAssignment
        ? this.toAssignmentInfo(activeAssignment)
        : null,
      stateChangedAt: lastTransition?.transitionedAt?.toISOString() ?? null,
    };
  }

  // ─── Area Summary (Roll-up) ────────────────────────────────────────

  async getAreaSummary(areaAssetId: string): Promise<AreaSummary> {
    const area = await this.prisma.asset.findUnique({
      where: { id: areaAssetId },
      select: { id: true, name: true },
    });

    if (!area) {
      throw new NotFoundException(`Area asset ${areaAssetId} not found`);
    }

    const children = await this.prisma.asset.findMany({
      where: { parentId: areaAssetId, isTrackedUnit: true },
      select: {
        id: true,
        name: true,
        assetPath: true,
        operationalState: true,
        fermenterAssignments: {
          where: {
            status: {
              not: EnumFermenterAssignmentStatus.Released,
            },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            scheduleOrder: { select: { id: true, name: true } },
          },
        },
        stateTransitions: {
          orderBy: { transitionedAt: "desc" },
          take: 1,
          select: { transitionedAt: true },
        },
      },
      orderBy: { assetPath: "asc" },
    });

    const stateCounts: Record<string, number> = {};
    const assets: AssetStateInfo[] = [];

    for (const child of children) {
      const state =
        child.operationalState ?? EnumEquipmentOperationalState.Available;
      stateCounts[state] = (stateCounts[state] || 0) + 1;

      const activeAssignment = child.fermenterAssignments[0] || null;
      const lastTransition = child.stateTransitions[0] || null;

      assets.push({
        id: child.id,
        name: child.name,
        assetPath: child.assetPath,
        operationalState: state,
        currentAssignment: activeAssignment
          ? this.toAssignmentInfo(activeAssignment)
          : null,
        stateChangedAt: lastTransition?.transitionedAt?.toISOString() ?? null,
      });
    }

    return {
      areaId: area.id,
      areaName: area.name,
      totalAssets: children.length,
      stateCounts,
      assets,
    };
  }

  /**
   * Find the fermentation area by its asset path.
   * Returns the area asset ID, useful for frontend bootstrap.
   */
  async findAreaByPath(
    path: string
  ): Promise<{ id: string; name: string } | null> {
    const area = await this.prisma.asset.findUnique({
      where: { assetPath: path },
      select: { id: true, name: true },
    });
    return area;
  }

  // ─── Fermenter Assignment ──────────────────────────────────────────

  async assignFermenter(dto: AssignFermenterDto) {
    // Validate asset exists and is available
    const asset = await this.prisma.asset.findUnique({
      where: { id: dto.assetId },
      select: { id: true, name: true, operationalState: true },
    });

    if (!asset) {
      throw new NotFoundException(`Asset ${dto.assetId} not found`);
    }

    const currentState =
      asset.operationalState ?? EnumEquipmentOperationalState.Available;

    if (currentState !== EnumEquipmentOperationalState.Available) {
      throw new BadRequestException(
        `Fermenter ${asset.name} is ${currentState}, must be Available to assign`
      );
    }

    // Validate SO exists
    const so = await this.prisma.scheduleOrder.findUnique({
      where: { id: dto.scheduleOrderId },
      select: { id: true, name: true },
    });

    if (!so) {
      throw new NotFoundException(
        `Schedule order ${dto.scheduleOrderId} not found`
      );
    }

    // Create assignment + transition to Allocated in a transaction
    const [assignment] = await this.prisma.$transaction([
      this.prisma.fermenterAssignment.create({
        data: {
          assetId: dto.assetId,
          scheduleOrderId: dto.scheduleOrderId,
          assignedBy: dto.assignedBy,
          notes: dto.notes,
          status: EnumFermenterAssignmentStatus.Assigned,
        },
        include: {
          scheduleOrder: { select: { id: true, name: true } },
        },
      }),
      this.prisma.asset.update({
        where: { id: dto.assetId },
        data: { operationalState: EnumEquipmentOperationalState.Allocated },
      }),
      this.prisma.equipmentStateTransition.create({
        data: {
          assetId: dto.assetId,
          fromState: EnumEquipmentOperationalState.Available,
          toState: EnumEquipmentOperationalState.Allocated,
          triggerType: EnumStateTransitionTrigger.Manual,
          triggeredBy: dto.assignedBy,
          notes: `Assigned to SO: ${so.name || dto.scheduleOrderId}`,
        },
      }),
    ]);

    this.logger.log(
      `Fermenter ${asset.name} assigned to SO ${so.name} by ${dto.assignedBy}`
    );

    return assignment;
  }

  async updateAssignmentStatus(
    assignmentId: string,
    dto: UpdateAssignmentStatusDto
  ) {
    const assignment = await this.prisma.fermenterAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        asset: { select: { id: true, name: true, operationalState: true } },
        scheduleOrder: { select: { id: true, name: true } },
      },
    });

    if (!assignment) {
      throw new NotFoundException(`Assignment ${assignmentId} not found`);
    }

    // Validate status progression
    const validProgressions: Record<string, string[]> = {
      Assigned: ["Filling"],
      Filling: ["Fermenting"],
      Fermenting: ["Complete"],
      Complete: ["Released"],
    };

    const allowed = validProgressions[assignment.status] || [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Invalid assignment status: ${assignment.status} → ${dto.status}. ` +
          `Allowed: [${allowed.join(", ")}]`
      );
    }

    // Build update data with timestamps
    const updateData: Record<string, unknown> = {
      status: dto.status,
      notes: dto.notes ?? assignment.notes,
    };

    if (dto.status === EnumFermenterAssignmentStatus.Filling) {
      updateData.fillingStartedAt = new Date();
    } else if (dto.status === EnumFermenterAssignmentStatus.Fermenting) {
      updateData.fermentationStartedAt = new Date();
    } else if (dto.status === EnumFermenterAssignmentStatus.Complete) {
      updateData.completedAt = new Date();
    }

    // Transition asset to InUse when filling starts (Allocated → InUse)
    const shouldTransitionToInUse =
      dto.status === EnumFermenterAssignmentStatus.Filling &&
      assignment.asset.operationalState ===
        EnumEquipmentOperationalState.Allocated;

    const updated = await this.prisma.fermenterAssignment.update({
      where: { id: assignmentId },
      data: updateData as any,
      include: {
        scheduleOrder: { select: { id: true, name: true } },
      },
    });

    if (shouldTransitionToInUse) {
      await this.transitionState(
        assignment.asset.id,
        EnumEquipmentOperationalState.InUse,
        dto.triggeredBy,
        `Assignment ${assignmentId} → Filling`
      );
    }

    this.logger.log(
      `Assignment ${assignmentId} (${assignment.asset.name}): ` +
        `${assignment.status} → ${dto.status} by ${dto.triggeredBy}`
    );

    return updated;
  }

  async releaseFermenter(assetId: string, dto: ReleaseFermenterDto) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true, name: true, operationalState: true },
    });

    if (!asset) {
      throw new NotFoundException(`Asset ${assetId} not found`);
    }

    // Find active (non-released) assignment
    const activeAssignment = await this.prisma.fermenterAssignment.findFirst({
      where: {
        assetId,
        status: { not: EnumFermenterAssignmentStatus.Released },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!activeAssignment) {
      throw new BadRequestException(
        `No active assignment found for fermenter ${asset.name}`
      );
    }

    if (
      activeAssignment.status !== EnumFermenterAssignmentStatus.Complete &&
      activeAssignment.status !== EnumFermenterAssignmentStatus.Fermenting
    ) {
      throw new BadRequestException(
        `Assignment must be Complete or Fermenting to release, ` +
          `currently ${activeAssignment.status}`
      );
    }

    const targetState =
      dto.sendToCip !== false
        ? EnumEquipmentOperationalState.InCIP
        : EnumEquipmentOperationalState.Available;

    // Release assignment + transition asset state in a transaction
    await this.prisma.$transaction([
      this.prisma.fermenterAssignment.update({
        where: { id: activeAssignment.id },
        data: {
          status: EnumFermenterAssignmentStatus.Released,
          releasedAt: new Date(),
          notes: dto.notes ?? activeAssignment.notes,
        },
      }),
      this.prisma.asset.update({
        where: { id: assetId },
        data: { operationalState: targetState },
      }),
      this.prisma.equipmentStateTransition.create({
        data: {
          assetId,
          fromState:
            asset.operationalState ?? EnumEquipmentOperationalState.InUse,
          toState: targetState,
          triggerType: EnumStateTransitionTrigger.Manual,
          triggeredBy: dto.releasedBy,
          notes: `Released fermenter${dto.sendToCip !== false ? " → CIP" : ""}`,
        },
      }),
    ]);

    this.logger.log(
      `Fermenter ${asset.name} released by ${dto.releasedBy} → ${targetState}`
    );

    return {
      success: true,
      assetId,
      assetName: asset.name,
      targetState,
      message: `${asset.name} released → ${targetState}`,
    };
  }

  // ─── Active Assignments ────────────────────────────────────────────

  async getActiveAssignments(areaAssetId: string) {
    const children = await this.prisma.asset.findMany({
      where: { parentId: areaAssetId, isTrackedUnit: true },
      select: { id: true },
    });

    const childIds = children.map((c) => c.id);

    return this.prisma.fermenterAssignment.findMany({
      where: {
        assetId: { in: childIds },
        status: { not: EnumFermenterAssignmentStatus.Released },
      },
      include: {
        asset: { select: { id: true, name: true } },
        scheduleOrder: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private toAssignmentInfo(assignment: any): FermenterAssignmentInfo {
    return {
      id: assignment.id,
      scheduleOrderId:
        assignment.scheduleOrder?.id ?? assignment.scheduleOrderId,
      scheduleOrderName: assignment.scheduleOrder?.name ?? null,
      status: assignment.status,
      assignedBy: assignment.assignedBy,
      assignedAt:
        assignment.assignedAt?.toISOString?.() ?? assignment.assignedAt,
      fillingStartedAt: assignment.fillingStartedAt?.toISOString?.() ?? null,
      fermentationStartedAt:
        assignment.fermentationStartedAt?.toISOString?.() ?? null,
      completedAt: assignment.completedAt?.toISOString?.() ?? null,
      notes: assignment.notes,
    };
  }
}
