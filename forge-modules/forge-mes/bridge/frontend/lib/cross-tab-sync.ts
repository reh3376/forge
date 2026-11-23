/**
 * Cross-Tab Synchronization Service for MSAL Token Persistence Enhancement
 * 
 * This service manages authentication state synchronization across browser tabs
 * using localStorage events and custom messaging to ensure all tabs reflect
 * the current authentication state in real-time.
 */

import { AccountInfo } from '@azure/msal-browser'
import { ManufacturingUser } from './auth-context'

// Cross-tab sync event types
export enum CrossTabEventType {
  AUTH_STATE_CHANGED = 'auth_state_changed',
  TOKEN_REFRESHED = 'token_refreshed',
  USER_SIGNED_OUT = 'user_signed_out',
  USER_SIGNED_IN = 'user_signed_in',
  SESSION_EXPIRED = 'session_expired',
  ACCOUNT_SWITCHED = 'account_switched'
}

// Cross-tab sync event data interface
export interface CrossTabSyncEvent {
  type: CrossTabEventType
  timestamp: number
  tabId: string
  data: {
    isAuthenticated?: boolean
    account?: AccountInfo | null
    user?: ManufacturingUser | null
    error?: string | null
    sessionId?: string
    [key: string]: unknown
  }
}

// Cross-tab sync listener callback type
export type CrossTabSyncListener = (event: CrossTabSyncEvent) => void

/**
 * Cross-Tab Synchronization Service Class
 */
export class CrossTabSyncService {
  private static instance: CrossTabSyncService
  private listeners: Set<CrossTabSyncListener> = new Set()
  private tabId: string
  private isListening: boolean = false
  private readonly STORAGE_KEY = 'msal_cross_tab_sync'
  private readonly CLEANUP_INTERVAL = 30000 // 30 seconds
  private cleanupTimer: NodeJS.Timeout | null = null

  private constructor() {
    // Generate unique tab ID
    this.tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    console.log('🔄 CrossTabSyncService initialized for tab:', this.tabId)
  }

  public static getInstance(): CrossTabSyncService {
    if (!CrossTabSyncService.instance) {
      CrossTabSyncService.instance = new CrossTabSyncService()
    }
    return CrossTabSyncService.instance
  }

  /**
   * Start listening for cross-tab sync events
   */
  public startListening(): void {
    if (this.isListening) {
      console.log('🔄 CrossTabSyncService already listening')
      return
    }

    console.log('🔄 Starting cross-tab sync listener for tab:', this.tabId)
    
    // Listen for localStorage changes from other tabs
    window.addEventListener('storage', this.handleStorageEvent)
    
    // Listen for beforeunload to cleanup on tab close
    window.addEventListener('beforeunload', this.handleTabClose)
    
    // Start cleanup timer for old events
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldEvents()
    }, this.CLEANUP_INTERVAL)
    
    this.isListening = true
    console.log('🔄 Cross-tab sync listener started successfully')
  }

  /**
   * Stop listening for cross-tab sync events
   */
  public stopListening(): void {
    if (!this.isListening) {
      return
    }

    console.log('🔄 Stopping cross-tab sync listener for tab:', this.tabId)
    
    window.removeEventListener('storage', this.handleStorageEvent)
    window.removeEventListener('beforeunload', this.handleTabClose)
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    
    this.isListening = false
    console.log('🔄 Cross-tab sync listener stopped')
  }

  /**
   * Add a listener for cross-tab sync events
   */
  public addListener(listener: CrossTabSyncListener): void {
    this.listeners.add(listener)
    console.log('🔄 Added cross-tab sync listener, total listeners:', this.listeners.size)
  }

  /**
   * Remove a listener for cross-tab sync events
   */
  public removeListener(listener: CrossTabSyncListener): void {
    this.listeners.delete(listener)
    console.log('🔄 Removed cross-tab sync listener, total listeners:', this.listeners.size)
  }

  /**
   * Broadcast an authentication state change to all other tabs
   */
  public broadcastAuthStateChange(
    type: CrossTabEventType,
    data: {
      isAuthenticated?: boolean
      account?: AccountInfo | null
      user?: ManufacturingUser | null
      error?: string | null
      sessionId?: string
      [key: string]: unknown
    }
  ): void {
    const event: CrossTabSyncEvent = {
      type,
      timestamp: Date.now(),
      tabId: this.tabId,
      data
    }

    console.log('🔄 Broadcasting cross-tab sync event:', {
      type,
      tabId: this.tabId,
      dataKeys: Object.keys(data)
    })

    try {
      // Store the event in localStorage to trigger storage events in other tabs
      const existingEvents = this.getStoredEvents()
      existingEvents.push(event)
      
      // Keep only the last 10 events to prevent localStorage bloat
      const recentEvents = existingEvents.slice(-10)
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(recentEvents))
      
      console.log('🔄 Cross-tab sync event broadcasted successfully')
    } catch (error) {
      console.error('🔄 Failed to broadcast cross-tab sync event:', error)
    }
  }

  /**
   * Handle localStorage storage events from other tabs
   */
  private handleStorageEvent = (event: StorageEvent): void => {
    // Only handle our specific storage key
    if (event.key !== this.STORAGE_KEY) {
      return
    }

    console.log('🔄 Received storage event from another tab')

    try {
      const events = this.getStoredEvents()
      
      // Find new events (events not from this tab and newer than last processed)
      const newEvents = events.filter(syncEvent => 
        syncEvent.tabId !== this.tabId && 
        syncEvent.timestamp > (Date.now() - 60000) // Only process events from last minute
      )

      console.log('🔄 Processing', newEvents.length, 'new cross-tab sync events')

      // Notify all listeners of new events
      newEvents.forEach(syncEvent => {
        console.log('🔄 Processing cross-tab sync event:', {
          type: syncEvent.type,
          fromTab: syncEvent.tabId,
          timestamp: new Date(syncEvent.timestamp).toISOString()
        })

        this.listeners.forEach(listener => {
          try {
            listener(syncEvent)
          } catch (error) {
            console.error('🔄 Error in cross-tab sync listener:', error)
          }
        })
      })
    } catch (error) {
      console.error('🔄 Error processing storage event:', error)
    }
  }

  /**
   * Handle tab close event
   */
  private handleTabClose = (): void => {
    console.log('🔄 Tab closing, cleaning up cross-tab sync')
    this.stopListening()
  }

  /**
   * Get stored events from localStorage
   */
  private getStoredEvents(): CrossTabSyncEvent[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch (error) {
      console.error('🔄 Error reading stored cross-tab sync events:', error)
      return []
    }
  }

  /**
   * Clean up old events from localStorage
   */
  private cleanupOldEvents(): void {
    try {
      const events = this.getStoredEvents()
      const cutoffTime = Date.now() - (5 * 60 * 1000) // 5 minutes ago
      
      const recentEvents = events.filter(event => event.timestamp > cutoffTime)
      
      if (recentEvents.length !== events.length) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(recentEvents))
        console.log('🔄 Cleaned up', events.length - recentEvents.length, 'old cross-tab sync events')
      }
    } catch (error) {
      console.error('🔄 Error cleaning up old events:', error)
    }
  }

  /**
   * Get current tab ID
   */
  public getTabId(): string {
    return this.tabId
  }

  /**
   * Check if service is currently listening
   */
  public isCurrentlyListening(): boolean {
    return this.isListening
  }
}

// Export singleton instance and utility functions
export const crossTabSync = CrossTabSyncService.getInstance()

// Utility functions for easy integration
export const startCrossTabSync = () => crossTabSync.startListening()
export const stopCrossTabSync = () => crossTabSync.stopListening()
export const addCrossTabListener = (listener: CrossTabSyncListener) => crossTabSync.addListener(listener)
export const removeCrossTabListener = (listener: CrossTabSyncListener) => crossTabSync.removeListener(listener)
export const broadcastAuthChange = (
  type: CrossTabEventType,
  data: CrossTabSyncEvent['data']
) => crossTabSync.broadcastAuthStateChange(type, data) 