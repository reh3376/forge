'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
// Using simple div instead of Separator and ScrollArea components
import { 
  Search, 
  Filter, 
  X, 
  Star, 
  Users, 
  ChevronDown, 
  ChevronUp,
  Save,
  History
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/use-debounce'

import {
  RecipeTemplate,
  TemplateSearchParams,
  TemplateSearchResult,
  ComplexityLevel,
  TagCategory,
  TemplateSortBy,
  SortOrder,
  SearchFacets,
  FacetCount
} from '@/types/recipe-template'

import { CustomerContext } from '@/lib/recipe-template-access'
import { filterTemplates, TemplateUtils } from '@/lib/recipe-template-utils'

// Search component props
export interface TemplateSearchProps {
  templates: RecipeTemplate[]
  customerContext: CustomerContext
  onSearchResults: (results: TemplateSearchResult) => void
  onTemplateSelect?: (template: RecipeTemplate) => void
  className?: string
}

// Saved search interface
export interface SavedSearch {
  id: string
  name: string
  searchParams: TemplateSearchParams
  createdAt: Date
  lastUsed: Date
}

export function TemplateSearch({
  templates,
  customerContext,
  onSearchResults,
  onTemplateSelect,
  className
}: TemplateSearchProps) {
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchParams, setSearchParams] = useState<TemplateSearchParams>({})
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [searchHistory, setSearchHistory] = useState<string[]>([])

  // Debounced search query
  const debouncedQuery = useDebounce(searchQuery, 300)

  // Filter state
  const [selectedWhiskeyTypes, setSelectedWhiskeyTypes] = useState<string[]>([])
  const [selectedComplexity, setSelectedComplexity] = useState<ComplexityLevel[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedTagCategories, setSelectedTagCategories] = useState<TagCategory[]>([])
  const [mashBillPattern, setMashBillPattern] = useState('')
  const [isPublicOnly, setIsPublicOnly] = useState<boolean | undefined>(undefined)
  const [isFavoritesOnly, setIsFavoritesOnly] = useState(false)
  const [minRating, setMinRating] = useState<number | undefined>(undefined)
  const [sortBy, setSortBy] = useState<TemplateSortBy>(TemplateSortBy.NAME)
  const [sortOrder, setSortOrder] = useState<SortOrder>(SortOrder.ASC)

  // Calculate search results and facets
  const searchResults = useMemo(() => {
    const params: TemplateSearchParams = {
      query: debouncedQuery || undefined,
      whiskeyTypes: selectedWhiskeyTypes.length > 0 ? selectedWhiskeyTypes : undefined,
      complexity: selectedComplexity.length > 0 ? selectedComplexity : undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      tagCategories: selectedTagCategories.length > 0 ? selectedTagCategories : undefined,
      mashBillPattern: mashBillPattern || undefined,
      isPublic: isPublicOnly,
      isFavorite: isFavoritesOnly || undefined,
      minRating,
      sortBy,
      sortOrder
    }

    const filteredTemplates = filterTemplates(templates, params)
    
    // Calculate facets
    const facets = calculateFacets(filteredTemplates)
    
    // Sort results
    const sortedTemplates = sortTemplates(filteredTemplates, sortBy, sortOrder)

    return {
      templates: sortedTemplates,
      totalCount: sortedTemplates.length,
      facets,
      suggestions: generateSearchSuggestions(debouncedQuery, templates)
    }
  }, [
    debouncedQuery,
    selectedWhiskeyTypes,
    selectedComplexity,
    selectedTags,
    selectedTagCategories,
    mashBillPattern,
    isPublicOnly,
    isFavoritesOnly,
    minRating,
    sortBy,
    sortOrder,
    templates
  ])

  // Update search results when they change
  useEffect(() => {
    onSearchResults(searchResults)
  }, [searchResults, onSearchResults])

  // Handle search query change
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    if (value && !searchHistory.includes(value)) {
      setSearchHistory(prev => [value, ...prev.slice(0, 9)]) // Keep last 10 searches
    }
  }, [searchHistory])

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSearchQuery('')
    setSelectedWhiskeyTypes([])
    setSelectedComplexity([])
    setSelectedTags([])
    setSelectedTagCategories([])
    setMashBillPattern('')
    setIsPublicOnly(undefined)
    setIsFavoritesOnly(false)
    setMinRating(undefined)
    setSortBy(TemplateSortBy.NAME)
    setSortOrder(SortOrder.ASC)
  }, [])

  // Save current search
  const saveCurrentSearch = useCallback(() => {
    const searchName = prompt('Enter a name for this search:')
    if (searchName) {
      const newSavedSearch: SavedSearch = {
        id: Date.now().toString(),
        name: searchName,
        searchParams: {
          query: debouncedQuery || undefined,
          whiskeyTypes: selectedWhiskeyTypes.length > 0 ? selectedWhiskeyTypes : undefined,
          complexity: selectedComplexity.length > 0 ? selectedComplexity : undefined,
          tags: selectedTags.length > 0 ? selectedTags : undefined,
          tagCategories: selectedTagCategories.length > 0 ? selectedTagCategories : undefined,
          mashBillPattern: mashBillPattern || undefined,
          isPublic: isPublicOnly,
          isFavorite: isFavoritesOnly || undefined,
          minRating,
          sortBy,
          sortOrder
        },
        createdAt: new Date(),
        lastUsed: new Date()
      }
      setSavedSearches(prev => [...prev, newSavedSearch])
    }
  }, [
    debouncedQuery,
    selectedWhiskeyTypes,
    selectedComplexity,
    selectedTags,
    selectedTagCategories,
    mashBillPattern,
    isPublicOnly,
    isFavoritesOnly,
    minRating,
    sortBy,
    sortOrder
  ])

  // Load saved search
  const loadSavedSearch = useCallback((savedSearch: SavedSearch) => {
    const params = savedSearch.searchParams
    setSearchQuery(params.query || '')
    setSelectedWhiskeyTypes(params.whiskeyTypes || [])
    setSelectedComplexity(params.complexity || [])
    setSelectedTags(params.tags || [])
    setSelectedTagCategories(params.tagCategories || [])
    setMashBillPattern(params.mashBillPattern || '')
    setIsPublicOnly(params.isPublic)
    setIsFavoritesOnly(params.isFavorite || false)
    setMinRating(params.minRating)
    setSortBy(params.sortBy || TemplateSortBy.NAME)
    setSortOrder(params.sortOrder || SortOrder.ASC)

    // Update last used
    setSavedSearches(prev => 
      prev.map(s => 
        s.id === savedSearch.id 
          ? { ...s, lastUsed: new Date() }
          : s
      )
    )
  }, [])

  return (
    <div className={cn("space-y-4", className)}>
      {/* Main Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search templates by name, description, mash bill pattern..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
        >
          <Filter className="h-4 w-4 mr-2" />
          Filters
          {isAdvancedOpen ? (
            <ChevronUp className="h-4 w-4 ml-2" />
          ) : (
            <ChevronDown className="h-4 w-4 ml-2" />
          )}
        </Button>
        <Button variant="outline" onClick={saveCurrentSearch}>
          <Save className="h-4 w-4 mr-2" />
          Save
        </Button>
      </div>

      {/* Search History and Suggestions */}
      {searchQuery && (
        <div className="flex flex-wrap gap-2">
          {searchResults.suggestions?.slice(0, 5).map((suggestion, index) => (
            <Badge
              key={index}
              variant="secondary"
              className="cursor-pointer"
              onClick={() => setSearchQuery(suggestion)}
            >
              {suggestion}
            </Badge>
          ))}
        </div>
      )}

      {/* Advanced Filters */}
      {isAdvancedOpen && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Advanced Filters</CardTitle>
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-2" />
                Clear All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Whiskey Types */}
              <div>
                <h4 className="font-medium mb-3">Whiskey Types</h4>
                <div className="space-y-2">
                  {searchResults.facets.whiskeyTypes.map((facet) => (
                    <div key={facet.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`whiskey-${facet.value}`}
                        checked={selectedWhiskeyTypes.includes(facet.value)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedWhiskeyTypes(prev => [...prev, facet.value])
                          } else {
                            setSelectedWhiskeyTypes(prev => prev.filter(t => t !== facet.value))
                          }
                        }}
                      />
                      <label
                        htmlFor={`whiskey-${facet.value}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {facet.label} ({facet.count})
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Complexity */}
              <div>
                <h4 className="font-medium mb-3">Complexity</h4>
                <div className="space-y-2">
                  {searchResults.facets.complexity.map((facet) => (
                    <div key={facet.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`complexity-${facet.value}`}
                        checked={selectedComplexity.includes(facet.value as ComplexityLevel)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedComplexity(prev => [...prev, facet.value as ComplexityLevel])
                          } else {
                            setSelectedComplexity(prev => prev.filter(c => c !== facet.value))
                          }
                        }}
                      />
                      <label
                        htmlFor={`complexity-${facet.value}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {facet.label} ({facet.count})
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div>
                <h4 className="font-medium mb-3">Tags</h4>
                <ScrollArea className="h-32">
                  <div className="space-y-2">
                    {searchResults.facets.tags.slice(0, 10).map((facet) => (
                      <div key={facet.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`tag-${facet.value}`}
                          checked={selectedTags.includes(facet.value)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedTags(prev => [...prev, facet.value])
                            } else {
                              setSelectedTags(prev => prev.filter(t => t !== facet.value))
                            }
                          }}
                        />
                        <label
                          htmlFor={`tag-${facet.value}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          {facet.label} ({facet.count})
                        </label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Mash Bill Pattern */}
              <div>
                <label className="text-sm font-medium mb-2 block">Mash Bill Pattern</label>
                <Input
                  placeholder="e.g., 75-21-00-04"
                  value={mashBillPattern}
                  onChange={(e) => setMashBillPattern(e.target.value)}
                />
              </div>

              {/* Minimum Rating */}
              <div>
                <label className="text-sm font-medium mb-2 block">Minimum Rating</label>
                <Select
                  value={minRating?.toString() || ''}
                  onValueChange={(value) => setMinRating(value ? parseFloat(value) : undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any rating" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any rating</SelectItem>
                    <SelectItem value="1">1+ stars</SelectItem>
                    <SelectItem value="2">2+ stars</SelectItem>
                    <SelectItem value="3">3+ stars</SelectItem>
                    <SelectItem value="4">4+ stars</SelectItem>
                    <SelectItem value="5">5 stars</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort By */}
              <div>
                <label className="text-sm font-medium mb-2 block">Sort By</label>
                <Select
                  value={sortBy}
                  onValueChange={(value) => setSortBy(value as TemplateSortBy)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TemplateSortBy.NAME}>Name</SelectItem>
                    <SelectItem value={TemplateSortBy.CREATED_AT}>Created Date</SelectItem>
                    <SelectItem value={TemplateSortBy.UPDATED_AT}>Updated Date</SelectItem>
                    <SelectItem value={TemplateSortBy.USE_COUNT}>Popularity</SelectItem>
                    <SelectItem value={TemplateSortBy.RATING}>Rating</SelectItem>
                    <SelectItem value={TemplateSortBy.COMPLEXITY}>Complexity</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort Order */}
              <div>
                <label className="text-sm font-medium mb-2 block">Sort Order</label>
                <Select
                  value={sortOrder}
                  onValueChange={(value) => setSortOrder(value as SortOrder)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SortOrder.ASC}>Ascending</SelectItem>
                    <SelectItem value={SortOrder.DESC}>Descending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Quick Filters */}
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="favorites-only"
                  checked={isFavoritesOnly}
                  onCheckedChange={(checked) => setIsFavoritesOnly(checked as boolean)}
                />
                <label htmlFor="favorites-only" className="text-sm font-medium cursor-pointer">
                  <Star className="h-4 w-4 inline mr-1" />
                  Favorites only
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="public-only"
                  checked={isPublicOnly === true}
                  onCheckedChange={(checked) => setIsPublicOnly(checked ? true : undefined)}
                />
                <label htmlFor="public-only" className="text-sm font-medium cursor-pointer">
                  <Users className="h-4 w-4 inline mr-1" />
                  Public templates only
                </label>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Saved Searches */}
      {savedSearches.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center">
              <History className="h-4 w-4 mr-2" />
              Saved Searches
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {savedSearches.slice(0, 5).map((savedSearch) => (
                <Badge
                  key={savedSearch.id}
                  variant="outline"
                  className="cursor-pointer"
                  onClick={() => loadSavedSearch(savedSearch)}
                >
                  {savedSearch.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Filters Display */}
      {(selectedWhiskeyTypes.length > 0 || 
        selectedComplexity.length > 0 || 
        selectedTags.length > 0 || 
        mashBillPattern ||
        isFavoritesOnly ||
        isPublicOnly ||
        minRating) && (
        <div className="flex flex-wrap gap-2">
          <span className="text-sm font-medium">Active filters:</span>
          {selectedWhiskeyTypes.map(type => (
            <Badge key={type} variant="secondary">
              {type}
              <X 
                className="h-3 w-3 ml-1 cursor-pointer" 
                onClick={() => setSelectedWhiskeyTypes(prev => prev.filter(t => t !== type))}
              />
            </Badge>
          ))}
          {selectedComplexity.map(complexity => (
            <Badge key={complexity} variant="secondary">
              {complexity}
              <X 
                className="h-3 w-3 ml-1 cursor-pointer" 
                onClick={() => setSelectedComplexity(prev => prev.filter(c => c !== complexity))}
              />
            </Badge>
          ))}
          {selectedTags.map(tag => (
            <Badge key={tag} variant="secondary">
              {tag}
              <X 
                className="h-3 w-3 ml-1 cursor-pointer" 
                onClick={() => setSelectedTags(prev => prev.filter(t => t !== tag))}
              />
            </Badge>
          ))}
          {mashBillPattern && (
            <Badge variant="secondary">
              Mash Bill: {mashBillPattern}
              <X 
                className="h-3 w-3 ml-1 cursor-pointer" 
                onClick={() => setMashBillPattern('')}
              />
            </Badge>
          )}
          {isFavoritesOnly && (
            <Badge variant="secondary">
              Favorites
              <X 
                className="h-3 w-3 ml-1 cursor-pointer" 
                onClick={() => setIsFavoritesOnly(false)}
              />
            </Badge>
          )}
          {isPublicOnly && (
            <Badge variant="secondary">
              Public
              <X 
                className="h-3 w-3 ml-1 cursor-pointer" 
                onClick={() => setIsPublicOnly(undefined)}
              />
            </Badge>
          )}
          {minRating && (
            <Badge variant="secondary">
              {minRating}+ stars
              <X 
                className="h-3 w-3 ml-1 cursor-pointer" 
                onClick={() => setMinRating(undefined)}
              />
            </Badge>
          )}
        </div>
      )}

      {/* Results Summary */}
      <div className="text-sm text-muted-foreground">
        {searchResults.totalCount} template{searchResults.totalCount !== 1 ? 's' : ''} found
      </div>
    </div>
  )
}

// Helper functions
function calculateFacets(templates: RecipeTemplate[]): SearchFacets {
  const whiskeyTypeCounts = new Map<string, number>()
  const complexityCounts = new Map<string, number>()
  const tagCounts = new Map<string, number>()
  const customerCounts = new Map<string, number>()
  const ingredientTypeCounts = new Map<string, number>()

  templates.forEach(template => {
    // Whiskey types
    whiskeyTypeCounts.set(
      template.whiskeyType,
      (whiskeyTypeCounts.get(template.whiskeyType) || 0) + 1
    )

    // Complexity
    complexityCounts.set(
      template.complexity,
      (complexityCounts.get(template.complexity) || 0) + 1
    )

    // Tags
    template.tags.forEach(tag => {
      tagCounts.set(tag.name, (tagCounts.get(tag.name) || 0) + 1)
    })

    // Customers
    if (template.customerName) {
      customerCounts.set(
        template.customerName,
        (customerCounts.get(template.customerName) || 0) + 1
      )
    }

    // Ingredient types (from mash bill)
    template.mashBill.forEach(component => {
      ingredientTypeCounts.set(
        component.ingredientType,
        (ingredientTypeCounts.get(component.ingredientType) || 0) + 1
      )
    })
  })

  return {
    whiskeyTypes: Array.from(whiskeyTypeCounts.entries()).map(([value, count]) => ({
      value,
      label: value,
      count
    })),
    complexity: Array.from(complexityCounts.entries()).map(([value, count]) => ({
      value,
      label: value.charAt(0).toUpperCase() + value.slice(1),
      count
    })),
    tags: Array.from(tagCounts.entries())
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => b.count - a.count),
    customers: Array.from(customerCounts.entries()).map(([value, count]) => ({
      value,
      label: value,
      count
    })),
    ingredientTypes: Array.from(ingredientTypeCounts.entries()).map(([value, count]) => ({
      value,
      label: value.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      count
    }))
  }
}

function sortTemplates(
  templates: RecipeTemplate[],
  sortBy: TemplateSortBy,
  sortOrder: SortOrder
): RecipeTemplate[] {
  const sorted = [...templates].sort((a, b) => {
    let comparison = 0

    switch (sortBy) {
      case TemplateSortBy.NAME:
        comparison = a.name.localeCompare(b.name)
        break
      case TemplateSortBy.CREATED_AT:
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        break
      case TemplateSortBy.UPDATED_AT:
        comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
        break
      case TemplateSortBy.USE_COUNT:
        comparison = a.useCount - b.useCount
        break
      case TemplateSortBy.RATING:
        comparison = (a.averageRating || 0) - (b.averageRating || 0)
        break
      case TemplateSortBy.COMPLEXITY:
        const complexityOrder = {
          [ComplexityLevel.BEGINNER]: 1,
          [ComplexityLevel.INTERMEDIATE]: 2,
          [ComplexityLevel.ADVANCED]: 3,
          [ComplexityLevel.EXPERT]: 4
        }
        comparison = complexityOrder[a.complexity] - complexityOrder[b.complexity]
        break
      case TemplateSortBy.CUSTOMER:
        comparison = (a.customerName || '').localeCompare(b.customerName || '')
        break
    }

    return sortOrder === SortOrder.DESC ? -comparison : comparison
  })

  return sorted
}

function generateSearchSuggestions(query: string, templates: RecipeTemplate[]): string[] {
  if (!query || query.length < 2) return []

  const suggestions = new Set<string>()
  const queryLower = query.toLowerCase()

  templates.forEach(template => {
    // Template names
    if (template.name.toLowerCase().includes(queryLower)) {
      suggestions.add(template.name)
    }

    // Whiskey types
    if (template.whiskeyType.toLowerCase().includes(queryLower)) {
      suggestions.add(template.whiskeyType)
    }

    // Customer names
    if (template.customerName?.toLowerCase().includes(queryLower)) {
      suggestions.add(template.customerName)
    }

    // Tags
    template.tags.forEach(tag => {
      if (tag.name.toLowerCase().includes(queryLower)) {
        suggestions.add(tag.name)
      }
    })

    // Mash bill patterns
    if (template.mashBillPattern.includes(query)) {
      suggestions.add(template.mashBillPattern)
    }
  })

  return Array.from(suggestions).slice(0, 10)
} 