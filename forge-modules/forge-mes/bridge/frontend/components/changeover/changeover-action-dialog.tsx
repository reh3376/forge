'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { AlertTriangle, Droplets, Download, Rocket, RotateCcw, ArrowRightLeft } from 'lucide-react'
import type { ChangeoverAction } from './changeover-area-card'
import {
  ChangeoverState,
  AREA_LABELS,
  type ChangeoverArea,
  type AreaChangeoverState,
  type NextRecipeResponse,
} from '@/lib/api/changeover-api'

interface ChangeoverActionDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (formData: Record<string, unknown>) => void
  area: ChangeoverArea | null
  action: ChangeoverAction | null
  areaState: AreaChangeoverState | null
  nextRecipe: NextRecipeResponse | null
  effectiveUsername: string
  isLoading: boolean
}

function toLocalDatetimeValue(date: Date): string {
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}

export function ChangeoverActionDialog({
  isOpen,
  onClose,
  onConfirm,
  area,
  action,
  areaState,
  nextRecipe,
  effectiveUsername,
  isLoading,
}: ChangeoverActionDialogProps) {
  // Form state for each action type
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [force, setForce] = useState(false)
  const [cipStartTime, setCipStartTime] = useState('')
  const [cipEndTime, setCipEndTime] = useState('')
  const [cookerNumber, setCookerNumber] = useState('')
  const [targetState, setTargetState] = useState<string>(ChangeoverState.AWAITING_CHANGEOVER)

  // Reset form when dialog opens/closes or action changes
  useEffect(() => {
    if (isOpen) {
      setReason('')
      setNotes('')
      setForce(false)
      setCookerNumber('')
      setTargetState(ChangeoverState.AWAITING_CHANGEOVER)
      // Default CIP times
      const now = new Date()
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
      setCipStartTime(toLocalDatetimeValue(oneHourAgo))
      setCipEndTime(toLocalDatetimeValue(now))
    }
  }, [isOpen, action])

  if (!area || !action) return null

  const areaLabel = AREA_LABELS[area]

  const handleSubmit = () => {
    switch (action) {
      case 'request-changeover':
        onConfirm({
          requestedBy: effectiveUsername,
          force,
          reason: reason || undefined,
          notes: notes || undefined,
        })
        break
      case 'cip-complete':
        onConfirm({
          cipStartTime: new Date(cipStartTime).toISOString(),
          cipEndTime: new Date(cipEndTime).toISOString(),
          reportedBy: effectiveUsername,
        })
        break
      case 'recipe-loaded':
        if (!nextRecipe?.scheduleOrderRecipeInstanceId) return
        onConfirm({
          scheduleOrderRecipeInstanceId: nextRecipe.scheduleOrderRecipeInstanceId,
          sourceUpdatedAt: nextRecipe.sourceUpdatedAt,
          cookerNumber,
          loadedBy: effectiveUsername,
        })
        break
      case 'start-production':
        onConfirm({
          startedBy: effectiveUsername,
          notes: notes || undefined,
        })
        break
      case 'reset-error':
        onConfirm({
          targetState,
          resetBy: effectiveUsername,
          reason: reason || undefined,
        })
        break
    }
  }

  const dialogConfig: Record<ChangeoverAction, { title: string; description: string; icon: React.ReactNode }> = {
    'request-changeover': {
      title: 'Request Changeover',
      description: `Request a changeover for the ${areaLabel} area`,
      icon: <ArrowRightLeft className="h-5 w-5 text-amber-600" />,
    },
    'cip-complete': {
      title: 'CIP Complete',
      description: `Report CIP completion for the ${areaLabel} area`,
      icon: <Droplets className="h-5 w-5 text-blue-600" />,
    },
    'recipe-loaded': {
      title: 'Recipe Loaded',
      description: `Confirm recipe loaded on ${areaLabel} equipment`,
      icon: <Download className="h-5 w-5 text-purple-600" />,
    },
    'start-production': {
      title: 'Start Production',
      description: `Start production in the ${areaLabel} area`,
      icon: <Rocket className="h-5 w-5 text-green-600" />,
    },
    'reset-error': {
      title: 'Reset Error',
      description: `Reset error state for the ${areaLabel} area`,
      icon: <RotateCcw className="h-5 w-5 text-red-600" />,
    },
  }

  const config = dialogConfig[action]

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {config.icon}
            {config.title}
          </DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Request Changeover Form */}
          {action === 'request-changeover' && (
            <>
              <div className="bg-muted/50 p-3 rounded-lg text-sm">
                <div><span className="font-medium">Requested by:</span> {effectiveUsername}</div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">Reason</Label>
                <Textarea
                  id="reason"
                  placeholder="Reason for changeover request..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="force"
                  checked={force}
                  onCheckedChange={(checked) => setForce(checked === true)}
                />
                <div className="grid gap-1.5 leading-none">
                  <Label htmlFor="force" className="text-sm font-medium cursor-pointer">
                    Force changeover
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Skip cook completion validation
                  </p>
                </div>
              </div>
              {force && (
                <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  <AlertDescription className="text-orange-800 dark:text-orange-300 text-xs">
                    Forcing a changeover may interrupt in-progress cook operations.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}

          {/* CIP Complete Form */}
          {action === 'cip-complete' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="cipStartTime">CIP Start Time</Label>
                <Input
                  id="cipStartTime"
                  type="datetime-local"
                  value={cipStartTime}
                  onChange={(e) => setCipStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cipEndTime">CIP End Time</Label>
                <Input
                  id="cipEndTime"
                  type="datetime-local"
                  value={cipEndTime}
                  onChange={(e) => setCipEndTime(e.target.value)}
                />
              </div>
              <div className="bg-muted/50 p-3 rounded-lg text-sm">
                <div><span className="font-medium">Reported by:</span> {effectiveUsername}</div>
              </div>
            </>
          )}

          {/* Recipe Loaded Form */}
          {action === 'recipe-loaded' && (
            <>
              {nextRecipe ? (
                <div className="bg-muted/50 p-3 rounded-lg space-y-1 text-sm">
                  <div className="font-medium mb-1">Next Recipe</div>
                  <div><span className="text-muted-foreground">Recipe:</span> {nextRecipe.recipeName || 'N/A'}</div>
                  <div><span className="text-muted-foreground">Schedule Order:</span> {nextRecipe.scheduleOrderName || 'N/A'}</div>
                </div>
              ) : (
                <Alert variant="destructive" className="py-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    No recipe available for this area. Ensure a schedule order is queued.
                  </AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="cookerNumber">Cooker Number</Label>
                <Input
                  id="cookerNumber"
                  placeholder="e.g., CK-01"
                  value={cookerNumber}
                  onChange={(e) => setCookerNumber(e.target.value)}
                />
              </div>
              <div className="bg-muted/50 p-3 rounded-lg text-sm">
                <div><span className="font-medium">Loaded by:</span> {effectiveUsername}</div>
              </div>
            </>
          )}

          {/* Start Production Form */}
          {action === 'start-production' && (
            <>
              <div className="bg-muted/50 p-3 rounded-lg text-sm">
                <div><span className="font-medium">Started by:</span> {effectiveUsername}</div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="startNotes">Notes</Label>
                <Textarea
                  id="startNotes"
                  placeholder="Additional notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 dark:text-amber-300 text-xs">
                  Starting production will advance the schedule order queue for this area.
                </AlertDescription>
              </Alert>
            </>
          )}

          {/* Reset Error Form */}
          {action === 'reset-error' && (
            <>
              {areaState?.error && (
                <Alert variant="destructive" className="py-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    <span className="font-medium">Current error:</span> {areaState.error}
                  </AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="targetState">Reset to State</Label>
                <Select value={targetState} onValueChange={setTargetState}>
                  <SelectTrigger id="targetState">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ChangeoverState.AWAITING_CHANGEOVER}>
                      Awaiting Changeover
                    </SelectItem>
                    <SelectItem value={ChangeoverState.CIP_COMPLETE}>
                      CIP Complete
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="resetReason">Reason</Label>
                <Textarea
                  id="resetReason"
                  placeholder="Reason for resetting error..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <div className="bg-muted/50 p-3 rounded-lg text-sm">
                <div><span className="font-medium">Reset by:</span> {effectiveUsername}</div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || (action === 'recipe-loaded' && (!nextRecipe?.scheduleOrderRecipeInstanceId || !cookerNumber))}
          >
            {isLoading ? 'Processing...' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
