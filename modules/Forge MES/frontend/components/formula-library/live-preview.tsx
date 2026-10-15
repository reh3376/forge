'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Play, RefreshCw, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { ExpressionResult } from '@/lib/api/formula-library-queries'
import { useGrainCharacters, getGrainCharacterCode } from '@/lib/hooks/use-grain-characters'
import { useFormulaVariables } from '@/lib/hooks/use-formula-variables'
import { cn } from '@/lib/utils'

interface LivePreviewProps {
  expression: string
  onEvaluate: (context: Record<string, any>) => Promise<ExpressionResult>
  className?: string
  autoEvaluate?: boolean
  debounceMs?: number
}

// Fallback default context (used when DB is not available)
const FALLBACK_CONTEXT: Record<string, number | string> = {
  grainLoad: 3000,
  waterLoad: 240,
  // Legacy variables (for backward compatibility)
  corn: 70,
  rye: 21,
  wheat: 0,
  malt: 9,
  // Grain character abbreviations
  C: 70,
  R: 21,
  W: 0,
  M: 9,
  mashBill: '70-21-00-09',
  lbsPerBushel: 56,
  gallonsPerBushel: 4.5,
}

export function LivePreview({
  expression,
  onEvaluate,
  className,
  autoEvaluate = true,
  debounceMs = 500,
}: LivePreviewProps) {
  const [result, setResult] = useState<ExpressionResult | null>(null)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [lastEvaluated, setLastEvaluated] = useState<string>('')

  // Fetch formula variables from database
  const { variables: dbVariables } = useFormulaVariables()

  // Fetch grain characters for dynamic variable inputs
  const { grainCharacters } = useGrainCharacters()

  // Build default context from DB variables + grain characters
  const defaultContext = useMemo(() => {
    const ctx: Record<string, number | string> = { ...FALLBACK_CONTEXT }

    // Add DB variables with their default values
    dbVariables.forEach(v => {
      if (v.defaultValue) {
        const numVal = parseFloat(v.defaultValue)
        ctx[v.name] = isNaN(numVal) ? v.defaultValue : numVal
      }
    })

    // Add grain character abbreviations with default values
    grainCharacters.forEach(grain => {
      const code = getGrainCharacterCode(grain)
      // Default grain percentages (fallback values)
      if (ctx[code] === undefined) {
        ctx[code] = 0
      }
    })

    return ctx
  }, [dbVariables, grainCharacters])

  const [context, setContext] = useState<Record<string, any>>(defaultContext)

  // Update context when default context changes (e.g., DB loads)
  useEffect(() => {
    setContext(prev => ({ ...defaultContext, ...prev }))
  }, [defaultContext])

  // Build dynamic input variables list
  const inputVariables = useMemo(() => {
    // Start with DB variables (show only General category for preview)
    const vars = dbVariables
      .filter(v => v.category === 'General')
      .map(v => ({
        name: v.name,
        label: v.displayName,
        type: v.type as 'number' | 'string',
      }))

    // Add grain character abbreviations
    grainCharacters.forEach(grain => {
      const code = getGrainCharacterCode(grain)
      vars.push({
        name: code,
        label: `${code} (${grain.name})`,
        type: 'number' as const,
      })
    })

    return vars
  }, [dbVariables, grainCharacters])

  const evaluate = useCallback(async () => {
    if (!expression || expression.trim() === '') {
      setResult(null)
      return
    }

    setIsEvaluating(true)
    try {
      const evalResult = await onEvaluate(context)
      setResult(evalResult)
      setLastEvaluated(new Date().toLocaleTimeString())
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Evaluation failed',
        executionTimeMs: 0,
        variablesUsed: [],
      })
    } finally {
      setIsEvaluating(false)
    }
  }, [expression, context, onEvaluate])

  // Auto-evaluate with debounce when expression or context changes
  useEffect(() => {
    if (!autoEvaluate) return

    const timer = setTimeout(() => {
      evaluate()
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [expression, context, autoEvaluate, debounceMs, evaluate])

  const handleContextChange = (key: string, value: string) => {
    const numValue = parseFloat(value)
    setContext(prev => ({
      ...prev,
      [key]: isNaN(numValue) ? value : numValue,
    }))
  }

  const resetContext = () => {
    setContext(defaultContext)
  }

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Play className="h-4 w-4" />
              Live Preview
            </CardTitle>
            <CardDescription className="text-xs">
              Test your formula with sample values
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={resetContext}
              className="h-7 text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Reset
            </Button>
            {!autoEvaluate && (
              <Button
                variant="outline"
                size="sm"
                onClick={evaluate}
                disabled={isEvaluating}
                className="h-7 text-xs"
              >
                {isEvaluating ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Play className="h-3 w-3 mr-1" />
                )}
                Run
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Input Variables */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {inputVariables.map(v => (
            <div key={v.name} className="space-y-1">
              <Label htmlFor={v.name} className="text-xs font-medium">
                {v.label}
              </Label>
              <Input
                id={v.name}
                type={v.type === 'number' ? 'number' : 'text'}
                value={context[v.name] ?? ''}
                onChange={(e) => handleContextChange(v.name, e.target.value)}
                className="h-8 text-sm font-mono"
              />
            </div>
          ))}
        </div>

        {/* Result Display */}
        <div className={cn(
          'rounded-lg p-4 border-2 transition-colors',
          result?.success === true && 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800',
          result?.success === false && 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800',
          !result && 'bg-muted border-transparent'
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isEvaluating && (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              )}
              {!isEvaluating && result?.success && (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              )}
              {!isEvaluating && result?.success === false && (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              <span className="text-sm text-muted-foreground">Result:</span>
            </div>
            {lastEvaluated && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {lastEvaluated}
              </div>
            )}
          </div>

          <div className="mt-2">
            {isEvaluating ? (
              <span className="text-2xl font-mono text-muted-foreground">...</span>
            ) : result?.success ? (
              <div className="space-y-2">
                <span className="text-3xl font-mono font-bold text-green-700 dark:text-green-400">
                  {result.value?.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 4
                  })}
                </span>
                {result.executionTimeMs !== undefined && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="font-mono">
                      {result.executionTimeMs}ms
                    </Badge>
                    {result.variablesUsed.length > 0 && (
                      <span>
                        Used: {result.variablesUsed.join(', ')}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : result?.error ? (
              <div className="space-y-1">
                <span className="text-lg font-mono text-red-600 dark:text-red-400">
                  Error
                </span>
                <p className="text-sm text-red-600 dark:text-red-400">
                  {result.error}
                </p>
              </div>
            ) : (
              <span className="text-lg font-mono text-muted-foreground">
                Enter a formula to see the result
              </span>
            )}
          </div>
        </div>

        {/* Formula Display */}
        {expression && (
          <div className="text-xs text-muted-foreground font-mono bg-muted/50 rounded p-2 overflow-x-auto">
            {expression}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default LivePreview
