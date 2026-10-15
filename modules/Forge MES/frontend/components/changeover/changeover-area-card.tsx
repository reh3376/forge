'use client'

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, Clock, Settings } from 'lucide-react'
import { ChangeoverStateBadge } from './changeover-state-badge'
import {
  ChangeoverState,
  AREA_LABELS,
  type AreaChangeoverState,
  type ChangeoverArea,
} from '@/lib/api/changeover-api'

export type ChangeoverAction =
  | 'request-changeover'
  | 'cip-complete'
  | 'recipe-loaded'
  | 'start-production'
  | 'reset-error'

interface ChangeoverAreaCardProps {
  areaState: AreaChangeoverState
  canManageChangeover: boolean
  onAction: (area: ChangeoverArea, action: ChangeoverAction) => void
  onEquipmentDetail?: (area: ChangeoverArea, assetId: string | null) => void
  isLoading: boolean
  soNameLookup: Record<string, string>
}

function getTimeInState(enteredAt: string): string {
  const ms = Date.now() - new Date(enteredAt).getTime()
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours < 24) return `${hours}h ${remainingMinutes}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

function getActionConfig(
  state: ChangeoverState
): { action: ChangeoverAction; label: string; variant: 'default' | 'outline' | 'destructive'; className: string } | null {
  switch (state) {
    case ChangeoverState.PRODUCTION:
    case ChangeoverState.COOK_COMPLETE:
      return {
        action: 'request-changeover',
        label: 'Request Changeover',
        variant: 'default',
        className: 'bg-amber-600 hover:bg-amber-700 text-white',
      }
    case ChangeoverState.AWAITING_CHANGEOVER:
    case ChangeoverState.CIP_IN_PROGRESS:
      return {
        action: 'cip-complete',
        label: 'CIP Complete',
        variant: 'default',
        className: 'bg-blue-600 hover:bg-blue-700 text-white',
      }
    case ChangeoverState.RECIPE_LOADING:
      return {
        action: 'recipe-loaded',
        label: 'Recipe Loaded',
        variant: 'default',
        className: 'bg-purple-600 hover:bg-purple-700 text-white',
      }
    case ChangeoverState.READY_TO_START:
      return {
        action: 'start-production',
        label: 'Start Production',
        variant: 'default',
        className: 'bg-green-600 hover:bg-green-700 text-white text-base font-semibold py-2.5',
      }
    case ChangeoverState.ERROR:
      return {
        action: 'reset-error',
        label: 'Reset Error',
        variant: 'outline',
        className: 'border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20',
      }
    // CIP_COMPLETE and RECIPE_LOADED auto-advance — no button
    default:
      return null
  }
}

export function ChangeoverAreaCard({
  areaState,
  canManageChangeover,
  onAction,
  onEquipmentDetail,
  isLoading,
  soNameLookup,
}: ChangeoverAreaCardProps) {
  const actionConfig = getActionConfig(areaState.state)
  const activeSoName = areaState.activeSOId ? soNameLookup[areaState.activeSOId] || areaState.activeSOId : null
  const nextSoName = areaState.nextSOId ? soNameLookup[areaState.nextSOId] || areaState.nextSOId : null

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-lg">{AREA_LABELS[areaState.area]}</CardTitle>
            {canManageChangeover && onEquipmentDetail && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                title="Equipment state details"
                onClick={() => onEquipmentDetail(areaState.area, areaState.assetId)}
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <ChangeoverStateBadge state={areaState.state} size="sm" />
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-3 pb-3">
        {/* Active / Next SO */}
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <span className="text-muted-foreground">Active SO:</span>
          <span className="text-foreground truncate">{activeSoName || 'None'}</span>
          <span className="text-muted-foreground">Next SO:</span>
          <span className="text-foreground truncate">{nextSoName || 'None'}</span>
        </div>

        {/* Time in state */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>In state for {getTimeInState(areaState.enteredAt)}</span>
        </div>

        {/* Error message */}
        {areaState.state === ChangeoverState.ERROR && areaState.error && (
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">{areaState.error}</AlertDescription>
          </Alert>
        )}
      </CardContent>

      {/* Action button */}
      {canManageChangeover && actionConfig && (
        <CardFooter className="pt-0 pb-4">
          <Button
            className={`w-full ${actionConfig.className}`}
            variant={actionConfig.variant}
            disabled={isLoading}
            onClick={() => onAction(areaState.area, actionConfig.action)}
          >
            {isLoading ? 'Processing...' : actionConfig.label}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
