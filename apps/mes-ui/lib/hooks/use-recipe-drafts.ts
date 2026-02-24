import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'

// Draft data structure
export interface RecipeDraft {
  id: string
  name: string
  data: Record<string, unknown>
  createdAt: string
  updatedAt: string
  currentStep: number
  isAutoSave: boolean
}

// Hook configuration
interface UseRecipeDraftsOptions {
  autoSaveInterval?: number // milliseconds
  maxDrafts?: number
  storageKey?: string
}

const DEFAULT_OPTIONS: Required<UseRecipeDraftsOptions> = {
  autoSaveInterval: 30000, // 30 seconds
  maxDrafts: 10,
  storageKey: 'mes-ui-recipe-drafts'
}

export function useRecipeDrafts(options: UseRecipeDraftsOptions = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options }
  const [drafts, setDrafts] = useState<RecipeDraft[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  // Load drafts from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(config.storageKey)
      if (stored) {
        const parsedDrafts = JSON.parse(stored) as RecipeDraft[]
        setDrafts(parsedDrafts)
      }
    } catch (error) {
      console.error('Failed to load recipe drafts:', error)
      toast.error('Failed to load saved drafts')
    } finally {
      setIsLoaded(true)
    }
  }, [config.storageKey])

  // Save drafts to localStorage
  const saveDraftsToStorage = useCallback((updatedDrafts: RecipeDraft[]) => {
    try {
      localStorage.setItem(config.storageKey, JSON.stringify(updatedDrafts))
    } catch (error) {
      console.error('Failed to save recipe drafts:', error)
      toast.error('Failed to save draft to storage')
    }
  }, [config.storageKey])

  // Generate a unique draft ID
  const generateDraftId = useCallback(() => {
    return `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }, [])

  // Generate draft name from data
  const generateDraftName = useCallback((data: Record<string, unknown>): string => {
    const details = data['details'] as Record<string, unknown> | undefined
    const recipeName = details?.['recipeName'] || details?.['Recipe']
    const customerName = details?.['customerName'] || details?.['customerCode']
    
    if (recipeName && typeof recipeName === 'string') {
      return customerName && typeof customerName === 'string' 
        ? `${recipeName} (${customerName})` 
        : recipeName
    }
    
    return `Untitled Recipe - ${new Date().toLocaleDateString()}`
  }, [])

  // Save or update a draft
  const saveDraft = useCallback((
    data: Record<string, unknown>,
    currentStep: number = 0,
    isAutoSave: boolean = false,
    existingDraftId?: string
  ): string => {
    const now = new Date().toISOString()
    const draftName = generateDraftName(data)
    
    setDrafts(prevDrafts => {
      let updatedDrafts: RecipeDraft[]
      
      if (existingDraftId) {
        // Update existing draft
        updatedDrafts = prevDrafts.map(draft =>
          draft.id === existingDraftId
            ? {
                ...draft,
                name: draftName,
                data,
                updatedAt: now,
                currentStep,
                isAutoSave
              }
            : draft
        )
      } else {
        // Create new draft
        const newDraft: RecipeDraft = {
          id: generateDraftId(),
          name: draftName,
          data,
          createdAt: now,
          updatedAt: now,
          currentStep,
          isAutoSave
        }
        
        // Add new draft and limit total number
        updatedDrafts = [newDraft, ...prevDrafts].slice(0, config.maxDrafts)
      }
      
      saveDraftsToStorage(updatedDrafts)
      
      if (!isAutoSave) {
        toast.success(`Recipe draft "${draftName}" saved successfully!`)
      }
      
      return updatedDrafts
    })
    
    return existingDraftId || generateDraftId()
  }, [generateDraftId, generateDraftName, saveDraftsToStorage, config.maxDrafts])

  // Load a specific draft
  const loadDraft = useCallback((draftId: string): RecipeDraft | null => {
    const draft = drafts.find(d => d.id === draftId)
    if (draft) {
      toast.success(`Loaded draft: ${draft.name}`)
      return draft
    }
    toast.error('Draft not found')
    return null
  }, [drafts])

  // Delete a draft
  const deleteDraft = useCallback((draftId: string) => {
    setDrafts(prevDrafts => {
      const updatedDrafts = prevDrafts.filter(draft => draft.id !== draftId)
      saveDraftsToStorage(updatedDrafts)
      
      const deletedDraft = prevDrafts.find(d => d.id === draftId)
      if (deletedDraft) {
        toast.success(`Deleted draft: ${deletedDraft.name}`)
      }
      
      return updatedDrafts
    })
  }, [saveDraftsToStorage])

  // Clear all drafts
  const clearAllDrafts = useCallback(() => {
    setDrafts([])
    saveDraftsToStorage([])
    toast.success('All drafts cleared')
  }, [saveDraftsToStorage])

  // Get drafts sorted by most recent
  const getSortedDrafts = useCallback(() => {
    return [...drafts].sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  }, [drafts])

  // Get recent drafts (last 5)
  const getRecentDrafts = useCallback(() => {
    return getSortedDrafts().slice(0, 5)
  }, [getSortedDrafts])

  // Check if data has changed significantly (for auto-save optimization)
  const hasSignificantChanges = useCallback((
    oldData: Record<string, unknown>,
    newData: Record<string, unknown>
  ): boolean => {
    // Simple comparison - could be enhanced with deep comparison
    return JSON.stringify(oldData) !== JSON.stringify(newData)
  }, [])

  return {
    // State
    drafts: getSortedDrafts(),
    recentDrafts: getRecentDrafts(),
    isLoaded,
    
    // Actions
    saveDraft,
    loadDraft,
    deleteDraft,
    clearAllDrafts,
    
    // Utilities
    generateDraftName,
    hasSignificantChanges,
    
    // Config
    config
  }
} 