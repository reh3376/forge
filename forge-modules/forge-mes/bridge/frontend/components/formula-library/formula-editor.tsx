'use client'

import { useCallback, useEffect, useState, useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { autocompletion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { EditorView } from '@codemirror/view'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Variable, Braces } from 'lucide-react'
import { ValidationResult } from '@/lib/api/formula-library-queries'
import { useGrainCharacters, getGrainCharacterCode } from '@/lib/hooks/use-grain-characters'
import { useFormulaVariables } from '@/lib/hooks/use-formula-variables'
import { useFormulaFunctions } from '@/lib/hooks/use-formula-functions'
import { cn } from '@/lib/utils'

interface FormulaEditorProps {
  value: string
  onChange: (value: string) => void
  onValidate?: (result: ValidationResult) => void
  validation?: ValidationResult | null
  isValidating?: boolean
  disabled?: boolean
  placeholder?: string
  className?: string
  showVariablePanel?: boolean
  showFunctionPanel?: boolean
}

// Custom theme for formula editor
const formulaTheme = EditorView.theme({
  '&': {
    fontSize: '14px',
    backgroundColor: 'transparent',
  },
  '.cm-content': {
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    padding: '12px',
  },
  '.cm-line': {
    padding: '0 4px',
  },
  '.cm-gutters': {
    display: 'none',
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: 'hsl(var(--primary))',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'hsl(var(--primary) / 0.2)',
  },
  '.cm-tooltip-autocomplete': {
    backgroundColor: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '6px',
    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  },
  '.cm-completionLabel': {
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  },
  '.cm-completionDetail': {
    color: 'hsl(var(--muted-foreground))',
    fontStyle: 'italic',
    marginLeft: '8px',
  },
})

export function FormulaEditor({
  value,
  onChange,
  onValidate,
  validation,
  isValidating,
  disabled,
  placeholder = '=grainLoad * 0.7',
  className,
  showVariablePanel = true,
  showFunctionPanel = true,
}: FormulaEditorProps) {
  const [localValue, setLocalValue] = useState(value)

  // Fetch formula configuration from database
  const { variables: dbVariables } = useFormulaVariables()
  const { functions: dbFunctions } = useFormulaFunctions()

  // Fetch grain characters for dynamic variable list
  const { grainCharacters } = useGrainCharacters()

  // Build combined variables list (DB variables + grain characters)
  const allVariables = useMemo(() => {
    // Start with database variables
    const vars = dbVariables.map(v => ({
      name: v.name,
      type: v.type,
      description: v.description || v.displayName,
      isGrain: false,
      category: v.category,
    }))

    // Add grain character abbreviations
    grainCharacters.forEach(grain => {
      const code = getGrainCharacterCode(grain)
      vars.push({
        name: code,
        type: 'number',
        description: `${grain.name} percentage (0-100)`,
        isGrain: true,
        category: 'Grain',
      })
    })

    return vars
  }, [dbVariables, grainCharacters])

  // Map functions for display
  const allFunctions = useMemo(() => {
    return dbFunctions.map(f => ({
      name: f.name,
      syntax: f.syntax,
      description: f.description || '',
      category: f.category,
    }))
  }, [dbFunctions])

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  const handleChange = useCallback((val: string) => {
    setLocalValue(val)
    onChange(val)
  }, [onChange])

  const insertVariable = (varName: string) => {
    const newValue = localValue + varName
    setLocalValue(newValue)
    onChange(newValue)
  }

  const insertFunction = (funcSyntax: string) => {
    const newValue = localValue + funcSyntax
    setLocalValue(newValue)
    onChange(newValue)
  }

  // Build autocomplete with dynamic variables and functions
  const formulaCompletionsWithGrains = useCallback((context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/[\w]*/)
    if (!word || (word.from === word.to && !context.explicit)) return null

    const options = [
      // Variables
      ...allVariables.map(v => ({
        label: v.name,
        type: 'variable',
        detail: v.type,
        info: v.description,
        boost: 1,
      })),
      // Functions from database
      ...allFunctions.map(f => ({
        label: f.name,
        type: 'function',
        detail: f.syntax,
        info: f.description,
        apply: f.syntax,
        boost: 0,
      })),
    ]

    return {
      from: word.from,
      options,
      validFor: /^[\w]*$/,
    }
  }, [allVariables, allFunctions])

  const extensions = useMemo(() => [
    javascript(),
    autocompletion({
      override: [formulaCompletionsWithGrains],
      icons: false,
    }),
    formulaTheme,
    EditorView.lineWrapping,
  ], [formulaCompletionsWithGrains])

  return (
    <div className={cn('space-y-4', className)}>
      {/* Editor */}
      <div className="relative">
        <div className={cn(
          'border rounded-lg overflow-hidden transition-colors',
          validation?.isValid === true && 'border-green-500',
          validation?.isValid === false && 'border-red-500',
          isValidating && 'border-yellow-500',
          disabled && 'opacity-50 cursor-not-allowed'
        )}>
          <CodeMirror
            value={localValue}
            onChange={handleChange}
            extensions={extensions}
            placeholder={placeholder}
            editable={!disabled}
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
              highlightActiveLine: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: true,
            }}
            minHeight="80px"
            maxHeight="200px"
          />
        </div>

        {/* Validation Status Indicator */}
        <div className="absolute top-2 right-2">
          {isValidating && (
            <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />
          )}
          {!isValidating && validation?.isValid === true && (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          )}
          {!isValidating && validation?.isValid === false && (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
        </div>
      </div>

      {/* Validation Messages */}
      {validation && !validation.isValid && validation.errors.length > 0 && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {validation.errors.map((error, i) => (
                <li key={i}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {validation && validation.warnings && validation.warnings.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {validation.warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Detected Variables */}
      {validation?.detectedVariables && validation.detectedVariables.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-muted-foreground">Variables used:</span>
          {validation.detectedVariables.map(v => (
            <Badge key={v} variant="secondary">{v}</Badge>
          ))}
        </div>
      )}

      {/* Variable & Function Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {showVariablePanel && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Variable className="h-4 w-4" />
                Available Variables
              </CardTitle>
              <CardDescription className="text-xs">
                Click to insert into formula
              </CardDescription>
            </CardHeader>
            <CardContent className="py-2">
              <div className="flex flex-wrap gap-1">
                {allVariables.map(v => (
                  <Button
                    key={v.name}
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-7 text-xs font-mono",
                      v.isGrain && "border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
                    )}
                    onClick={() => insertVariable(v.name)}
                    disabled={disabled}
                    title={v.description}
                  >
                    {v.name}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {showFunctionPanel && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Braces className="h-4 w-4" />
                Available Functions
              </CardTitle>
              <CardDescription className="text-xs">
                Click to insert function template
              </CardDescription>
            </CardHeader>
            <CardContent className="py-2">
              <div className="flex flex-wrap gap-1">
                {allFunctions.map(f => (
                  <Button
                    key={f.name}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs font-mono"
                    onClick={() => insertFunction(f.syntax)}
                    disabled={disabled}
                    title={f.description}
                  >
                    {f.name}()
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

export default FormulaEditor
