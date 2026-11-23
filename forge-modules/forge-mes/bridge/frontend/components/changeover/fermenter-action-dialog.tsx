'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { EquipmentStateBadge } from './equipment-state-badge'
import {
  equipmentStateAPI,
  EquipmentOperationalState,
  FermenterAssignmentStatus,
  type AssetStateInfo,
} from '@/lib/api/equipment-state-api'

type EquipmentAction =
  | 'assign'
  | 'start-fill'
  | 'start-fermentation'
  | 'mark-complete'
  | 'release'
  | 'send-to-maintenance'
  | 'mark-out-of-service'
  | 'return-to-available'
  | 'send-to-cip'
  | 'force-override'

/** Actions that require the fermenter assignment lifecycle */
const ASSIGNMENT_ACTIONS: EquipmentAction[] = [
  'assign',
  'start-fill',
  'start-fermentation',
  'mark-complete',
  'release',
]

const ALL_EQUIPMENT_STATES = Object.values(EquipmentOperationalState)

const actionLabels: Record<EquipmentAction, string> = {
  assign: 'Assign Schedule Order',
  'start-fill': 'Start Filling',
  'start-fermentation': 'Start Fermentation',
  'mark-complete': 'Mark Complete',
  release: 'Release',
  'send-to-maintenance': 'Send to Maintenance',
  'mark-out-of-service': 'Mark Out of Service',
  'return-to-available': 'Return to Available',
  'send-to-cip': 'Send to CIP',
  'force-override': 'Force Override State',
}

interface FermenterActionDialogProps {
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
  asset: AssetStateInfo
  effectiveUsername: string
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
  scheduleOrderQueues: Array<{
    queueIndex?: number | null
    scheduleOrder?: { id: string; name?: string | null; status?: string | null } | null
  }>
  /** When false, assignment-related actions are hidden (non-fermenter equipment) */
  enableAssignment?: boolean
  /** Callback to open the SO edit modal for the given schedule order ID */
  onEditScheduleOrder?: ((soId: string) => void) | undefined
}

function getAvailableActions(
  asset: AssetStateInfo,
  enableAssignment: boolean
): EquipmentAction[] {
  const state = asset.operationalState
  const assignmentStatus = asset.currentAssignment?.status as
    | FermenterAssignmentStatus
    | undefined

  const actions: EquipmentAction[] = []

  switch (state) {
    case EquipmentOperationalState.Available:
      if (enableAssignment) actions.push('assign')
      actions.push('send-to-maintenance', 'mark-out-of-service')
      break
    case EquipmentOperationalState.Allocated:
      if (enableAssignment && assignmentStatus === FermenterAssignmentStatus.Assigned) {
        actions.push('start-fill')
      }
      actions.push('return-to-available')
      break
    case EquipmentOperationalState.InUse:
      if (enableAssignment) {
        if (assignmentStatus === FermenterAssignmentStatus.Filling) {
          actions.push('start-fermentation')
        } else if (assignmentStatus === FermenterAssignmentStatus.Fermenting) {
          actions.push('mark-complete')
        } else if (assignmentStatus === FermenterAssignmentStatus.Complete) {
          actions.push('release')
        }
        actions.push('release')
      }
      actions.push('send-to-cip', 'send-to-maintenance', 'return-to-available')
      break
    case EquipmentOperationalState.Changeover:
      actions.push('return-to-available', 'send-to-cip')
      break
    case EquipmentOperationalState.InCIP:
      actions.push('return-to-available', 'send-to-maintenance')
      break
    case EquipmentOperationalState.InMaintenance:
      actions.push('return-to-available', 'mark-out-of-service')
      break
    case EquipmentOperationalState.OutOfService:
      actions.push('return-to-available', 'send-to-maintenance')
      break
  }

  // Always allow force override as last option
  actions.push('force-override')

  // Deduplicate
  return [...new Set(actions)]
}

export function FermenterActionDialog({
  isOpen,
  onClose,
  onComplete,
  asset,
  effectiveUsername,
  isLoading,
  setIsLoading,
  scheduleOrderQueues,
  enableAssignment = true,
  onEditScheduleOrder,
}: FermenterActionDialogProps) {
  const [selectedAction, setSelectedAction] = useState<EquipmentAction | null>(null)
  const [selectedSOId, setSelectedSOId] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [forceOverrideTarget, setForceOverrideTarget] = useState<string>('')

  const availableActions = getAvailableActions(asset, enableAssignment)

  // Get SOs for the assign dropdown — only Scheduled/InProgress or at queue front
  const assignableSOs = scheduleOrderQueues
    .filter((q) => {
      if (!q.scheduleOrder?.id) return false
      const status = q.scheduleOrder.status
      if (status === 'Scheduled' || status === 'InProgress') return true
      if (q.queueIndex != null && q.queueIndex <= 0) return true
      return false
    })
    .map((q) => ({
      id: q.scheduleOrder!.id,
      name: q.scheduleOrder?.name || q.scheduleOrder!.id,
    }))

  const handleConfirm = async () => {
    const action = selectedAction
    if (!action) return

    setIsLoading(true)

    try {
      let result

      switch (action) {
        case 'assign': {
          if (!selectedSOId) {
            toast.error('Please select a schedule order')
            setIsLoading(false)
            return
          }
          result = await equipmentStateAPI.assignFermenter({
            assetId: asset.id,
            scheduleOrderId: selectedSOId,
            assignedBy: effectiveUsername,
            notes: notes || undefined,
          })
          break
        }
        case 'start-fill': {
          if (!asset.currentAssignment) break
          result = await equipmentStateAPI.updateAssignmentStatus(
            asset.currentAssignment.id,
            {
              status: FermenterAssignmentStatus.Filling,
              triggeredBy: effectiveUsername,
              notes: notes || undefined,
            }
          )
          break
        }
        case 'start-fermentation': {
          if (!asset.currentAssignment) break
          result = await equipmentStateAPI.updateAssignmentStatus(
            asset.currentAssignment.id,
            {
              status: FermenterAssignmentStatus.Fermenting,
              triggeredBy: effectiveUsername,
              notes: notes || undefined,
            }
          )
          break
        }
        case 'mark-complete': {
          if (!asset.currentAssignment) break
          result = await equipmentStateAPI.updateAssignmentStatus(
            asset.currentAssignment.id,
            {
              status: FermenterAssignmentStatus.Complete,
              triggeredBy: effectiveUsername,
              notes: notes || undefined,
            }
          )
          break
        }
        case 'release': {
          result = await equipmentStateAPI.releaseFermenter(asset.id, {
            releasedBy: effectiveUsername,
            sendToCip: true,
            notes: notes || undefined,
          })
          break
        }
        case 'send-to-maintenance': {
          result = await equipmentStateAPI.transitionState(asset.id, {
            targetState: EquipmentOperationalState.InMaintenance,
            triggeredBy: effectiveUsername,
            notes: notes || undefined,
          })
          break
        }
        case 'mark-out-of-service': {
          result = await equipmentStateAPI.transitionState(asset.id, {
            targetState: EquipmentOperationalState.OutOfService,
            triggeredBy: effectiveUsername,
            notes: notes || undefined,
          })
          break
        }
        case 'return-to-available': {
          result = await equipmentStateAPI.transitionState(asset.id, {
            targetState: EquipmentOperationalState.Available,
            triggeredBy: effectiveUsername,
            notes: notes || undefined,
          })
          break
        }
        case 'send-to-cip': {
          result = await equipmentStateAPI.transitionState(asset.id, {
            targetState: EquipmentOperationalState.InCIP,
            triggeredBy: effectiveUsername,
            notes: notes || undefined,
          })
          break
        }
        case 'force-override': {
          if (!forceOverrideTarget || !notes.trim()) {
            toast.error('Target state and reason are required for force override')
            setIsLoading(false)
            return
          }
          result = await equipmentStateAPI.forceOverrideState(asset.id, {
            targetState: forceOverrideTarget as EquipmentOperationalState,
            triggeredBy: effectiveUsername,
            reason: notes.trim(),
          })
          break
        }
      }

      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(`${asset.name}: ${actionLabels[action]} completed`)
        setSelectedAction(null)
        setSelectedSOId('')
        setNotes('')
        setForceOverrideTarget('')
        onComplete()
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setSelectedAction(null)
    setSelectedSOId('')
    setNotes('')
    setForceOverrideTarget('')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{asset.name}</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            Current state:{' '}
            <EquipmentStateBadge state={asset.operationalState} size="sm" />
            {asset.currentAssignment && (
              <span className="text-xs">
                | SO: {asset.currentAssignment.scheduleOrderName} (
                {asset.currentAssignment.status})
                {onEditScheduleOrder && (
                  <button
                    type="button"
                    className="ml-1.5 text-primary underline underline-offset-2 hover:text-primary/80"
                    onClick={() => {
                      onEditScheduleOrder(asset.currentAssignment!.scheduleOrderId)
                      handleClose()
                    }}
                  >
                    Edit
                  </button>
                )}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Action selection */}
          {availableActions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No actions available in current state.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Action</Label>
                <Select
                  value={selectedAction || ''}
                  onValueChange={(v) => setSelectedAction(v as EquipmentAction)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an action..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableActions.map((action) => (
                      <SelectItem key={action} value={action}>
                        {actionLabels[action]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* SO selector for assign action */}
              {selectedAction === 'assign' && (
                <div className="space-y-2">
                  <Label>Schedule Order</Label>
                  <Select value={selectedSOId} onValueChange={setSelectedSOId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select schedule order..." />
                    </SelectTrigger>
                    <SelectContent>
                      {assignableSOs.map((so) => (
                        <SelectItem key={so.id} value={so.id}>
                          {so.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Force override: target state selector */}
              {selectedAction === 'force-override' && (
                <div className="space-y-2">
                  <Label>Target State</Label>
                  <Select
                    value={forceOverrideTarget}
                    onValueChange={setForceOverrideTarget}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select target state..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_EQUIPMENT_STATES.map((state) => (
                        <SelectItem key={state} value={state}>
                          {state}
                          {state === asset.operationalState ? ' (current)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Notes / Reason */}
              {selectedAction && (
                <div className="space-y-2">
                  <Label>
                    {selectedAction === 'force-override'
                      ? <>Reason <span className="text-red-500">*</span></>
                      : 'Notes (optional)'}
                  </Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={
                      selectedAction === 'force-override'
                        ? 'Describe why this override is needed...'
                        : 'Add notes...'
                    }
                    rows={2}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {selectedAction && (
            <Button
              onClick={handleConfirm}
              disabled={isLoading}
              variant={selectedAction === 'force-override' ? 'destructive' : 'default'}
            >
              {isLoading
                ? 'Processing...'
                : selectedAction === 'force-override'
                  ? 'Force Override'
                  : 'Confirm'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
