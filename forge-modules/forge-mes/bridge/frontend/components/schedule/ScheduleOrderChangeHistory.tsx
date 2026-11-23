'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Clock, User, Package, Settings, Beaker, Loader2, History } from 'lucide-react'
import { cn } from '@/lib/utils'

// Types
interface FieldChange {
  old: any
  new: any
}

interface BomItemChange {
  id: string
  itemName: string
  changes: Record<string, FieldChange>
}

interface ParameterChange {
  id: string
  parameterName: string
  changes: Record<string, FieldChange>
}

interface MashingStepChange {
  id: string
  stepIndex?: number
  stepType?: string
  changes: Record<string, FieldChange>
}

interface ChangesSummary {
  bomItemsModified: number
  parametersModified: number
  mashingStepsModified: number
}

interface ComponentChanges {
  bomItems: BomItemChange[]
  parameters: ParameterChange[]
  mashingSteps: MashingStepChange[]
}

interface ChangeHistoryEntry {
  id: string
  timestamp: string
  userId: string
  user?: {
    username: string
    firstName?: string
    lastName?: string
  }
  changesSummary: ChangesSummary
  changes: ComponentChanges
}

interface ScheduleOrderChangeHistoryProps {
  scheduleOrderId: string
  limit?: number
  compact?: boolean
}

const CHANGE_HISTORY_QUERY = `
  query GetScheduleOrderChangeHistory($scheduleOrderId: String!, $limit: Int) {
    scheduleOrderRecipeChangeHistory(scheduleOrderId: $scheduleOrderId, limit: $limit) {
      id
      timestamp
      userId
      user {
        username
        firstName
        lastName
      }
      changesSummary {
        bomItemsModified
        parametersModified
        mashingStepsModified
      }
      changes {
        bomItems {
          id
          itemName
          changes
        }
        parameters {
          id
          parameterName
          changes
        }
        mashingSteps {
          id
          stepIndex
          stepType
          changes
        }
      }
    }
  }
`

// Format value for display
function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return 'N/A'
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }
  if (typeof value === 'number') {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
  return String(value)
}

// Format field name for display
function formatFieldName(field: string): string {
  const fieldNames: Record<string, string> = {
    quantity: 'Quantity',
    recipeNumericalSetpoint: 'Setpoint',
    recipeSetpointBooleanValue: 'Boolean Value',
    recipeSetpointUpperLimit: 'Upper Limit',
    recipeSetpointLowerLimit: 'Lower Limit',
    index: 'Step Order',
    stepTime: 'Step Time',
    temperatureSetpoint: 'Temperature SP',
    heatEnabled: 'Heat Enabled',
    heatTempSp: 'Heat Temp SP',
    coolEnabled: 'Cool Enabled',
    coolTempSp: 'Cool Temp SP',
    agitatorEnabled: 'Agitator Enabled',
    agitatorSpdSp: 'Agitator Speed',
    promptMessage: 'Prompt Message',
  }
  return fieldNames[field] || field
}

// Format user name
function formatUserName(entry: ChangeHistoryEntry): string {
  if (entry.user) {
    if (entry.user.firstName || entry.user.lastName) {
      return `${entry.user.firstName || ''} ${entry.user.lastName || ''}`.trim()
    }
    return entry.user.username
  }
  return entry.userId
}

// Generate summary text
function generateSummary(entry: ChangeHistoryEntry): string {
  const parts: string[] = []
  const { changesSummary } = entry

  if (changesSummary.bomItemsModified > 0) {
    parts.push(`${changesSummary.bomItemsModified} BOM item${changesSummary.bomItemsModified > 1 ? 's' : ''}`)
  }
  if (changesSummary.parametersModified > 0) {
    parts.push(`${changesSummary.parametersModified} parameter${changesSummary.parametersModified > 1 ? 's' : ''}`)
  }
  if (changesSummary.mashingStepsModified > 0) {
    parts.push(`${changesSummary.mashingStepsModified} mashing step${changesSummary.mashingStepsModified > 1 ? 's' : ''}`)
  }

  if (parts.length === 0) {
    return 'No changes'
  }

  return `Modified ${parts.join(', ')}`
}

// Format timestamp
function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return timestamp
  }
}

// Single change entry component
function ChangeEntry({ entry, compact }: { entry: ChangeHistoryEntry; compact?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false)

  const hasChanges =
    entry.changes.bomItems.length > 0 ||
    entry.changes.parameters.length > 0 ||
    entry.changes.mashingSteps.length > 0

  return (
    <div className={cn(
      "border rounded-lg",
      compact ? "p-2" : "p-3",
      isExpanded ? "bg-muted/30" : ""
    )}>
      {/* Summary row */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-start gap-2 text-left"
        disabled={!hasChanges}
      >
        {hasChanges ? (
          isExpanded ? (
            <ChevronDown className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
          )
        ) : (
          <div className="w-4" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium text-sm">{formatUserName(entry)}</span>
            <span className="text-xs text-muted-foreground">
              {generateSummary(entry)}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            <Clock className="h-3 w-3" />
            {formatTimestamp(entry.timestamp)}
          </div>
        </div>

        {/* Badge indicators */}
        <div className="flex gap-1 flex-shrink-0">
          {entry.changesSummary.bomItemsModified > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              <Package className="h-3 w-3" />
              {entry.changesSummary.bomItemsModified}
            </span>
          )}
          {entry.changesSummary.parametersModified > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
              <Settings className="h-3 w-3" />
              {entry.changesSummary.parametersModified}
            </span>
          )}
          {entry.changesSummary.mashingStepsModified > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
              <Beaker className="h-3 w-3" />
              {entry.changesSummary.mashingStepsModified}
            </span>
          )}
        </div>
      </button>

      {/* Expanded details */}
      {isExpanded && hasChanges && (
        <div className="mt-3 ml-6 space-y-3">
          {/* BOM Items */}
          {entry.changes.bomItems.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">
                <Package className="h-3.5 w-3.5" />
                BOM Items
              </div>
              <div className="space-y-1.5 pl-5">
                {entry.changes.bomItems.map((item) => (
                  <div key={item.id} className="text-sm">
                    <span className="font-medium">{item.itemName}</span>
                    <div className="pl-2 text-xs text-muted-foreground">
                      {Object.entries(item.changes).map(([field, change]) => (
                        <div key={field} className="flex gap-1">
                          <span>{formatFieldName(field)}:</span>
                          <span className="line-through text-red-500">{formatValue(change.old)}</span>
                          <span className="mx-0.5">→</span>
                          <span className="text-green-600 dark:text-green-400">{formatValue(change.new)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Parameters */}
          {entry.changes.parameters.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-purple-600 dark:text-purple-400 mb-1">
                <Settings className="h-3.5 w-3.5" />
                Parameters
              </div>
              <div className="space-y-1.5 pl-5">
                {entry.changes.parameters.map((param) => (
                  <div key={param.id} className="text-sm">
                    <span className="font-medium">{param.parameterName}</span>
                    <div className="pl-2 text-xs text-muted-foreground">
                      {Object.entries(param.changes).map(([field, change]) => (
                        <div key={field} className="flex gap-1">
                          <span>{formatFieldName(field)}:</span>
                          <span className="line-through text-red-500">{formatValue(change.old)}</span>
                          <span className="mx-0.5">→</span>
                          <span className="text-green-600 dark:text-green-400">{formatValue(change.new)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mashing Steps */}
          {entry.changes.mashingSteps.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-orange-600 dark:text-orange-400 mb-1">
                <Beaker className="h-3.5 w-3.5" />
                Mashing Steps
              </div>
              <div className="space-y-1.5 pl-5">
                {entry.changes.mashingSteps.map((step) => (
                  <div key={step.id} className="text-sm">
                    <span className="font-medium">
                      Step {step.stepIndex !== undefined ? step.stepIndex + 1 : '?'}
                      {step.stepType && ` (${step.stepType})`}
                    </span>
                    <div className="pl-2 text-xs text-muted-foreground">
                      {Object.entries(step.changes).map(([field, change]) => (
                        <div key={field} className="flex gap-1">
                          <span>{formatFieldName(field)}:</span>
                          <span className="line-through text-red-500">{formatValue(change.old)}</span>
                          <span className="mx-0.5">→</span>
                          <span className="text-green-600 dark:text-green-400">{formatValue(change.new)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ScheduleOrderChangeHistory({
  scheduleOrderId,
  limit = 20,
  compact = false,
}: ScheduleOrderChangeHistoryProps) {
  const [history, setHistory] = useState<ChangeHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchHistory() {
      if (!scheduleOrderId) return

      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: CHANGE_HISTORY_QUERY,
            variables: { scheduleOrderId, limit },
          }),
        })

        const { data, errors } = await response.json()

        if (errors) {
          console.error('GraphQL errors:', errors)
          setError('Failed to load change history')
          return
        }

        setHistory(data?.scheduleOrderRecipeChangeHistory || [])
      } catch (err) {
        console.error('Error fetching change history:', err)
        setError('Failed to load change history')
      } finally {
        setIsLoading(false)
      }
    }

    fetchHistory()
  }, [scheduleOrderId, limit])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading change history...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>{error}</p>
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <History className="h-8 w-8 mb-2 opacity-50" />
        <p>No change history available</p>
        <p className="text-xs mt-1">Changes will appear here after recipe components are modified</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {history.map((entry) => (
        <ChangeEntry key={entry.id} entry={entry} compact={compact} />
      ))}
    </div>
  )
}
