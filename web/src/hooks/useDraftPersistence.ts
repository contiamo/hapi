import { useEffect, useMemo, useRef } from 'react'
import type { ApiClient } from '@/api/client'
import type { AssistantApi } from '@assistant-ui/react'
import {
  getDraft,
  getDraftWithTimestamp,
  saveDraft as saveDraftLocal,
  clearDraft as clearDraftLocal,
  mergeDrafts
} from '@/lib/draft-store'
import { debounce } from '@/lib/utils'

export interface UseDraftPersistenceOptions {
  sessionId: string | null
  text: string
  apiClient: ApiClient
  assistantApi: AssistantApi
  enabled?: boolean
}

/**
 * Hook for managing draft persistence with localStorage and server sync.
 *
 * Features:
 * - Restores drafts on session open (merges local vs server by timestamp)
 * - Auto-saves drafts with 1-second debounce
 * - Optimistic localStorage updates
 * - Handles race conditions with AbortController
 * - Provides manual clearDraft for send operations
 */
export function useDraftPersistence({
  sessionId,
  text,
  apiClient,
  assistantApi,
  enabled = true
}: UseDraftPersistenceOptions) {
  const restoredSessions = useRef<Set<string>>(new Set())

  // Draft restoration: Fetch and merge drafts on session open
  useEffect(() => {
    if (!enabled || !sessionId || restoredSessions.current.has(sessionId)) {
      return
    }

    const abortController = new AbortController()

    const fetchAndMergeDraft = async () => {
      try {
        // Fetch server draft (TODO: pass abort signal when API supports it)
        const serverDraft = await apiClient.getDraft(sessionId)

        // Check if this request was aborted
        if (abortController.signal.aborted) return

        // Get local draft with timestamp
        const localDraft = getDraftWithTimestamp(sessionId)

        // Merge: take newer by timestamp
        const merged = mergeDrafts(localDraft, serverDraft)

        if (merged?.text) {
          // Check if server had different draft
          if (serverDraft && localDraft && serverDraft.text !== localDraft.text) {
            console.info('[useDraftPersistence] Draft updated from another device')
          }

          // Restore merged draft to composer
          assistantApi.composer().setText(merged.text)

          // Save merged to localStorage
          saveDraftLocal(sessionId, merged.text, merged.timestamp)
        }
      } catch (error) {
        // Ignore aborted requests
        if (abortController.signal.aborted) return

        console.error('[useDraftPersistence] Failed to fetch draft:', error)

        // Fallback to localStorage only
        const localDraft = getDraft(sessionId)
        if (localDraft) {
          assistantApi.composer().setText(localDraft)
        }
      }

      // Mark this session as restored
      restoredSessions.current.add(sessionId)
    }

    fetchAndMergeDraft()

    // Cleanup: abort in-flight requests when session changes (fixes race condition)
    return () => {
      abortController.abort()
    }
  }, [sessionId, apiClient, assistantApi, enabled])

  // Draft persistence: Debounced save on text change
  // Use ref to avoid closure staleness issues
  const latestTextRef = useRef(text)
  latestTextRef.current = text

  const debouncedSave = useMemo(
    () =>
      debounce(async (sid: string) => {
        const currentText = latestTextRef.current

        if (currentText.trim()) {
          const timestamp = Date.now()

          // Save locally immediately (optimistic)
          saveDraftLocal(sid, currentText, timestamp)

          // Sync to server (fire-and-forget)
          try {
            const result = await apiClient.saveDraft(sid, currentText, timestamp)

            // Check if server returned different draft (LWW rejected ours)
            if (result.text !== currentText || result.timestamp !== timestamp) {
              console.info('[useDraftPersistence] Draft conflict: server had newer version', {
                local: timestamp,
                server: result.timestamp
              })
            }
          } catch (error) {
            console.error('[useDraftPersistence] Draft sync failed:', error)
            // Local draft still saved, will sync on next session open
          }
        } else {
          // Clear locally first (optimistic)
          clearDraftLocal(sid)

          // Clear on server
          try {
            await apiClient.clearDraft(sid)
          } catch (err) {
            console.error('[useDraftPersistence] Failed to clear draft on server:', err)
          }
        }
      }, 1000),
    [apiClient]
  )

  useEffect(() => {
    if (!enabled || !sessionId) return

    debouncedSave(sessionId)

    return () => debouncedSave.cancel()
  }, [text, sessionId, debouncedSave, enabled])

  // Return clearDraft for manual clearing (e.g., on send)
  const clearDraft = async () => {
    if (!sessionId) return

    clearDraftLocal(sessionId)

    try {
      await apiClient.clearDraft(sessionId)
    } catch (err) {
      console.error('[useDraftPersistence] Failed to clear draft:', err)
    }
  }

  return { clearDraft }
}
