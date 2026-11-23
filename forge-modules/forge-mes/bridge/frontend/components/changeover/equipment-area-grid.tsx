'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { RefreshCw, Clock } from 'lucide-react'
import { EquipmentStateDot, equipmentStateConfig } from './equipment-state-badge'
import { FermenterActionDialog } from './fermenter-action-dialog'
import {
  equipmentStateAPI,
  EquipmentOperationalState,
  FermenterAssignmentStatus,
  type AreaSummary,
  type AssetStateInfo,
} from '@/lib/api/equipment-state-api'

const POLL_INTERVAL_MS = 10_000

const borderColorByState: Record<EquipmentOperationalState, string> = {
  [EquipmentOperationalState.Available]:
    'border-green-300 dark:border-green-700',
  [EquipmentOperationalState.Allocated]:
    'border-amber-300 dark:border-amber-700',
  [EquipmentOperationalState.InUse]: 'border-blue-300 dark:border-blue-700',
  [EquipmentOperationalState.Changeover]:
    'border-purple-300 dark:border-purple-700',
  [EquipmentOperationalState.InCIP]: 'border-cyan-300 dark:border-cyan-700',
  [EquipmentOperationalState.InMaintenance]:
    'border-orange-300 dark:border-orange-700',
  [EquipmentOperationalState.OutOfService]:
    'border-red-300 dark:border-red-700',
}

const bgColorByState: Record<EquipmentOperationalState, string> = {
  [EquipmentOperationalState.Available]:
    'bg-green-50/50 dark:bg-green-950/20',
  [EquipmentOperationalState.Allocated]:
    'bg-amber-50/50 dark:bg-amber-950/20',
  [EquipmentOperationalState.InUse]: 'bg-blue-50/50 dark:bg-blue-950/20',
  [EquipmentOperationalState.Changeover]:
    'bg-purple-50/50 dark:bg-purple-950/20',
  [EquipmentOperationalState.InCIP]: 'bg-cyan-50/50 dark:bg-cyan-950/20',
  [EquipmentOperationalState.InMaintenance]:
    'bg-orange-50/50 dark:bg-orange-950/20',
  [EquipmentOperationalState.OutOfService]:
    'bg-red-50/50 dark:bg-red-950/20',
}

/** Extract a compact display name from the full asset name */
function getShortName(name: string): string {
  // Equipment IDs like T-301, C-401, S-430, HEX-2040A
  const idMatch = name.match(/^([A-Z]+-?\d+[A-Z]?)$/)
  if (idMatch?.[1]) return idMatch[1]
  // Human-readable names (e.g. "Cooker 1", "Blend Tank 2", "Beer Well") — use as-is
  if (/[a-z]/.test(name)) return name
  // Names with embedded IDs like "Fermentation Tank F001"
  const embeddedMatch = name.match(/([A-Z]-?\d+[A-Z]?)/)
  if (embeddedMatch?.[1]) return embeddedMatch[1]
  return name
}

function formatTimeSince(isoDate: string | null): string {
  if (!isoDate) return ''
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

function getAssignmentLabel(asset: AssetStateInfo): string | null {
  if (!asset.currentAssignment) return null
  const soName = asset.currentAssignment.scheduleOrderName
  const status = asset.currentAssignment.status
  if (soName && status && status !== FermenterAssignmentStatus.Assigned) {
    return `${soName} (${status})`
  }
  return soName || null
}

interface EquipmentAreaGridProps {
  /** Asset path of the parent area (e.g. 'WH/WHK01/Distillery01/Fermentation01') */
  areaPath: string
  /** Label shown when no assets are found */
  emptyLabel?: string | undefined
  /** Enable SO-to-asset assignment workflow (fermenters) */
  enableAssignment?: boolean | undefined
  /** Responsive grid columns: [mobile, tablet, desktop] */
  gridCols?: [number, number, number] | undefined
  canManageChangeover: boolean
  effectiveUsername: string
  scheduleOrderQueues: Array<{
    queueIndex?: number | null
    scheduleOrder?: { id: string; name?: string | null; status?: string | null } | null
  }>
  /** Callback to open the SO edit modal for the given schedule order ID */
  onEditScheduleOrder?: ((soId: string) => void) | undefined
}

const gridColsClasses: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
  7: 'grid-cols-7',
  8: 'grid-cols-8',
}

function buildGridClass(cols: [number, number, number]): string {
  return `grid ${gridColsClasses[cols[0]] || 'grid-cols-2'} sm:${gridColsClasses[cols[1]] || 'sm:grid-cols-4'} lg:${gridColsClasses[cols[2]] || 'lg:grid-cols-7'} gap-2`
}

export function EquipmentAreaGrid({
  areaPath,
  emptyLabel = 'No equipment found for this area.',
  enableAssignment = false,
  gridCols = [2, 4, 7],
  canManageChangeover,
  effectiveUsername,
  scheduleOrderQueues,
  onEditScheduleOrder,
}: EquipmentAreaGridProps) {
  const [areaSummary, setAreaSummary] = useState<AreaSummary | null>(null)
  const [areaId, setAreaId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [timeSinceUpdate, setTimeSinceUpdate] = useState('')

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<AssetStateInfo | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const pollRef = useRef<NodeJS.Timeout | null>(null)

  // Resolve area ID on first load
  useEffect(() => {
    setAreaId(null)
    setAreaSummary(null)
    setLoading(true)
    equipmentStateAPI.findAreaByPath(areaPath).then((result) => {
      if (result.data) {
        setAreaId(result.data.id)
      } else {
        console.error(`Failed to find area ${areaPath}:`, result.error)
        setLoading(false)
      }
    })
  }, [areaPath])

  const fetchSummary = useCallback(async () => {
    if (!areaId) return
    const result = await equipmentStateAPI.getAreaSummary(areaId)
    if (result.data) {
      setAreaSummary(result.data)
      setLastUpdated(new Date())
    } else {
      console.error('Failed to fetch area summary:', result.error)
    }
    setLoading(false)
  }, [areaId])

  // Fetch + poll once areaId is resolved
  useEffect(() => {
    if (!areaId) return
    fetchSummary()
    pollRef.current = setInterval(fetchSummary, POLL_INTERVAL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [areaId, fetchSummary])

  // Update "time since" label
  useEffect(() => {
    const tick = () => {
      if (!lastUpdated) return
      const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000)
      if (seconds < 60) setTimeSinceUpdate(`${seconds}s ago`)
      else setTimeSinceUpdate(`${Math.floor(seconds / 60)}m ago`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [lastUpdated])

  const handleTileClick = (asset: AssetStateInfo) => {
    if (!canManageChangeover) return
    setSelectedAsset(asset)
    setDialogOpen(true)
  }

  const handleActionComplete = async () => {
    setDialogOpen(false)
    setSelectedAsset(null)
    await fetchSummary()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-center">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary mx-auto mb-2" />
          <p className="text-muted-foreground text-xs">Loading equipment...</p>
        </div>
      </div>
    )
  }

  if (!areaSummary || areaSummary.assets.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <p className="text-sm">{emptyLabel}</p>
      </div>
    )
  }

  // Build summary bar counts
  const summaryItems = Object.entries(areaSummary.stateCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([state, count]) => {
      const config = equipmentStateConfig[state as EquipmentOperationalState]
      return { state, count, label: config?.label || state }
    })

  return (
    <div className="space-y-2">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          {summaryItems.map(({ state, count, label }) => (
            <div key={state} className="flex items-center gap-1.5 text-xs">
              <EquipmentStateDot
                state={state as EquipmentOperationalState}
                size="sm"
              />
              <span className="text-muted-foreground">
                {count} {label}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3 inline mr-1" />
            {timeSinceUpdate || '...'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchSummary()}
            className="h-6 w-6 p-0"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Equipment tiles grid */}
      <div className={buildGridClass(gridCols)}>
        {areaSummary.assets.map((asset) => {
          const state = asset.operationalState
          const assignmentLabel = enableAssignment ? getAssignmentLabel(asset) : null
          const timeInState = formatTimeSince(asset.stateChangedAt)

          return (
            <button
              key={asset.id}
              onClick={() => handleTileClick(asset)}
              disabled={!canManageChangeover}
              className={cn(
                'relative rounded-lg border-2 p-2 text-left transition-all',
                'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/50',
                'disabled:cursor-default disabled:hover:shadow-none',
                borderColorByState[state],
                bgColorByState[state]
              )}
            >
              {/* Name + state dot */}
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-semibold text-sm truncate mr-1">
                  {getShortName(asset.name)}
                </span>
                <EquipmentStateDot state={state} size="sm" />
              </div>

              {/* Assignment / state label */}
              <div className="min-h-[1.25rem]">
                {assignmentLabel ? (
                  <p className="text-xs text-foreground/80 truncate">
                    {assignmentLabel}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground truncate">
                    {equipmentStateConfig[state]?.label}
                  </p>
                )}
              </div>

              {/* Time in state */}
              {timeInState && (
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                  {timeInState}
                </p>
              )}
            </button>
          )
        })}
      </div>

      {/* Action dialog */}
      {selectedAsset && (
        <FermenterActionDialog
          isOpen={dialogOpen}
          onClose={() => {
            setDialogOpen(false)
            setSelectedAsset(null)
          }}
          onComplete={handleActionComplete}
          asset={selectedAsset}
          effectiveUsername={effectiveUsername}
          isLoading={actionLoading}
          setIsLoading={setActionLoading}
          scheduleOrderQueues={scheduleOrderQueues}
          enableAssignment={enableAssignment}
          onEditScheduleOrder={onEditScheduleOrder}
        />
      )}
    </div>
  )
}
