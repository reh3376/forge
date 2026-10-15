'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw, Clock, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { ChangeoverAreaCard, type ChangeoverAction } from './changeover-area-card'
import { ChangeoverActionDialog } from './changeover-action-dialog'
import { AssetStateOverrideDialog } from './asset-state-override-dialog'
import { EquipmentAreaGrid } from './equipment-area-grid'
import {
  changeoverAPI,
  type AreaChangeoverState,
  type ChangeoverArea,
  type NextRecipeResponse,
} from '@/lib/api/changeover-api'
import { UnifiedScheduleOrderEditModal } from '@/components/schedule/UnifiedScheduleOrderEditModal'
import type { ScheduleOrderQueue } from '@/types'

const POLL_INTERVAL_MS = 10_000

// ─── Area Sections (production flow order) ───────────────────────

interface AreaSection {
  /** Unique key for the section */
  key: string
  /** Display label */
  label: string
  /** Changeover state machine area (cooker/barreling) — if present, shows ChangeoverAreaCard */
  changeoverArea?: ChangeoverArea | undefined
  /** Equipment area path — if present, shows EquipmentAreaGrid */
  equipmentAreaPath?: string | undefined
  /** Enable SO-to-asset assignment in the grid (fermentation only) */
  enableAssignment?: boolean | undefined
  /** Responsive grid columns: [mobile, tablet, desktop] */
  gridCols?: [number, number, number] | undefined
}

const AREA_SECTIONS: AreaSection[] = [
  {
    key: 'cooking',
    label: 'Cooking',
    changeoverArea: 'cooker',
    equipmentAreaPath: 'WH/WHK01/Distillery01/Mashing01',
    gridCols: [2, 2, 2],
  },
  {
    key: 'fermentation',
    label: 'Fermentation',
    equipmentAreaPath: 'WH/WHK01/Distillery01/Fermentation01',
    enableAssignment: true,
    gridCols: [2, 4, 8],
  },
  {
    key: 'distillation',
    label: 'Distillation',
    equipmentAreaPath: 'WH/WHK01/Distillery01/Distillation01',
    gridCols: [2, 2, 2],
  },
  {
    key: 'distillate-storage',
    label: 'Distillate Storage',
    equipmentAreaPath: 'WH/WHK01/Distillery01/DistillateStorage01',
    gridCols: [2, 3, 3],
  },
  {
    key: 'blending',
    label: 'Blending',
    equipmentAreaPath: 'WH/WHK01/Distillery01/Blending01',
    gridCols: [2, 2, 2],
  },
  {
    key: 'barreling',
    label: 'Barreling',
    changeoverArea: 'barreling',
  },
]

// ─── Component ───────────────────────────────────────────────────

interface ChangeoverPanelProps {
  canManageChangeover: boolean
  effectiveUsername: string
  onQueueChanged: () => void
  scheduleOrderQueues: ScheduleOrderQueue[]
}

export function ChangeoverPanel({
  canManageChangeover,
  effectiveUsername,
  onQueueChanged,
  scheduleOrderQueues,
}: ChangeoverPanelProps) {
  const [areaStates, setAreaStates] = useState<Record<string, AreaChangeoverState>>({})
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [timeSinceUpdate, setTimeSinceUpdate] = useState('')

  // Collapsible state — all sections expanded by default
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // Changeover action dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeArea, setActiveArea] = useState<ChangeoverArea | null>(null)
  const [activeAction, setActiveAction] = useState<ChangeoverAction | null>(null)
  const [activeAreaState, setActiveAreaState] = useState<AreaChangeoverState | null>(null)
  const [nextRecipe, setNextRecipe] = useState<NextRecipeResponse | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Equipment state override dialog state
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false)
  const [overrideAssetId, setOverrideAssetId] = useState<string | null>(null)

  // SO edit modal state
  const [editSOQueue, setEditSOQueue] = useState<ScheduleOrderQueue | null>(null)

  const pollRef = useRef<NodeJS.Timeout | null>(null)

  // Build SO name lookup from queue data
  const soNameLookup: Record<string, string> = {}
  for (const queueItem of scheduleOrderQueues) {
    if (queueItem.scheduleOrder?.id && queueItem.scheduleOrder?.name) {
      soNameLookup[queueItem.scheduleOrder.id] = queueItem.scheduleOrder.name
    }
  }

  const toggleSection = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const fetchStates = useCallback(async () => {
    const result = await changeoverAPI.getAllAreaStates()
    if (result.data) {
      setAreaStates(result.data)
      setLastUpdated(new Date())
    } else if (result.error) {
      console.error('Failed to fetch changeover states:', result.error)
    }
    setLoading(false)
  }, [])

  // Initial fetch + polling
  useEffect(() => {
    fetchStates()
    pollRef.current = setInterval(fetchStates, POLL_INTERVAL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [fetchStates])

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

  const handleAction = async (area: ChangeoverArea, action: ChangeoverAction) => {
    const state = areaStates[area] || null

    // Pre-fetch next recipe for recipe-loaded action
    if (action === 'recipe-loaded') {
      const recipeResult = await changeoverAPI.getNextRecipe(area)
      setNextRecipe(recipeResult.data || null)
    } else {
      setNextRecipe(null)
    }

    setActiveArea(area)
    setActiveAction(action)
    setActiveAreaState(state)
    setDialogOpen(true)
  }

  const handleEquipmentDetail = (_area: ChangeoverArea, assetId: string | null) => {
    setOverrideAssetId(assetId)
    setOverrideDialogOpen(true)
  }

  const handleEditScheduleOrder = (soId: string) => {
    const match = scheduleOrderQueues.find((q) => q.scheduleOrder?.id === soId) || null
    setEditSOQueue(match)
  }

  const handleConfirm = async (formData: Record<string, unknown>) => {
    if (!activeArea || !activeAction) return
    setActionLoading(true)

    try {
      let result
      switch (activeAction) {
        case 'request-changeover':
          result = await changeoverAPI.requestChangeover(activeArea, formData as any)
          break
        case 'cip-complete':
          result = await changeoverAPI.cipComplete(activeArea, formData as any)
          break
        case 'recipe-loaded':
          result = await changeoverAPI.recipeLoaded(activeArea, formData as any)
          break
        case 'start-production':
          result = await changeoverAPI.startProduction(activeArea, formData as any)
          break
        case 'reset-error':
          result = await changeoverAPI.resetError(activeArea, formData as any)
          break
      }

      if (result?.error) {
        toast.error(result.error)
      } else if (result?.data) {
        toast.success(result.data.message || 'Transition successful')
        // Re-fetch states immediately
        await fetchStates()
        // If start-production, also notify parent to refresh queue
        if (activeAction === 'start-production') {
          onQueueChanged()
        }
      }

      setDialogOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading changeover states...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Last updated {timeSinceUpdate || '...'}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchStates()}
          className="gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Area sections */}
      {AREA_SECTIONS.map((section) => {
        const isCollapsed = !!collapsed[section.key]
        const changeoverState = section.changeoverArea
          ? areaStates[section.changeoverArea]
          : undefined

        return (
          <div key={section.key} className="border rounded-lg">
            {/* Collapsible header */}
            <button
              type="button"
              onClick={() => toggleSection(section.key)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-muted/50 transition-colors rounded-t-lg"
            >
              <div className="flex items-center gap-2">
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    isCollapsed && '-rotate-90'
                  )}
                />
                <h3 className="text-sm font-semibold text-foreground">
                  {section.label}
                </h3>
              </div>
            </button>

            {/* Collapsible content */}
            {!isCollapsed && (
              <div className="px-4 pb-4 space-y-3">
                {/* Changeover state machine card */}
                {section.changeoverArea && (
                  <div className="max-w-md">
                    {changeoverState ? (
                      <ChangeoverAreaCard
                        areaState={changeoverState}
                        canManageChangeover={canManageChangeover}
                        onAction={handleAction}
                        onEquipmentDetail={handleEquipmentDetail}
                        isLoading={actionLoading && activeArea === section.changeoverArea}
                        soNameLookup={soNameLookup}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No changeover state loaded for {section.label}.
                      </p>
                    )}
                  </div>
                )}

                {/* Equipment area grid */}
                {section.equipmentAreaPath && (
                  <EquipmentAreaGrid
                    areaPath={section.equipmentAreaPath}
                    enableAssignment={section.enableAssignment}
                    gridCols={section.gridCols}
                    canManageChangeover={canManageChangeover}
                    effectiveUsername={effectiveUsername}
                    scheduleOrderQueues={scheduleOrderQueues}
                    onEditScheduleOrder={handleEditScheduleOrder}
                  />
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Changeover action dialog */}
      <ChangeoverActionDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConfirm={handleConfirm}
        area={activeArea}
        action={activeAction}
        areaState={activeAreaState}
        nextRecipe={nextRecipe}
        effectiveUsername={effectiveUsername}
        isLoading={actionLoading}
      />

      {/* Equipment state override dialog */}
      <AssetStateOverrideDialog
        isOpen={overrideDialogOpen}
        onClose={() => {
          setOverrideDialogOpen(false)
          setOverrideAssetId(null)
        }}
        onComplete={() => fetchStates()}
        asset={null}
        assetId={overrideAssetId}
        effectiveUsername={effectiveUsername}
      />

      {/* Schedule Order edit modal (opened from equipment grid) */}
      <UnifiedScheduleOrderEditModal
        isOpen={!!editSOQueue}
        onClose={() => setEditSOQueue(null)}
        orderQueue={editSOQueue}
        onSave={async () => {
          setEditSOQueue(null)
          await fetchStates()
          onQueueChanged()
        }}
      />
    </div>
  )
}
