'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, FolderOpen, Trash2, Clock, Calendar, User } from 'lucide-react'
import { useProductionOrderDrafts, type ProductionOrderDraft } from '@/lib/hooks/use-production-order-drafts'

interface ProductionOrderDraftManagerProps {
  onLoadDraft?: (draft: ProductionOrderDraft) => void
  className?: string
}

export function ProductionOrderDraftManager({ onLoadDraft, className }: ProductionOrderDraftManagerProps) {
  const { 
    drafts, 
    deleteDraft, 
    clearAllDrafts, 
    isLoaded 
  } = useProductionOrderDrafts()

  const handleLoadDraft = (draft: ProductionOrderDraft) => {
    if (onLoadDraft) {
      onLoadDraft(draft)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)
    
    if (diffInHours < 1) {
      const diffInMinutes = Math.floor(diffInHours * 60)
      return `${diffInMinutes} minute${diffInMinutes !== 1 ? 's' : ''} ago`
    } else if (diffInHours < 24) {
      const hours = Math.floor(diffInHours)
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`
    } else {
      return date.toLocaleDateString()
    }
  }

  if (!isLoaded) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="text-muted-foreground">Loading drafts...</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (drafts.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Production Order Drafts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <FolderOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No drafts found</h3>
            <p className="text-muted-foreground">
              Start creating a production order to save drafts automatically.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Production Order Drafts ({drafts.length})
          </CardTitle>
          {drafts.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearAllDrafts}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {drafts.map((draft) => (
          <div
            key={draft.id}
            className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-medium truncate">{draft.name}</h4>
                {draft.isAutoSave && (
                  <Badge variant="secondary" className="text-xs">
                    <Clock className="w-3 h-3 mr-1" />
                    Auto-saved
                  </Badge>
                )}
              </div>
              
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  <span>Updated {formatDate(draft.updatedAt)}</span>
                </div>
                
                <div className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  <span>Step {draft.currentStep + 1}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleLoadDraft(draft)}
              >
                Load
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => deleteDraft(draft.id)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
} 