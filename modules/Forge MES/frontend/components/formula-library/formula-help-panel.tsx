'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search } from 'lucide-react'

// ============================================
// Reference Data
// ============================================

interface ReferenceItem {
  name: string
  syntax?: string
  description: string
  example?: string
  result?: string
  category?: string
}

const SYNTAX_REFERENCE: ReferenceItem[] = [
  { name: 'Arithmetic', syntax: '+ - * / %', description: 'Basic math operators. % is modulo.', example: 'grainLoad * corn / 100', result: '14000' },
  { name: 'Power', syntax: '^', description: 'Exponentiation', example: 'POW(2, 10)', result: '1024' },
  { name: 'Comparison', syntax: '== != < > <= >=', description: 'Comparison operators return true/false', example: 'grainLoad > 10000', result: 'true' },
  { name: 'Logical', syntax: 'and, or, not', description: 'Boolean logic operators', example: 'corn > 50 and rye > 10', result: 'true' },
  { name: 'Ternary', syntax: 'cond ? a : b', description: 'Inline conditional expression', example: 'corn > 50 ? grainLoad * 0.7 : grainLoad * 0.5', result: '14000' },
  { name: 'Grouping', syntax: '( )', description: 'Parentheses control evaluation order', example: '(grainLoad + 500) * 0.5', result: '10250' },
  { name: '= Prefix', syntax: '=expression', description: 'Optional = prefix is stripped automatically', example: '=grainLoad * corn / 100', result: '14000' },
]

const FUNCTION_REFERENCE: ReferenceItem[] = [
  // Conditional
  { name: 'IF', syntax: 'IF(cond, true, false)', description: 'Conditional evaluation (like Excel IF)', example: 'IF(corn > 50, grainLoad * corn / 100, 0)', result: '14000', category: 'Conditional' },
  { name: 'AND', syntax: 'AND(a, b, ...)', description: 'True if all arguments are truthy', example: 'AND(corn > 50, rye > 10)', result: 'true', category: 'Conditional' },
  { name: 'OR', syntax: 'OR(a, b, ...)', description: 'True if any argument is truthy', example: 'OR(corn > 80, rye > 30)', result: 'false', category: 'Conditional' },
  { name: 'NOT', syntax: 'NOT(value)', description: 'Logical negation', example: 'NOT(corn == 0)', result: 'true', category: 'Conditional' },
  // Math
  { name: 'ROUND', syntax: 'ROUND(val, dec?)', description: 'Round to N decimals (default 0)', example: 'ROUND(14000.567, 2)', result: '14000.57', category: 'Math' },
  { name: 'FLOOR', syntax: 'FLOOR(value)', description: 'Round down to integer', example: 'FLOOR(14000.9)', result: '14000', category: 'Math' },
  { name: 'CEIL', syntax: 'CEIL(value)', description: 'Round up to integer', example: 'CEIL(14000.1)', result: '14001', category: 'Math' },
  { name: 'ABS', syntax: 'ABS(value)', description: 'Absolute value', example: 'ABS(-500)', result: '500', category: 'Math' },
  { name: 'MIN', syntax: 'MIN(a, b, ...)', description: 'Minimum value', example: 'MIN(corn, rye, malt)', result: '9', category: 'Math' },
  { name: 'MAX', syntax: 'MAX(a, b, ...)', description: 'Maximum value', example: 'MAX(corn, rye, malt)', result: '70', category: 'Math' },
  { name: 'POW', syntax: 'POW(base, exp)', description: 'Power / exponentiation', example: 'POW(2, 8)', result: '256', category: 'Math' },
  { name: 'SQRT', syntax: 'SQRT(value)', description: 'Square root', example: 'SQRT(144)', result: '12', category: 'Math' },
  { name: 'LOG', syntax: 'LOG(value)', description: 'Natural logarithm', example: 'ROUND(LOG(100), 2)', result: '4.61', category: 'Math' },
  { name: 'LOG10', syntax: 'LOG10(value)', description: 'Base-10 logarithm', example: 'LOG10(1000)', result: '3', category: 'Math' },
  { name: 'EXP', syntax: 'EXP(value)', description: 'e raised to value', example: 'ROUND(EXP(1), 2)', result: '2.72', category: 'Math' },
  // Conversion
  { name: 'BUSHELS', syntax: 'BUSHELS(lbs)', description: 'Convert lbs to bushels (÷ 56)', example: 'BUSHELS(20000)', result: '357.14', category: 'Conversion' },
  { name: 'METRIC_TONS', syntax: 'METRIC_TONS(lbs)', description: 'Convert lbs to metric tons (÷ 2205)', example: 'METRIC_TONS(20000)', result: '9.07', category: 'Conversion' },
  { name: 'GALLONS_TO_LITERS', syntax: 'GALLONS_TO_LITERS(gal)', description: 'Convert gallons to liters (× 3.78541)', example: 'GALLONS_TO_LITERS(5000)', result: '18927.05', category: 'Conversion' },
  { name: 'LITERS_TO_GALLONS', syntax: 'LITERS_TO_GALLONS(L)', description: 'Convert liters to gallons (÷ 3.78541)', example: 'LITERS_TO_GALLONS(19000)', result: '5018.76', category: 'Conversion' },
  { name: 'KG_TO_LBS', syntax: 'KG_TO_LBS(kg)', description: 'Convert kg to pounds (× 2.20462)', example: 'KG_TO_LBS(1000)', result: '2204.62', category: 'Conversion' },
  { name: 'LBS_TO_KG', syntax: 'LBS_TO_KG(lbs)', description: 'Convert lbs to kg (÷ 2.20462)', example: 'LBS_TO_KG(20000)', result: '9071.85', category: 'Conversion' },
]

const VARIABLE_REFERENCE: ReferenceItem[] = [
  { name: 'grainLoad', description: 'Total grain weight in lbs', example: '20000', category: 'Production' },
  { name: 'waterLoad', description: 'Total water volume in gallons', example: '5000', category: 'Production' },
  { name: 'mashBill', description: 'Mash bill code string', example: '"70-21-00-09"', category: 'Production' },
  { name: 'corn', description: 'Corn percentage (0-100)', example: '70', category: 'Grain %' },
  { name: 'rye', description: 'Rye percentage (0-100)', example: '21', category: 'Grain %' },
  { name: 'wheat', description: 'Wheat percentage (0-100)', example: '0', category: 'Grain %' },
  { name: 'malt', description: 'Malt percentage (0-100)', example: '9', category: 'Grain %' },
  { name: 'lbsPerBushel', description: 'Pounds per bushel constant', example: '56', category: 'Constants' },
  { name: 'gallonsPerBushel', description: 'Gallons per bushel constant', example: '4.5', category: 'Constants' },
  { name: 'metricTonDivisor', description: 'Metric ton divisor constant', example: '2205', category: 'Constants' },
  { name: 'C, R, W, M, Y, S, B, O, Z', description: 'Grain character abbreviation percentages', example: 'C=70, R=21', category: 'Grain Chars' },
  { name: 'C1-C9, R1-R9, ...', description: 'Grain variety code percentages', example: 'C1=50, C2=20', category: 'Grain Chars' },
]

const PATTERN_REFERENCE: ReferenceItem[] = [
  { name: 'Corn weight from grain load', description: 'Calculate individual grain weight from percentage', syntax: 'grainLoad * corn / 100', example: 'grainLoad=20000, corn=70', result: '14000 lbs' },
  { name: 'Rye weight from grain load', description: 'Same pattern for rye', syntax: 'grainLoad * rye / 100', example: 'grainLoad=20000, rye=21', result: '4200 lbs' },
  { name: 'Grain weight in bushels', description: 'Convert a grain percentage to bushels', syntax: 'BUSHELS(grainLoad * corn / 100)', example: 'grainLoad=20000, corn=70', result: '250 bushels' },
  { name: 'Water-to-grain ratio', description: 'Calculate water gallons per lb of grain', syntax: 'waterLoad / grainLoad', example: 'waterLoad=5000, grainLoad=20000', result: '0.25 gal/lb' },
  { name: 'Conditional grain calc', description: 'Different formula based on mash composition', syntax: 'IF(corn > 60, grainLoad * corn / 100, grainLoad * 0.5)', example: 'grainLoad=20000, corn=70', result: '14000 lbs' },
  { name: 'Enzyme dosing', description: 'Enzyme amount normalized to grain load', syntax: 'ROUND(grainLoad * 0.0015, 2)', example: 'grainLoad=20000', result: '30 units' },
  { name: 'Rounded metric tons', description: 'Total grain in metric tons, rounded', syntax: 'ROUND(METRIC_TONS(grainLoad), 2)', example: 'grainLoad=20000', result: '9.07 MT' },
  { name: 'Malt weight with minimum', description: 'At least 500 lbs of malt', syntax: 'MAX(grainLoad * malt / 100, 500)', example: 'grainLoad=20000, malt=9', result: '1800 lbs' },
]

const TROUBLESHOOTING_REFERENCE: ReferenceItem[] = [
  { name: 'Unknown variable warning', description: 'Using a variable not in the known list. Check spelling or add it via Configure Variables.', example: 'grainLoad * corn2 / 100' },
  { name: 'Syntax error: unexpected token', description: 'Mismatched parentheses or invalid operators. Count your parentheses and check operator usage.', example: 'grainLoad * (corn / 100' },
  { name: 'Division by zero', description: 'Dividing by a variable that could be zero. Use IF() to guard against it.', example: 'IF(grainLoad > 0, waterLoad / grainLoad, 0)' },
  { name: 'NaN result', description: 'Usually from SQRT of negative or LOG of zero. Add guards for edge cases.', example: 'IF(value > 0, SQRT(value), 0)' },
  { name: 'Wrong calculation mode', description: 'Formula uses grainLoad but BOM mode is FORMULA_WATER. Match the mode to the variables used.' },
  { name: 'Expression returns string', description: 'Expressions must return numbers. Avoid string operations — use numeric comparisons instead.' },
]

// ============================================
// Component
// ============================================

function ReferenceCard({ item }: { item: ReferenceItem }) {
  return (
    <div className="border rounded-lg p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm">{item.name}</span>
        {item.category && (
          <Badge variant="outline" className="text-xs shrink-0">
            {item.category}
          </Badge>
        )}
      </div>
      {item.syntax && (
        <code className="block text-xs bg-muted px-2 py-1 rounded font-mono">
          {item.syntax}
        </code>
      )}
      <p className="text-xs text-muted-foreground">{item.description}</p>
      {item.example && (
        <div className="text-xs">
          <span className="text-muted-foreground">Example: </span>
          <code className="bg-muted px-1 rounded font-mono">{item.example}</code>
          {item.result && (
            <>
              <span className="text-muted-foreground"> → </span>
              <code className="font-mono font-medium">{item.result}</code>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function FormulaHelpPanel() {
  const [search, setSearch] = useState('')

  const filterItems = (items: ReferenceItem[]) => {
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.syntax?.toLowerCase().includes(q) ||
        item.category?.toLowerCase().includes(q),
    )
  }

  const filteredSyntax = useMemo(() => filterItems(SYNTAX_REFERENCE), [search])
  const filteredFunctions = useMemo(() => filterItems(FUNCTION_REFERENCE), [search])
  const filteredVariables = useMemo(() => filterItems(VARIABLE_REFERENCE), [search])
  const filteredPatterns = useMemo(() => filterItems(PATTERN_REFERENCE), [search])
  const filteredTroubleshooting = useMemo(() => filterItems(TROUBLESHOOTING_REFERENCE), [search])

  // When searching, show combined results across all tabs
  const allResults = useMemo(() => {
    if (!search) return []
    return [
      ...filteredSyntax.map((item) => ({ ...item, _section: 'Syntax' as const })),
      ...filteredFunctions.map((item) => ({ ...item, _section: 'Function' as const })),
      ...filteredVariables.map((item) => ({ ...item, _section: 'Variable' as const })),
      ...filteredPatterns.map((item) => ({ ...item, _section: 'Pattern' as const })),
      ...filteredTroubleshooting.map((item) => ({ ...item, _section: 'Issue' as const })),
    ]
  }, [search, filteredSyntax, filteredFunctions, filteredVariables, filteredPatterns, filteredTroubleshooting])

  return (
    <div className="flex flex-col h-full">
      <div className="relative mb-4">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search functions, variables, patterns..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {search ? (
        <ScrollArea className="flex-1">
          <div className="space-y-2">
            {allResults.map((item) => (
              <ReferenceCard key={`${item._section}-${item.name}`} item={{ ...item, category: item.category || item._section }} />
            ))}
            {allResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No matches found</p>
            )}
          </div>
        </ScrollArea>
      ) : (
        <Tabs defaultValue="syntax" className="flex-1 min-h-0 flex flex-col">
          <TabsList className="grid w-full grid-cols-5 shrink-0">
            <TabsTrigger value="syntax" className="text-xs">Syntax</TabsTrigger>
            <TabsTrigger value="functions" className="text-xs">Functions</TabsTrigger>
            <TabsTrigger value="variables" className="text-xs">Variables</TabsTrigger>
            <TabsTrigger value="patterns" className="text-xs">Patterns</TabsTrigger>
            <TabsTrigger value="issues" className="text-xs">Issues</TabsTrigger>
          </TabsList>

          <div className="flex-1 min-h-0 mt-4 overflow-y-auto">
            <TabsContent value="syntax" className="mt-0 space-y-2">
              {SYNTAX_REFERENCE.map((item) => (
                <ReferenceCard key={item.name} item={item} />
              ))}
            </TabsContent>

            <TabsContent value="functions" className="mt-0 space-y-2">
              {FUNCTION_REFERENCE.map((item) => (
                <ReferenceCard key={item.name} item={item} />
              ))}
            </TabsContent>

            <TabsContent value="variables" className="mt-0 space-y-2">
              {VARIABLE_REFERENCE.map((item) => (
                <ReferenceCard key={item.name} item={item} />
              ))}
            </TabsContent>

            <TabsContent value="patterns" className="mt-0 space-y-2">
              {PATTERN_REFERENCE.map((item) => (
                <ReferenceCard key={item.name} item={item} />
              ))}
            </TabsContent>

            <TabsContent value="issues" className="mt-0 space-y-2">
              {TROUBLESHOOTING_REFERENCE.map((item) => (
                <ReferenceCard key={item.name} item={item} />
              ))}
            </TabsContent>
          </div>
        </Tabs>
      )}
    </div>
  )
}
