'use client'

import React from 'react'
import { useQuery, gql } from '@apollo/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, History, GitBranch, CheckCircle2, ExternalLink } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const GET_RECIPE_REVISION_HISTORY = gql`
  query GetRecipeRevisionHistory($recipeId: String!) {
    getRecipeRevisionHistory(recipeId: $recipeId)
  }
`

interface RecipeRevision {
  id: string
  Recipe: string
  revision: number
  baseRecipeName: string
  active: boolean
  createdAt: string
  createdBy: string
  parentRecipeId?: string
  parentRecipe?: {
    id: string
    Recipe: string
    revision: number
  }
  childRevisions?: Array<{
    id: string
    Recipe: string
    revision: number
  }>
}

interface RevisionHistoryProps {
  recipeId: string
  currentRevision?: number
  onSelectRevision?: (recipeId: string) => void
}

export function RevisionHistory({ recipeId, currentRevision, onSelectRevision }: RevisionHistoryProps) {
  const { data, loading, error } = useQuery(GET_RECIPE_REVISION_HISTORY, {
    variables: { recipeId },
    skip: !recipeId,
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading revision history...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-sm text-destructive py-2">
        Failed to load revision history
      </div>
    )
  }

  const revisions: RecipeRevision[] = data?.getRecipeRevisionHistory || []

  if (revisions.length <= 1) {
    return (
      <div className="text-sm text-muted-foreground py-2 flex items-center">
        <History className="h-4 w-4 mr-2" />
        No previous revisions
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center">
          <GitBranch className="h-4 w-4 mr-2" />
          Revision History ({revisions.length} revisions)
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {revisions.map((rev) => (
            <div
              key={rev.id}
              className={`flex items-center justify-between p-2 rounded-md text-sm ${
                rev.id === recipeId
                  ? 'bg-primary/10 border border-primary/20'
                  : 'hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Badge variant={rev.active ? 'default' : 'secondary'} className="text-xs">
                  R{rev.revision?.toString().padStart(2, '0')}
                </Badge>
                <span className="font-mono text-xs">{rev.Recipe}</span>
                {rev.id === recipeId && (
                  <CheckCircle2 className="h-3 w-3 text-primary" />
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {rev.active ? (
                  <Badge variant="outline" className="text-xs">Active</Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">Inactive</Badge>
                )}
                <span>
                  {rev.createdAt && formatDistanceToNow(new Date(rev.createdAt), { addSuffix: true })}
                </span>
                {rev.id !== recipeId && onSelectRevision && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => onSelectRevision(rev.id)}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    View
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// Compact version for inline display
export function RevisionBadge({ revision, baseRecipeName }: { revision: number; baseRecipeName?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="text-xs">
        Rev {revision}
      </Badge>
      {baseRecipeName && (
        <span className="text-xs text-muted-foreground font-mono">
          {baseRecipeName}
        </span>
      )}
    </div>
  )
}
