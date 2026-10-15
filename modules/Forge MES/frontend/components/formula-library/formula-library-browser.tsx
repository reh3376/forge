'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Search,
  Plus,
  FunctionSquare,
  Clock,
  User,
  MoreVertical,
  Edit,
  Trash2,
  Copy,
  Eye
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FormulaLibrary, FORMULA_CATEGORIES } from '@/lib/api/formula-library-queries'
import { cn } from '@/lib/utils'

interface FormulaLibraryBrowserProps {
  formulas: FormulaLibrary[]
  isLoading?: boolean
  selectedId?: string
  onSelect: (formula: FormulaLibrary) => void
  onCreateNew: () => void
  onEdit: (formula: FormulaLibrary) => void
  onDelete: (formula: FormulaLibrary) => void
  onDuplicate?: (formula: FormulaLibrary) => void
  className?: string
}

export function FormulaLibraryBrowser({
  formulas,
  isLoading,
  selectedId,
  onSelect,
  onCreateNew,
  onEdit,
  onDelete,
  onDuplicate,
  className,
}: FormulaLibraryBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // Filter formulas by search query and category
  const filteredFormulas = formulas.filter(formula => {
    const matchesSearch = searchQuery === '' ||
      formula.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      formula.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      formula.expression.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesCategory = selectedCategory === 'all' ||
      formula.category === selectedCategory

    return matchesSearch && matchesCategory && formula.isActive
  })

  // Group by category for display
  const groupedFormulas = filteredFormulas.reduce((acc, formula) => {
    const category = formula.category || 'Custom'
    if (!acc[category]) acc[category] = []
    acc[category].push(formula)
    return acc
  }, {} as Record<string, FormulaLibrary[]>)

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Grain':
        return '🌾'
      case 'Water':
        return '💧'
      case 'Enzyme':
        return '🧪'
      default:
        return '📐'
    }
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Formula Library</h2>
          <p className="text-sm text-muted-foreground">
            {formulas.filter(f => f.isActive).length} formulas available
          </p>
        </div>
        <Button onClick={onCreateNew}>
          <Plus className="h-4 w-4 mr-2" />
          New Formula
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search formulas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            {FORMULA_CATEGORIES.map(cat => (
              <TabsTrigger key={cat.value} value={cat.value}>
                {getCategoryIcon(cat.value)} {cat.label.split(' ')[0]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Formula Cards */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2 mt-2" />
              </CardHeader>
              <CardContent>
                <div className="h-10 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredFormulas.length === 0 ? (
        <Card className="py-12">
          <CardContent className="text-center">
            <FunctionSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-1">No formulas found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchQuery
                ? 'Try adjusting your search or filters'
                : 'Create your first formula to get started'
              }
            </p>
            {!searchQuery && (
              <Button onClick={onCreateNew}>
                <Plus className="h-4 w-4 mr-2" />
                Create Formula
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredFormulas.map(formula => (
            <Card
              key={formula.id}
              className={cn(
                'cursor-pointer transition-all hover:shadow-md hover:border-primary/50',
                selectedId === formula.id && 'ring-2 ring-primary border-primary'
              )}
              onClick={() => onSelect(formula)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {getCategoryIcon(formula.category || 'Custom')}
                    </span>
                    <CardTitle className="text-base line-clamp-1">
                      {formula.name}
                    </CardTitle>
                  </div>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onSelect={() => onSelect(formula)}>
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onEdit(formula)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      {onDuplicate && (
                        <DropdownMenuItem onSelect={() => onDuplicate(formula)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onSelect={() => onDelete(formula)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {formula.description && (
                  <CardDescription className="line-clamp-2 text-xs">
                    {formula.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="pb-2">
                <div className="bg-muted rounded p-2 font-mono text-xs overflow-x-auto">
                  <code className="text-primary">{formula.expression}</code>
                </div>
              </CardContent>
              <CardFooter className="pt-2 flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {formula.createdBy}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs h-5">
                    v{formula.version}
                  </Badge>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(formula.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default FormulaLibraryBrowser
