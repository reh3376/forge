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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { EquipmentStateBadge } from './equipment-state-badge'
import {
  equipmentStateAPI,
  EquipmentOperationalState,
  type AssetStateInfo,
} from '@/lib/api/equipment-state-api'

const ALL_STATES = Object.values(EquipmentOperationalState)

interface AssetStateOverrideDialogProps {
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
  /** Fully loaded asset info — pass null to load by assetId */
  asset: AssetStateInfo | null
  /** If asset is null, load by this ID */
  assetId: string | null
  effectiveUsername: string
}

export function AssetStateOverrideDialog({
  isOpen,
  onClose,
  onComplete,
  asset: assetProp,
  assetId,
  effectiveUsername,
}: AssetStateOverrideDialogProps) {
  const [asset, setAsset] = useState<AssetStateInfo | null>(assetProp)
  const [loading, setLoading] = useState(false)
  const [targetState, setTargetState] = useState<string>('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Load asset if not provided
  const resolvedId = asset?.id || assetId
  const needsLoad = !asset && resolvedId

  // Load on open
  if (isOpen && needsLoad && !loading) {
    setLoading(true)
    equipmentStateAPI.getAssetState(resolvedId!).then((result) => {
      if (result.data) setAsset(result.data)
      setLoading(false)
    })
  }

  // Sync prop changes
  if (assetProp && assetProp !== asset) {
    setAsset(assetProp)
  }

  const handleConfirm = async () => {
    if (!asset || !targetState || !reason.trim()) return
    setSubmitting(true)

    try {
      const result = await equipmentStateAPI.forceOverrideState(asset.id, {
        targetState: targetState as EquipmentOperationalState,
        triggeredBy: effectiveUsername,
        reason: reason.trim(),
      })

      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(result.data?.message || 'State overridden successfully')
        handleClose()
        onComplete()
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Override failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    setTargetState('')
    setReason('')
    if (!assetProp) setAsset(null)
    onClose()
  }

  const isSameState = asset && targetState === asset.operationalState
  const canSubmit = targetState && reason.trim().length >= 3 && !isSameState

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Equipment State Override
          </DialogTitle>
          <DialogDescription>
            Force-set the equipment operational state. This bypasses normal
            transition rules and should only be used for system recovery.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : asset ? (
          <div className="space-y-4 py-2">
            {/* Asset info */}
            <div className="rounded-md border p-3 space-y-2">
              <div className="text-sm font-medium">{asset.name}</div>
              <div className="text-xs text-muted-foreground font-mono">
                {asset.assetPath}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Current:</span>
                <EquipmentStateBadge state={asset.operationalState} size="sm" />
              </div>
              {asset.currentAssignment && (
                <div className="text-xs text-muted-foreground">
                  Assigned to: {asset.currentAssignment.scheduleOrderName} (
                  {asset.currentAssignment.status})
                </div>
              )}
            </div>

            {/* Warning */}
            <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-xs text-amber-800 dark:text-amber-300">
                This is an admin override. The state change will be logged in
                the audit trail. Only use this when the displayed state does not
                match the physical equipment.
              </AlertDescription>
            </Alert>

            {/* Target state */}
            <div className="space-y-2">
              <Label>Set State To</Label>
              <Select value={targetState} onValueChange={setTargetState}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target state..." />
                </SelectTrigger>
                <SelectContent>
                  {ALL_STATES.map((state) => (
                    <SelectItem key={state} value={state}>
                      <div className="flex items-center gap-2">
                        {state}
                        {state === asset.operationalState && (
                          <span className="text-xs text-muted-foreground">
                            (current)
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reason (required) */}
            <div className="space-y-2">
              <Label>
                Reason <span className="text-red-500">*</span>
              </Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe why this override is needed..."
                rows={2}
              />
              {reason.length > 0 && reason.trim().length < 3 && (
                <p className="text-xs text-red-500">
                  Reason must be at least 3 characters
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No asset linked to this area. Use the Equipment State module to
            manage assets directly.
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {asset && (
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={!canSubmit || submitting}
            >
              {submitting ? 'Overriding...' : 'Force Override'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
